package handler

import (
	"net/http"

	"mycount/core/auth"
	"mycount/core/httpx"
	"mycount/core/resource"
	"mycount/storage"
)

// Catalogue commun : marchés, titres, prix, mois de versement.
//
// Règles de droit (UTILISATEUR.role) :
//   - user / admin : écrivent le catalogue commun ; chaque changement de prix est tracé
//     dans PRIX_HISTORIQUE ;
//   - bloque : n'écrit rien de commun. Son prix va dans PRIX_PERSO et ne vaut que pour lui.
//
// Le prix renvoyé à un utilisateur est toujours son prix effectif : perso sinon commun.
// Un changement de prix ne touche jamais MOUVEMENT.prix : l'achat reste ce qu'il a été.

const (
	roleAdmin  = "admin"
	roleBloque = "bloque"

	queryTitres = `
		SELECT t.id_titre, t.nom, t.id_marche, coalesce(p.prix, t.prix) AS prix, t.div,
			p.prix IS NOT NULL AS prix_perso
		FROM TITRE t
		LEFT JOIN PRIX_PERSO p ON p.id_titre = t.id_titre AND p.id_utilisateur = ?
		ORDER BY t.nom, t.id_marche
	`
	queryTitre = `
		SELECT t.id_titre, t.nom, t.id_marche, coalesce(p.prix, t.prix) AS prix, t.div,
			p.prix IS NOT NULL AS prix_perso
		FROM TITRE t
		LEFT JOIN PRIX_PERSO p ON p.id_titre = t.id_titre AND p.id_utilisateur = ?
		WHERE t.id_titre = ?
	`
	queryInsertTitre = `INSERT INTO TITRE (nom, id_marche, prix, div) VALUES (?, ?, ?, ?) RETURNING id_titre`
	queryCommonPrix  = `SELECT prix FROM TITRE WHERE id_titre = ?`
	queryUpdatePrix  = `UPDATE TITRE SET prix = ? WHERE id_titre = ?`
	queryUpdateDiv   = `UPDATE TITRE SET div = ? WHERE id_titre = ?`
	queryInsertHisto = `INSERT INTO PRIX_HISTORIQUE (id_titre, id_utilisateur, avant, apres) VALUES (?, ?, ?, ?)`
	queryUpsertPerso = `
		INSERT INTO PRIX_PERSO (id_utilisateur, id_titre, prix) VALUES (?, ?, ?)
		ON CONFLICT (id_utilisateur, id_titre) DO UPDATE SET prix = excluded.prix
	`
	queryHistorique = `
		SELECT h.id_prix_historique, h.avant, h.apres, h.modifie_le, u.pseudo
		FROM PRIX_HISTORIQUE h
		LEFT JOIN UTILISATEUR u ON u.id_utilisateur = h.id_utilisateur
		WHERE h.id_titre = ?
		ORDER BY h.modifie_le DESC, h.id_prix_historique DESC
		LIMIT 50
	`
	queryInsertMarche = `INSERT INTO MARCHE (label) VALUES (?) RETURNING id_marche, label`
)

type titreCreate struct {
	Nom      string   `json:"nom"`
	IDMarche int64    `json:"id_marche"`
	Prix     *float64 `json:"prix"`
	Div      *float64 `json:"div"`
}

// Un champ absent n'est pas touché ; set_prix / set_div distinguent « effacer » de « ne pas toucher ».
type titrePatch struct {
	Prix    *float64 `json:"prix"`
	Div     *float64 `json:"div"`
	SetPrix bool     `json:"set_prix"`
	SetDiv  bool     `json:"set_div"`
}

type marcheCreate struct {
	Label string `json:"label"`
}

// canWriteCommon : tout le monde sauf un compte bloqué.
func canWriteCommon(w http.ResponseWriter, r *http.Request) (string, bool) {
	role, err := auth.Role(r)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "errors.database")
		return "", false
	}
	return role, role != roleBloque
}

