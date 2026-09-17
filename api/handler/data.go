package handler

import (
	"net/http"

	"mycount/core/auth"
	"mycount/core/httpx"
	"mycount/core/resource"
)

type snapshotTable struct {
	name    string
	spec    resource.Spec
	orderBy string
}

// Tables propres à l'utilisateur. Les tables communes (catalogue) sont ajoutées à part.
var snapshotTables = []snapshotTable{
	{"PROFIL_INVEST", ProfilInvest, "id_profil_inv"},
	{"DEPENSE_GROUP", DepenseGroup, "ordre, id_depense_group"},
	{"REVENU", Revenu, "ordre, id_revenu"},
	{"BANNED", Banned, "id_banned"},
	{"ACTION", Action, "id_profil_inv, ordre, id_action"},
	{"DEPENSE", Depense, "id_depense_group, ordre, id_depense"},
	{"MOUVEMENT", Mouvement, "date, id_mouvement"},
}

// Snapshot renvoie toutes les tables de l'utilisateur en une réponse : le front charge
// son état d'un coup au lieu d'enchaîner autant de requêtes.
func Snapshot(w http.ResponseWriter, r *http.Request) {
	userID := auth.UserID(r)
	tables := make(map[string][]map[string]any, len(snapshotTables))

	for _, table := range snapshotTables {
		rows, err := table.spec.List(r.Context(), userID, table.orderBy)
		if err != nil {
			resource.WriteDBError(w, err)
			return
		}
		tables[table.name] = rows
	}

	// Catalogue commun : TITRE porte le prix effectif de l'utilisateur (perso sinon commun).
	common := []struct {
		name  string
		query string
		args  []any
	}{
		{"MARCHE", "SELECT id_marche, label FROM MARCHE ORDER BY label", nil},
		{"TITRE", queryTitres, []any{userID}},
		{"VERSEMENT_DIV", "SELECT id_titre, mois FROM VERSEMENT_DIV ORDER BY id_titre, mois", nil},
	}
	for _, table := range common {
		rows, err := resource.QueryAll(r.Context(), table.query, table.args...)
		if err != nil {
			resource.WriteDBError(w, err)
			return
		}
		tables[table.name] = rows
	}

	httpx.WriteJSON(w, http.StatusOK, map[string]any{"version": 1, "tables": tables})
}
