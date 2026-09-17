package auth

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"mycount/core/httpx"
	"mycount/core/repository/authrepo"
)

const (
	accessValidity  = 15 * time.Minute
	refreshValidity = 30 * 24 * time.Hour

	accessCookieName  = "mycount_access"
	refreshCookieName = "mycount_refresh"
	cookieSecureEnv   = "AUTH_COOKIE_SECURE"

	minPasswordLength = 8
	maxPasswordBytes  = 1024 // borne le coût d'un hash demandé par un client malveillant

	errInvalidBody        = "errors.invalidBody"
	errInvalidCredentials = "auth.error.invalidCredentials"
	errInvalidPseudo      = "auth.error.invalidPseudo"
	errPasswordWeak       = "auth.error.passwordWeak"
	errPasswordTooLong    = "auth.error.passwordTooLong"
	errPasswordMismatch   = "auth.error.passwordMismatch"
	errPseudoTaken        = "auth.error.pseudoAlreadyExists"
	errSignupClosed       = "auth.error.signupClosed"
	errCurrentPassword    = "auth.error.currentPassword"
	errTooManyAttempts    = "auth.error.tooManyAttempts"
	errTokenMissing       = "auth.error.tokenMissing"
	errTokenInvalid       = "auth.error.tokenInvalid"
	errTokenExpired       = "auth.error.tokenExpired"
	errDatabase           = "errors.database"
	errServer             = "errors.server"
)

// Pseudo : 3 à 32 caractères ASCII (lettres, chiffres, _ - .). Pas de lettres accentuées
// ni d'Unicode : deux pseudos visuellement identiques ne peuvent pas coexister.
// L'unicité est insensible à la casse (COLLATE NOCASE en base), l'affichage garde la saisie.
var pseudoPattern = regexp.MustCompile(`^[A-Za-z0-9_.-]{3,32}$`)

type contextKey struct{}

type credentialsRequest struct {
	Pseudo   string `json:"pseudo"`
	Password string `json:"password"`
}

type signupRequest struct {
	Pseudo          string `json:"pseudo"`
	Password        string `json:"password"`
	PasswordConfirm string `json:"password_confirm"`
}

type passwordRequest struct {
	CurrentPassword string `json:"current_password"`
	Password        string `json:"password"`
	PasswordConfirm string `json:"password_confirm"`
}

type userResponse struct {
	ID     int64  `json:"id"`
	Pseudo string `json:"pseudo"`
	Role   string `json:"role"`
}

// Role lit le rôle courant d'un compte ; les handlers du catalogue s'en servent pour
// distinguer un utilisateur bloqué (prix personnels) d'un admin.
func Role(r *http.Request) (string, error) {
	return authrepo.FindRole(r.Context(), UserID(r))
}

// Hash calculé une fois pour qu'un pseudo inconnu coûte autant qu'un mauvais mot de passe :
// sinon la durée de réponse révèle quels pseudos ont un compte.
var dummyHash string

// Init prépare le secret JWT, le nombre de proxys de confiance et le hash factice. À appeler avant de servir.
func Init() error {
	if err := LoadSecret(); err != nil {
		return err
	}
	if err := loadTrustedHops(); err != nil {
		return err
	}

	hash, err := hashPassword("mycount-dummy-password")
	if err != nil {
		return err
	}
	dummyHash = hash
	return nil
}

// UserID renvoie l'utilisateur authentifié posé dans le contexte par Middleware.
func UserID(r *http.Request) int64 {
	id, _ := r.Context().Value(contextKey{}).(int64)
	return id
}

// Middleware exige un access token valide. Aucune lecture en base : la signature suffit.
func Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie(accessCookieName)
		if err != nil || cookie.Value == "" {
			httpx.WriteError(w, http.StatusUnauthorized, errTokenMissing)
			return
		}

		claims, err := parseToken(cookie.Value, tokenTypeAccess, time.Now())
		if err != nil {
			writeTokenError(w, err)
			return
		}

		ctx := context.WithValue(r.Context(), contextKey{}, claims.UserID)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// Signup crée le premier compte (admin) et ouvre directement la session. Une fois ce compte
