package handler

import (
	"context"
	"database/sql"
	"errors"
	"net/http"

	"mycount/core/auth"
	"mycount/core/httpx"
	"mycount/core/resource"
	"mycount/storage"
)

// Un mouvement validé répercute ses parts sur ACTION.nb_part_acquis dans la même
// transaction : achat en plus, vente en moins. Modifier ou supprimer un mouvement
// applique la différence, les parts détenues restent donc cohérentes avec le journal.

const (
	queryInsertMouvement = `
		INSERT INTO MOUVEMENT (id_action, date, sens, nb_part, prix)
		SELECT a.id_action, ?, ?, ?, ?
		FROM ACTION a
		JOIN PROFIL_INVEST p ON p.id_profil_inv = a.id_profil_inv
		WHERE a.id_action = ? AND p.id_utilisateur = ?
		RETURNING id_mouvement
	`
	queryOwnedMouvement = `
		SELECT m.id_action, m.sens, m.nb_part
		FROM MOUVEMENT m
		JOIN ACTION a ON a.id_action = m.id_action
		JOIN PROFIL_INVEST p ON p.id_profil_inv = a.id_profil_inv
		WHERE m.id_mouvement = ? AND p.id_utilisateur = ?
	`
	queryUpdateMouvement = `UPDATE MOUVEMENT SET date = ?, nb_part = ?, prix = ? WHERE id_mouvement = ?`
	queryDeleteMouvement = `DELETE FROM MOUVEMENT WHERE id_mouvement = ?`
	// Refus d'une vente au-delà des parts détenues : rien ne change si le WHERE échoue.
	// Une position vendue jusqu'à 0 part s'archive d'elle-même (masquée, journal conservé) ;
	// un achat la remet en service. Ligne renvoyée avec son état d'archivage.
	// Parts arrondies à 6 décimales : les résidus de virgule flottante (0,3 − 0,1 − 0,2 =
	// −2,7e-17) valent 0, sinon la vente du solde serait refusée ou laisserait une poussière.
	// ?1 : variation de parts, ?2 : position. Toutes les expressions lisent l'ancienne ligne.
	queryShiftParts = `
		UPDATE ACTION SET
			nb_part_acquis = CASE
				WHEN round(coalesce(nb_part_acquis, 0) + ?1, 6) <= 0 THEN 0.0
				ELSE round(coalesce(nb_part_acquis, 0) + ?1, 6) END,
			archive_le = CASE
				WHEN round(coalesce(nb_part_acquis, 0) + ?1, 6) <= 0 THEN coalesce(archive_le, date('now'))
				WHEN ?1 > 0 THEN NULL
				ELSE archive_le END
		WHERE id_action = ?2 AND round(coalesce(nb_part_acquis, 0) + ?1, 6) >= 0
		RETURNING nb_part_acquis, archive_le
	`

	sensAchat = "achat"
	sensVente = "vente"
)

// Mouvement n'est lu que pour l'instantané ; l'écriture passe par ce fichier.
var Mouvement = resource.Spec{
	Table:        "MOUVEMENT",
	ParentColumn: "id_action",
	OwnedIDs: `SELECT a.id_action FROM ACTION a
		JOIN PROFIL_INVEST p ON p.id_profil_inv = a.id_profil_inv
		WHERE p.id_utilisateur = ?`,
	Returned: "id_mouvement, id_action, date, sens, nb_part, prix",
}

type mouvementFields struct {
	Date   string   `json:"date"`
	NbPart float64  `json:"nb_part"`
	Prix   *float64 `json:"prix"`
}

type mouvementCreate struct {
	IDAction int64  `json:"id_action"`
	Sens     string `json:"sens"`
	mouvementFields
}

type mouvementsRequest struct {
	Mouvements []mouvementCreate `json:"mouvements"`
}

type actionParts struct {
	IDAction     int64   `json:"id_action"`
	NbPartAcquis float64 `json:"nb_part_acquis"`
	ArchiveLe    *string `json:"archive_le"`
}

type mouvementsResponse struct {
	IDs     []int64       `json:"ids"`
	Actions []actionParts `json:"actions"`
}

