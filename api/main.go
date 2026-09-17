package main

import (
	"log"
	"net/http"
	"time"

	"mycount/core/auth"
	"mycount/core/resource"
	"mycount/handler"
	"mycount/storage"
)

const serverAddr = ":8080"

type middleware func(http.Handler) http.Handler

func withMiddlewares(h http.Handler, middlewares ...middleware) http.Handler {
	wrapped := h
	for i := len(middlewares) - 1; i >= 0; i-- {
		wrapped = middlewares[i](wrapped)
	}
	return wrapped
}

func registerRoute(mux *http.ServeMux, pattern string, h http.HandlerFunc, middlewares ...middleware) {
	mux.Handle(pattern, withMiddlewares(h, middlewares...))
}

// registerCRUD expose POST /{name}, PATCH et DELETE /{name}/{id}, tous authentifiés.
func registerCRUD(mux *http.ServeMux, name string, spec resource.Spec) {
	registerRoute(mux, "POST /"+name, spec.Create, auth.Middleware)
	registerRoute(mux, "PATCH /"+name+"/{id}", spec.Patch, auth.Middleware)
	registerRoute(mux, "DELETE /"+name+"/{id}", spec.Delete, auth.Middleware)
}

func main() {
	if err := storage.Init(); err != nil {
		log.Fatalf("base de données : %v", err)
	}
	if err := auth.Init(); err != nil {
		log.Fatalf("authentification : %v", err)
	}

	mux := http.NewServeMux()

	registerRoute(mux, "GET /health", handler.Health)

	// Authentification
	registerRoute(mux, "GET /auth/signup", auth.SignupStatus)
	registerRoute(mux, "POST /auth/signup", auth.Signup)
	registerRoute(mux, "POST /auth/login", auth.Login)
	registerRoute(mux, "POST /auth/refresh", auth.Refresh)
	registerRoute(mux, "POST /auth/logout", auth.Logout)
	registerRoute(mux, "GET /auth/me", auth.Me, auth.Middleware)
	registerRoute(mux, "PUT /auth/password", auth.ChangePassword, auth.Middleware)

	// Données
	registerRoute(mux, "GET /data", handler.Snapshot, auth.Middleware)
	registerCRUD(mux, "revenus", handler.Revenu)
	registerCRUD(mux, "depense-groups", handler.DepenseGroup)
	registerCRUD(mux, "depenses", handler.Depense)
	registerRoute(mux, "PATCH /depense-groups/{id}/move", handler.DepenseGroup.Move, auth.Middleware)
	registerRoute(mux, "PATCH /depenses/{id}/move", handler.Depense.Move, auth.Middleware)
	registerCRUD(mux, "profils", handler.ProfilInvest)
	registerCRUD(mux, "actions", handler.Action)
	registerCRUD(mux, "banned", handler.Banned)

	// Catalogue commun
	registerRoute(mux, "POST /marches", handler.CreateMarche, auth.Middleware)
	registerRoute(mux, "POST /titres", handler.CreateTitre, auth.Middleware)
	registerRoute(mux, "PATCH /titres/{id}", handler.PatchTitre, auth.Middleware)
	registerRoute(mux, "GET /titres/{id}/historique", handler.HistoriquePrix, auth.Middleware)
	registerRoute(mux, "PUT /titres/{id}/versements", handler.SetVersements, auth.Middleware)
	registerRoute(mux, "PUT /titres/{id}/versements/{mois}", handler.AddVersement, auth.Middleware)
	registerRoute(mux, "DELETE /titres/{id}/versements/{mois}", handler.RemoveVersement, auth.Middleware)

	// Administration
	registerRoute(mux, "GET /admin/users", handler.ListUsers, auth.Middleware)
	registerRoute(mux, "POST /admin/users", handler.CreateUser, auth.Middleware)
	registerRoute(mux, "DELETE /admin/users/{id}", handler.ArchiveUser, auth.Middleware)
	registerRoute(mux, "PATCH /admin/users/{id}", handler.SetRole, auth.Middleware)

	registerRoute(mux, "POST /mouvements", handler.CreateMouvements, auth.Middleware)
	registerRoute(mux, "PUT /mouvements/{id}", handler.UpdateMouvement, auth.Middleware)
	registerRoute(mux, "DELETE /mouvements/{id}", handler.DeleteMouvement, auth.Middleware)

	// Délais explicites : sans eux, un client lent garde une connexion ouverte indéfiniment.
	server := &http.Server{
		Addr:              serverAddr,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	log.Printf("API à l'écoute sur %s", serverAddr)
	if err := server.ListenAndServe(); err != nil {
		log.Fatalf("serveur : %v", err)
	}
}