// créé, l'inscription est fermée : les comptes suivants sont créés par un admin.
func Signup(w http.ResponseWriter, r *http.Request) {
	// Vérifié avant le hash : sinon n'importe qui ferait calculer un argon2 pour rien.
	// L'insertion revérifie en une instruction, ce test ne sert qu'à économiser le calcul.
	open, err := authrepo.SignupOpen(r.Context())
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, errDatabase)
		return
	}
	if !open {
		httpx.WriteError(w, http.StatusForbidden, errSignupClosed)
		return
	}

	req, hash, ok := decodeSignup(w, r)
	if !ok {
		return
	}

	userID, err := authrepo.CreateFirstUser(r.Context(), req.Pseudo, hash)
	if !writeCreateError(w, err) {
		return
	}

	if !openSession(w, r, userID) {
		return
	}
	role, err := authrepo.FindRole(r.Context(), userID)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, errDatabase)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, userResponse{ID: userID, Pseudo: req.Pseudo, Role: role})
}

// SignupStatus indique si l'inscription publique est ouverte : le front masque le formulaire sinon.
func SignupStatus(w http.ResponseWriter, r *http.Request) {
	open, err := authrepo.SignupOpen(r.Context())
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, errDatabase)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]bool{"open": open})
}

// Login vérifie les identifiants, puis émet la paire access / refresh en cookies.
func Login(w http.ResponseWriter, r *http.Request) {
	req, ok := decodeCredentials(w, r)
	if !ok {
		return
	}

	ctx := r.Context()
	now := time.Now()
	ip := clientIP(r)
	banned, err := authrepo.IsBanned(ctx, req.Pseudo, ip, banMaxFailures, now.Unix())
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, errDatabase)
		return
	}
	if banned {
		httpx.WriteError(w, http.StatusTooManyRequests, errTooManyAttempts)
		return
	}

	userID, pseudo, hash, err := authrepo.FindCredentials(r.Context(), req.Pseudo)
	if err != nil && !errors.Is(err, authrepo.ErrUserNotFound) {
		httpx.WriteError(w, http.StatusInternalServerError, errDatabase)
		return
	}
	if errors.Is(err, authrepo.ErrUserNotFound) {
		hash = dummyHash
	}

	valid, verifyErr := verifyPassword(req.Password, hash)
	if verifyErr != nil {
		log.Printf("hash illisible pour l'utilisateur %d : %v", userID, verifyErr)
	}
	if err != nil || !valid {
		if err := authrepo.RecordFailure(ctx, req.Pseudo, ip, now.Unix(), now.Add(banDuration).Unix()); err != nil {
			log.Printf("enregistrement d'un échec de connexion : %v", err)
		}
		httpx.WriteError(w, http.StatusUnauthorized, errInvalidCredentials)
		return
	}
	if err := authrepo.ClearFailures(ctx, req.Pseudo, ip); err != nil {
		log.Printf("effacement des échecs de connexion : %v", err)
	}

	if !openSession(w, r, userID) {
		return
	}
	// Pseudo renvoyé tel qu'enregistré : « alice » se connecte, « Alice » s'affiche.
	role, err := authrepo.FindRole(r.Context(), userID)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, errDatabase)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, userResponse{ID: userID, Pseudo: pseudo, Role: role})
}

