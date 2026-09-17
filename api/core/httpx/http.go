package httpx

import (
	"encoding/json"
	"net/http"
	"strconv"
)

const (
	maxBodyBytes    = 1 << 20
	defaultErrorKey = "errors.common.unknown"
)

// APIError porte une clé de traduction : le front choisit le message affiché.
type APIError struct {
	Key string `json:"key"`
}

type apiErrorEnvelope struct {
	Error APIError `json:"error"`
}

// WriteJSON encode data en JSON avec le statut donné.
func WriteJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}

// WriteError renvoie une erreur sous forme de clé.
func WriteError(w http.ResponseWriter, status int, key string) {
	if key == "" {
		key = defaultErrorKey
	}
	WriteJSON(w, status, apiErrorEnvelope{Error: APIError{Key: key}})
}

// DecodeJSON lit un corps JSON borné à 1 Mio et refuse les champs inconnus.
func DecodeJSON(w http.ResponseWriter, r *http.Request, dst any) error {
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxBodyBytes))
	decoder.DisallowUnknownFields()
	return decoder.Decode(dst)
}

// PathInt lit un segment de route nommé ({id}, {mois}…) comme entier.
func PathInt(r *http.Request, name string) (int64, error) {
	return strconv.ParseInt(r.PathValue(name), 10, 64)
}
