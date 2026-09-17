package handler

import (
	"net/http"

	"mycount/core/httpx"
	"mycount/core/resource"
	"mycount/storage"
)

// Mois de versement du dividende : propriété commune du titre. Écriture refusée aux
// comptes bloqués, comme le reste du catalogue.

const (
	// ON CONFLICT DO NOTHING et non INSERT OR IGNORE : OR IGNORE avale aussi les violations
	// de CHECK, un mois 13 serait ignoré en silence au lieu d'être refusé.
	queryInsertVersement = `INSERT INTO VERSEMENT_DIV (id_titre, mois) VALUES (?, ?) ON CONFLICT (id_titre, mois) DO NOTHING`
	queryDeleteVersement = `DELETE FROM VERSEMENT_DIV WHERE id_titre = ? AND mois = ?`
	queryClearVersements = `DELETE FROM VERSEMENT_DIV WHERE id_titre = ?`
)

type versementsRequest struct {
	Mois []int64 `json:"mois"`
}

// AddVersement marque un mois de versement pour un titre ; idempotent.
func AddVersement(w http.ResponseWriter, r *http.Request) {
	writeVersement(w, r, queryInsertVersement)
}

// RemoveVersement retire un mois de versement ; idempotent.
func RemoveVersement(w http.ResponseWriter, r *http.Request) {
	writeVersement(w, r, queryDeleteVersement)
}

// SetVersements remplace tous les mois d'un titre en une transaction.
func SetVersements(w http.ResponseWriter, r *http.Request) {
	titreID, ok := writableTitre(w, r)
	if !ok {
		return
	}

	var req versementsRequest
	if err := httpx.DecodeJSON(w, r, &req); err != nil || req.Mois == nil {
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

	if err := resource.TxExec(ctx, tx, queryClearVersements, titreID); err != nil {
		resource.WriteDBError(w, err)
		return
	}
	for _, mois := range req.Mois {
		if err := resource.TxExec(ctx, tx, queryInsertVersement, titreID, mois); err != nil {
			resource.WriteDBError(w, err)
			return
		}
	}

	if err := tx.Commit(); err != nil {
		resource.WriteDBError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func writeVersement(w http.ResponseWriter, r *http.Request, query string) {
	titreID, ok := writableTitre(w, r)
	if !ok {
		return
	}
	mois, err := httpx.PathInt(r, "mois")
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "errors.invalidId")
		return
	}

	stmt, err := storage.Stmt(query)
	if err != nil {
		resource.WriteDBError(w, err)
		return
	}
	if _, err := stmt.ExecContext(r.Context(), titreID, mois); err != nil {
		resource.WriteDBError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// writableTitre lit {id} et vérifie que l'utilisateur peut écrire le catalogue commun.
func writableTitre(w http.ResponseWriter, r *http.Request) (int64, bool) {
	titreID, err := httpx.PathInt(r, "id")
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "errors.invalidId")
		return 0, false
	}
	role, ok := canWriteCommon(w, r)
	if role == "" {
		return 0, false
	}
	if !ok {
		httpx.WriteError(w, http.StatusForbidden, "errors.forbidden")
		return 0, false
	}
	return titreID, true
}
