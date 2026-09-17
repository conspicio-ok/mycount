package handler

import (
	"context"
	"net/http"
	"time"

	"mycount/core/httpx"
	"mycount/storage"
)

const healthTimeout = 2 * time.Second

// Health répond 200 quand le serveur tourne et que la base répond. Sert au healthcheck
// Docker : le front ne démarre qu'une fois l'API réellement utilisable.
func Health(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), healthTimeout)
	defer cancel()

	if err := storage.DB().PingContext(ctx); err != nil {
		httpx.WriteError(w, http.StatusServiceUnavailable, "errors.database")
		return
	}
	w.WriteHeader(http.StatusOK)
}
