package auth

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strings"
	"sync"
	"time"
)

// JWT HS256 écrit à la main, comme sur upcycling : trois segments base64url, signature
// HMAC-SHA256 du couple en-tête.charge. Pas de dépendance, et un seul algorithme accepté,
// ce qui ferme la porte aux attaques par substitution d'algorithme (« alg: none »).
const (
	jwtIssuer          = "mycount-api"
	jwtHeaderSegment   = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9" // {"alg":"HS256","typ":"JWT"}
	jwtMinSecretLength = 32
	jwtSecretEnv       = "JWT_SECRET"
	jwtSecretFileEnv   = "JWT_SECRET_FILE"
	tokenTypeAccess    = "access"
	tokenTypeRefresh   = "refresh"
	tokenIDBytes       = 32
)

var (
	errJWTInvalid = errors.New("jeton invalide")
	errJWTExpired = errors.New("jeton expiré")

	secretOnce sync.Once
	secret     []byte
	secretErr  error
)

type tokenClaims struct {
	UserID    int64  `json:"uid"`
	TokenType string `json:"typ"`
	TokenID   string `json:"jti,omitempty"`
	Issuer    string `json:"iss"`
	IssuedAt  int64  `json:"iat"`
	ExpiresAt int64  `json:"exp"`
}

// LoadSecret lit le secret depuis JWT_SECRET ou le fichier pointé par JWT_SECRET_FILE
// (secret Docker). Appelé au démarrage : une configuration absente arrête le serveur
// au lieu d'échouer à la première connexion.
func LoadSecret() error {
	secretOnce.Do(func() {
		value := strings.TrimSpace(os.Getenv(jwtSecretEnv))
		if value == "" {
			if path := os.Getenv(jwtSecretFileEnv); path != "" {
				content, err := os.ReadFile(path)
				if err != nil {
					secretErr = fmt.Errorf("lecture de %s : %w", path, err)
					return
				}
				value = strings.TrimSpace(string(content))
			}
		}

		if len(value) < jwtMinSecretLength {
			secretErr = fmt.Errorf("secret JWT absent ou trop court (%d caractères minimum)", jwtMinSecretLength)
			return
		}
		secret = []byte(value)
	})
	return secretErr
}

func newTokenID() (string, error) {
	buffer := make([]byte, tokenIDBytes)
	if _, err := rand.Read(buffer); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buffer), nil
}

func sign(unsigned string) string {
	mac := hmac.New(sha256.New, secret)
	mac.Write([]byte(unsigned))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func issueToken(userID int64, tokenType, tokenID string, now time.Time, validity time.Duration) (string, time.Time, error) {
	expiresAt := now.Add(validity)
	payload, err := json.Marshal(tokenClaims{
		UserID:    userID,
		TokenType: tokenType,
		TokenID:   tokenID,
		Issuer:    jwtIssuer,
		IssuedAt:  now.Unix(),
		ExpiresAt: expiresAt.Unix(),
	})
	if err != nil {
		return "", time.Time{}, err
	}

	unsigned := jwtHeaderSegment + "." + base64.RawURLEncoding.EncodeToString(payload)
	return unsigned + "." + sign(unsigned), expiresAt, nil
}

// parseToken vérifie la signature avant de lire quoi que ce soit de la charge.
func parseToken(token, expectedType string, now time.Time) (tokenClaims, error) {
	header, rest, found := strings.Cut(token, ".")
	if !found || header != jwtHeaderSegment {
		return tokenClaims{}, errJWTInvalid
	}
	payloadSegment, signature, found := strings.Cut(rest, ".")
	if !found {
		return tokenClaims{}, errJWTInvalid
	}
	if !hmac.Equal([]byte(signature), []byte(sign(header+"."+payloadSegment))) {
		return tokenClaims{}, errJWTInvalid
	}

	payload, err := base64.RawURLEncoding.DecodeString(payloadSegment)
	if err != nil {
		return tokenClaims{}, errJWTInvalid
	}

	var claims tokenClaims
	if err := json.Unmarshal(payload, &claims); err != nil {
		return tokenClaims{}, errJWTInvalid
	}
	if claims.Issuer != jwtIssuer || claims.TokenType != expectedType || claims.UserID <= 0 {
		return tokenClaims{}, errJWTInvalid
	}
	if expectedType == tokenTypeRefresh && claims.TokenID == "" {
		return tokenClaims{}, errJWTInvalid
	}
	if claims.ExpiresAt <= now.Unix() {
		return tokenClaims{}, errJWTExpired
	}
	return claims, nil
}