// Refresh consomme le refresh token et en émet un nouveau (rotation) : un jeton volé
// puis réutilisé après son propriétaire est refusé, sa ligne n'existant plus.
func Refresh(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie(refreshCookieName)
	if err != nil || cookie.Value == "" {
		httpx.WriteError(w, http.StatusUnauthorized, errTokenMissing)
		return
	}

	now := time.Now()
	claims, err := parseToken(cookie.Value, tokenTypeRefresh, now)
	if err != nil {
		clearCookies(w, r)
		writeTokenError(w, err)
		return
	}

	userID, err := authrepo.ConsumeRefreshToken(r.Context(), claims.TokenID, now.Unix())
	if err != nil {
		if errors.Is(err, authrepo.ErrTokenNotFound) {
			clearCookies(w, r)
			httpx.WriteError(w, http.StatusUnauthorized, errTokenInvalid)
			return
		}
		httpx.WriteError(w, http.StatusInternalServerError, errDatabase)
		return
	}

	if !openSession(w, r, userID) {
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// Logout révoque le refresh token. L'access token reste techniquement valide jusqu'à
// son expiration (15 min max) : c'est le compromis assumé du JWT sans état.
func Logout(w http.ResponseWriter, r *http.Request) {
	if cookie, err := r.Cookie(refreshCookieName); err == nil {
		if claims, err := parseToken(cookie.Value, tokenTypeRefresh, time.Now()); err == nil {
			if err := authrepo.DeleteRefreshToken(r.Context(), claims.TokenID); err != nil {
				log.Printf("révocation du refresh token : %v", err)
			}
		}
	}
	clearCookies(w, r)
	w.WriteHeader(http.StatusNoContent)
}

// Me renvoie l'utilisateur de l'access token.
func Me(w http.ResponseWriter, r *http.Request) {
	userID := UserID(r)
	pseudo, err := authrepo.FindPseudo(r.Context(), userID)
	if err != nil {
		if errors.Is(err, authrepo.ErrUserNotFound) {
			clearCookies(w, r)
			httpx.WriteError(w, http.StatusUnauthorized, errTokenInvalid)
			return
		}
		httpx.WriteError(w, http.StatusInternalServerError, errDatabase)
		return
	}
	role, err := authrepo.FindRole(r.Context(), userID)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, errDatabase)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, userResponse{ID: userID, Pseudo: pseudo, Role: role})
}

// CreateAccount crée un compte au rôle user sans ouvrir de session. Le contrôle du rôle
// admin revient à l'appelant. Renvoie l'id créé ; false si une erreur a déjà été écrite.
func CreateAccount(w http.ResponseWriter, r *http.Request) (int64, bool) {
	req, hash, ok := decodeSignup(w, r)
	if !ok {
		return 0, false
	}

	userID, err := authrepo.CreateUser(r.Context(), req.Pseudo, hash)
	if !writeCreateError(w, err) {
		return 0, false
	}
	return userID, true
}

// ChangePassword remplace le mot de passe après vérification de l'actuel, révoque les autres
// sessions et rouvre celle-ci avec de nouveaux jetons.
func ChangePassword(w http.ResponseWriter, r *http.Request) {
	var req passwordRequest
	if err := httpx.DecodeJSON(w, r, &req); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, errInvalidBody)
		return
	}
	if len(req.CurrentPassword) > maxPasswordBytes {
		httpx.WriteError(w, http.StatusBadRequest, errPasswordTooLong)
		return
	}
	if key := validatePassword(req.Password, req.PasswordConfirm); key != "" {
		httpx.WriteError(w, http.StatusBadRequest, key)
		return
	}

	userID := UserID(r)
	current, err := authrepo.FindHash(r.Context(), userID)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, errDatabase)
		return
	}
	// 400 et non 401 : un 401 ferait croire au client que la session a expiré.
	if valid, _ := verifyPassword(req.CurrentPassword, current); !valid {
		httpx.WriteError(w, http.StatusBadRequest, errCurrentPassword)
		return
	}

	hash, err := hashPassword(req.Password)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, errServer)
		return
	}
	if err := authrepo.UpdatePassword(r.Context(), userID, hash); err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, errDatabase)
		return
	}
	if !openSession(w, r, userID) {
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// decodeSignup lit et valide pseudo et mot de passe, puis calcule le hash.
func decodeSignup(w http.ResponseWriter, r *http.Request) (signupRequest, string, bool) {
	var req signupRequest
	if err := httpx.DecodeJSON(w, r, &req); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, errInvalidBody)
		return req, "", false
	}

	req.Pseudo = strings.TrimSpace(req.Pseudo)
	if key := validateSignup(req); key != "" {
		httpx.WriteError(w, http.StatusBadRequest, key)
		return req, "", false
	}

	hash, err := hashPassword(req.Password)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, errServer)
		return req, "", false
	}
	return req, hash, true
}

// writeCreateError traduit l'échec d'une création de compte ; true si err est nil.
func writeCreateError(w http.ResponseWriter, err error) bool {
	switch {
	case err == nil:
		return true
	case errors.Is(err, authrepo.ErrPseudoTaken):
		httpx.WriteError(w, http.StatusConflict, errPseudoTaken)
	case errors.Is(err, authrepo.ErrSignupClosed):
		httpx.WriteError(w, http.StatusForbidden, errSignupClosed)
	default:
		httpx.WriteError(w, http.StatusInternalServerError, errDatabase)
	}
	return false
}