// CreateMouvements valide plusieurs mouvements d'un coup : tout passe ou rien.
// La réponse donne les ids créés, dans l'ordre reçu, et les parts détenues à jour.
func CreateMouvements(w http.ResponseWriter, r *http.Request) {
	var req mouvementsRequest
	if err := httpx.DecodeJSON(w, r, &req); err != nil || len(req.Mouvements) == 0 {
		httpx.WriteError(w, http.StatusBadRequest, "errors.invalidBody")
		return
	}
	for _, m := range req.Mouvements {
		if m.Sens != sensAchat && m.Sens != sensVente {
			httpx.WriteError(w, http.StatusBadRequest, "errors.invalidBody")
			return
		}
	}

	ctx := r.Context()
	userID := auth.UserID(r)

	tx, err := storage.DB().BeginTx(ctx, nil)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "errors.database")
		return
	}
	defer func() { _ = tx.Rollback() }()

	res := mouvementsResponse{IDs: make([]int64, 0, len(req.Mouvements))}
	parts := map[int64]actionParts{}

	for _, m := range req.Mouvements {
		var id int64
		err := resource.TxQueryRow(ctx, tx, queryInsertMouvement,
			m.Date, m.Sens, m.NbPart, m.Prix, m.IDAction, userID).Scan(&id)
		if err != nil {
			resource.WriteDBError(w, err)
			return
		}

		held, err := shiftParts(ctx, tx, m.IDAction, signed(m.Sens, m.NbPart))
		if err != nil {
			writePartsError(w, err)
			return
		}
		res.IDs = append(res.IDs, id)
		parts[m.IDAction] = held
	}

	if err := tx.Commit(); err != nil {
		resource.WriteDBError(w, err)
		return
	}
	for _, held := range parts {
		res.Actions = append(res.Actions, held)
	}
	httpx.WriteJSON(w, http.StatusOK, res)
}

// UpdateMouvement remplace date, parts et prix ; le sens ne change pas.
func UpdateMouvement(w http.ResponseWriter, r *http.Request) {
	id, err := httpx.PathInt(r, "id")
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "errors.invalidId")
		return
	}
	var req mouvementFields
	if err := httpx.DecodeJSON(w, r, &req); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "errors.invalidBody")
		return
	}

	writeMouvement(w, r, id, func(ctx context.Context, tx *sql.Tx, sens string, old float64) (float64, error) {
		if err := resource.TxExec(ctx, tx, queryUpdateMouvement, req.Date, req.NbPart, req.Prix, id); err != nil {
			return 0, err
		}
		return signed(sens, req.NbPart-old), nil
	})
}

// DeleteMouvement supprime un mouvement et annule son effet sur les parts détenues.
func DeleteMouvement(w http.ResponseWriter, r *http.Request) {
	id, err := httpx.PathInt(r, "id")
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "errors.invalidId")
		return
	}

	writeMouvement(w, r, id, func(ctx context.Context, tx *sql.Tx, sens string, old float64) (float64, error) {
		if err := resource.TxExec(ctx, tx, queryDeleteMouvement, id); err != nil {
			return 0, err
		}
		return signed(sens, -old), nil
	})
}

// writeMouvement vérifie la propriété, applique change puis reporte le delta de parts
// qu'il renvoie, le tout dans une transaction. Répond avec les parts détenues à jour.
func writeMouvement(
	w http.ResponseWriter, r *http.Request, id int64,
	change func(ctx context.Context, tx *sql.Tx, sens string, old float64) (float64, error),
) {
	ctx := r.Context()

	tx, err := storage.DB().BeginTx(ctx, nil)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "errors.database")
		return
	}
	defer func() { _ = tx.Rollback() }()

	var idAction int64
	var sens string
	var old float64
	if err := resource.TxQueryRow(ctx, tx, queryOwnedMouvement, id, auth.UserID(r)).Scan(&idAction, &sens, &old); err != nil {
		resource.WriteDBError(w, err)
		return
	}

	delta, err := change(ctx, tx, sens, old)
	if err != nil {
		resource.WriteDBError(w, err)
		return
	}
	held, err := shiftParts(ctx, tx, idAction, delta)
	if err != nil {
		writePartsError(w, err)
		return
	}

	if err := tx.Commit(); err != nil {
		resource.WriteDBError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, held)
}

// errNotEnoughParts : l'opération rendrait les parts détenues négatives.
var errNotEnoughParts = errors.New("parts insuffisantes")

func shiftParts(ctx context.Context, tx *sql.Tx, idAction int64, delta float64) (actionParts, error) {
	held := actionParts{IDAction: idAction}
	err := resource.TxQueryRow(ctx, tx, queryShiftParts, delta, idAction).Scan(&held.NbPartAcquis, &held.ArchiveLe)
	if errors.Is(err, sql.ErrNoRows) {
		return held, errNotEnoughParts
	}
	return held, err
}

func writePartsError(w http.ResponseWriter, err error) {
	if errors.Is(err, errNotEnoughParts) {
		httpx.WriteError(w, http.StatusBadRequest, "errors.notEnoughParts")
		return
	}
	resource.WriteDBError(w, err)
}

// signed : une vente retire des parts, un achat en ajoute.
func signed(sens string, nbPart float64) float64 {
	if sens == sensVente {
		return -nbPart
	}
	return nbPart
}
