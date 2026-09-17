package handler

import (
	"errors"
	"net/http"

	"mycount/core/auth"
	"mycount/core/httpx"
	"mycount/core/repository/authrepo"
	"mycount/core/resource"
)

// Administration des comptes : réservée au rôle admin.
// Un admin ne peut pas se rétrograder lui-même : il resterait sinon une base sans admin.

const (
	queryUsers      = `SELECT id_utilisateur, pseudo, role, created_at FROM UTILISATEUR WHERE archive_le IS NULL ORDER BY pseudo`
	queryUser       = `SELECT id_utilisateur, pseudo, role, created_at FROM UTILISATEUR WHERE id_utilisateur = ?`
	queryUpdateRole = `UPDATE UTILISATEUR SET role = ? WHERE id_utilisateur = ? AND archive_le IS NULL RETURNING id_utilisateur, pseudo, role, created_at`
)

type rolePatch struct {
	Role string `json:"role"`
}

func requireAdmin(w http.ResponseWriter, r *http.Request) bool {
	role, err := auth.Role(r)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "errors.database")
		return false
	}
	if role != roleAdmin {
		httpx.WriteError(w, http.StatusForbidden, "errors.forbidden")
		return false
	}
	return true
}

// ListUsers : tous les comptes avec leur rôle.
func ListUsers(w http.ResponseWriter, r *http.Request) {
	if !requireAdmin(w, r) {
		return
	}
	rows, err := resource.QueryAll(r.Context(), queryUsers)
	if err != nil {
		resource.WriteDBError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, rows)
}

// CreateUser crée un compte au rôle user ; seule voie d'inscription une fois le premier admin créé.
func CreateUser(w http.ResponseWriter, r *http.Request) {
	if !requireAdmin(w, r) {
		return
	}
	id, ok := auth.CreateAccount(w, r)
	if !ok {
		return
	}
	row, err := resource.QueryOne(r.Context(), queryUser, id)
	if err != nil {
		resource.WriteDBError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, row)
}

// ArchiveUser « supprime » un compte : archivé, il ne peut plus se connecter, mais ses données
// et son pseudo restent en base. Un admin ne peut pas archiver son propre compte.
func ArchiveUser(w http.ResponseWriter, r *http.Request) {
	if !requireAdmin(w, r) {
		return
	}
	id, err := httpx.PathInt(r, "id")
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "errors.invalidId")
		return
	}
	if id == auth.UserID(r) {
		httpx.WriteError(w, http.StatusBadRequest, "errors.selfArchive")
		return
	}
	if err := authrepo.ArchiveUser(r.Context(), id); err != nil {
		if errors.Is(err, authrepo.ErrUserNotFound) {
			httpx.WriteError(w, http.StatusNotFound, "errors.notFound")
			return
		}
		httpx.WriteError(w, http.StatusInternalServerError, "errors.database")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// SetRole change le rôle d'un compte (user, admin, bloque) ; le CHECK de la table refuse le reste.
func SetRole(w http.ResponseWriter, r *http.Request) {
	if !requireAdmin(w, r) {
		return
	}
	id, err := httpx.PathInt(r, "id")
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "errors.invalidId")
		return
	}
	if id == auth.UserID(r) {
		httpx.WriteError(w, http.StatusBadRequest, "errors.selfRole")
		return
	}
	var req rolePatch
	if err := httpx.DecodeJSON(w, r, &req); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "errors.invalidBody")
		return
	}
	row, err := resource.QueryOne(r.Context(), queryUpdateRole, req.Role, id)
	if err != nil {
		resource.WriteDBError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, row)
}