// validateSignup applique les règles du formulaire d'inscription. Le front les vérifie
// déjà pour répondre sans aller-retour ; le serveur les revérifie, car rien n'oblige un
// client à passer par le formulaire. Renvoie la clé d'erreur, ou "" si tout est valide.
func validateSignup(req signupRequest) string {
	if !pseudoPattern.MatchString(req.Pseudo) {
		return errInvalidPseudo
	}
	return validatePassword(req.Password, req.PasswordConfirm)
}

func validatePassword(password, confirm string) string {
	if len(password) > maxPasswordBytes {
		return errPasswordTooLong
	}
	if utf8.RuneCountInString(password) < minPasswordLength {
		return errPasswordWeak
	}
	if password != confirm {
		return errPasswordMismatch
	}
	return ""
}

func decodeCredentials(w http.ResponseWriter, r *http.Request) (credentialsRequest, bool) {
	var req credentialsRequest
	if err := httpx.DecodeJSON(w, r, &req); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, errInvalidBody)
		return req, false
	}

	// Le mot de passe n'est jamais retouché : un espace en fin fait partie du secret.
	req.Pseudo = strings.TrimSpace(req.Pseudo)
	if req.Pseudo == "" || req.Password == "" {
		httpx.WriteError(w, http.StatusBadRequest, errInvalidCredentials)
		return req, false
	}
	if len(req.Password) > maxPasswordBytes {
		httpx.WriteError(w, http.StatusBadRequest, errPasswordTooLong)
		return req, false
	}
	return req, true
}

// openSession émet la paire de jetons, enregistre le refresh token et pose les cookies.
func openSession(w http.ResponseWriter, r *http.Request, userID int64) bool {
	now := time.Now()

	access, accessExpiresAt, err := issueToken(userID, tokenTypeAccess, "", now, accessValidity)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, errServer)
		return false
	}

	tokenID, err := newTokenID()
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, errServer)
		return false
	}
	refresh, refreshExpiresAt, err := issueToken(userID, tokenTypeRefresh, tokenID, now, refreshValidity)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, errServer)
		return false
	}

	if err := authrepo.StoreRefreshToken(r.Context(), tokenID, userID, refreshExpiresAt.Unix(), now.Unix()); err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, errDatabase)
		return false
	}

	secure := secureCookies(r)
	http.SetCookie(w, buildCookie(accessCookieName, access, accessExpiresAt, accessValidity, secure))
	http.SetCookie(w, buildCookie(refreshCookieName, refresh, refreshExpiresAt, refreshValidity, secure))
	return true
}

func clearCookies(w http.ResponseWriter, r *http.Request) {
	secure := secureCookies(r)
	http.SetCookie(w, buildCookie(accessCookieName, "", time.Unix(0, 0), -1, secure))
	http.SetCookie(w, buildCookie(refreshCookieName, "", time.Unix(0, 0), -1, secure))
}

// HttpOnly : illisible par le JS, donc hors de portée d'un script injecté.
// SameSite Strict : jamais envoyé depuis un autre site, ce qui neutralise le CSRF.
func buildCookie(name, value string, expiresAt time.Time, validity time.Duration, secure bool) *http.Cookie {
	maxAge := int(validity.Seconds())
	if validity < 0 {
		maxAge = -1
	}
	return &http.Cookie{
		Name:     name,
		Value:    value,
		Path:     "/",
		Expires:  expiresAt,
		MaxAge:   maxAge,
		Secure:   secure,
		HttpOnly: true,
		SameSite: http.SameSiteStrictMode,
	}
}

// Cookies Secure par défaut ; AUTH_COOKIE_SECURE=false pour le développement en HTTP.
func secureCookies(r *http.Request) bool {
	if value, err := strconv.ParseBool(os.Getenv(cookieSecureEnv)); err == nil {
		return value
	}
	return true
}

func writeTokenError(w http.ResponseWriter, err error) {
	if errors.Is(err, errJWTExpired) {
		httpx.WriteError(w, http.StatusUnauthorized, errTokenExpired)
		return
	}
	httpx.WriteError(w, http.StatusUnauthorized, errTokenInvalid)
}