// CreateTitre ajoute un titre au catalogue. Un doublon (nom + marché) renvoie 409 :
// le front propose alors l'existant.
func CreateTitre(w http.ResponseWriter, r *http.Request) {
	if _, ok := canWriteCommon(w, r); !ok {
		httpx.WriteError(w, http.StatusForbidden, "errors.forbidden")
		return
	}
	var req titreCreate
	if err := httpx.DecodeJSON(w, r, &req); err != nil || req.Nom == "" || req.IDMarche == 0 {
		httpx.WriteError(w, http.StatusBadRequest, "errors.invalidBody")
		return
	}

	ctx := r.Context()
	tx, err := storage.DB().BeginTx(ctx, nil)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "errors.database")
		return
	}
	defer func() { _ = tx.Rollback() }()

	var id int64
	if err := resource.TxQueryRow(ctx, tx, queryInsertTitre, req.Nom, req.IDMarche, req.Prix, req.Div).Scan(&id); err != nil {
		resource.WriteDBError(w, err)
		return
	}
	if req.Prix != nil {
		if err := resource.TxExec(ctx, tx, queryInsertHisto, id, auth.UserID(r), nil, req.Prix); err != nil {
			resource.WriteDBError(w, err)
			return
		}
	}
	if err := tx.Commit(); err != nil {
		resource.WriteDBError(w, err)
		return
	}
	writeTitre(w, r, id, http.StatusCreated)
}

// PatchTitre modifie prix et/ou dividende. Bloqué : le prix devient personnel, le dividende
// est refusé (commun). Autres : commun, avec trace du prix.
func PatchTitre(w http.ResponseWriter, r *http.Request) {
	id, err := httpx.PathInt(r, "id")
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "errors.invalidId")
		return
	}
	var req titrePatch
	if err := httpx.DecodeJSON(w, r, &req); err != nil || (!req.SetPrix && !req.SetDiv) {
		httpx.WriteError(w, http.StatusBadRequest, "errors.invalidBody")
		return
	}
	role, common := canWriteCommon(w, r)
	if role == "" {
		return
	}
	if !common && req.SetDiv {
		httpx.WriteError(w, http.StatusForbidden, "errors.forbidden")
		return
	}

	ctx := r.Context()
	userID := auth.UserID(r)
	tx, err := storage.DB().BeginTx(ctx, nil)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "errors.database")
		return
	}
	defer func() { _ = tx.Rollback() }()

	if req.SetPrix {
		if !common {
			if err := resource.TxExec(ctx, tx, queryUpsertPerso, userID, id, req.Prix); err != nil {
				resource.WriteDBError(w, err)
				return
			}
		} else {
			var avant *float64
			if err := resource.TxQueryRow(ctx, tx, queryCommonPrix, id).Scan(&avant); err != nil {
				resource.WriteDBError(w, err)
				return
			}
			// Même valeur : rien à tracer.
			if !samePrix(avant, req.Prix) {
				if err := resource.TxExec(ctx, tx, queryUpdatePrix, req.Prix, id); err != nil {
					resource.WriteDBError(w, err)
					return
				}
				if err := resource.TxExec(ctx, tx, queryInsertHisto, id, userID, avant, req.Prix); err != nil {
					resource.WriteDBError(w, err)
					return
				}
			}
		}
	}
	if req.SetDiv {
		if err := resource.TxExec(ctx, tx, queryUpdateDiv, req.Div, id); err != nil {
			resource.WriteDBError(w, err)
			return
		}
	}
	if err := tx.Commit(); err != nil {
		resource.WriteDBError(w, err)
		return
	}
	writeTitre(w, r, id, http.StatusOK)
}

func samePrix(a, b *float64) bool {
	if a == nil || b == nil {
		return a == nil && b == nil
	}
	return *a == *b
}

// HistoriquePrix : les 50 derniers changements du prix commun d'un titre.
func HistoriquePrix(w http.ResponseWriter, r *http.Request) {
	id, err := httpx.PathInt(r, "id")
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "errors.invalidId")
		return
	}
	rows, err := resource.QueryAll(r.Context(), queryHistorique, id)
	if err != nil {
		resource.WriteDBError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, rows)
}

func writeTitre(w http.ResponseWriter, r *http.Request, id int64, status int) {
	row, err := resource.QueryOne(r.Context(), queryTitre, auth.UserID(r), id)
	if err != nil {
		resource.WriteDBError(w, err)
		return
	}
	httpx.WriteJSON(w, status, row)
}

// CreateMarche ajoute un marché ; doublon (insensible à la casse) → 409.
func CreateMarche(w http.ResponseWriter, r *http.Request) {
	if _, ok := canWriteCommon(w, r); !ok {
		httpx.WriteError(w, http.StatusForbidden, "errors.forbidden")
		return
	}
	var req marcheCreate
	if err := httpx.DecodeJSON(w, r, &req); err != nil || req.Label == "" {
		httpx.WriteError(w, http.StatusBadRequest, "errors.invalidBody")
		return
	}
	row, err := resource.QueryOne(r.Context(), queryInsertMarche, req.Label)
	if err != nil {
		resource.WriteDBError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, row)
}
