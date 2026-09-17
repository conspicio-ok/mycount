package authrepo

import (
	"context"
	"database/sql"
	"errors"

	"github.com/mattn/go-sqlite3"

	"mycount/storage"
)

const (
	// Inscription publique : uniquement sur une base vide, et ce premier compte est admin.
	// Condition et insertion en une instruction : deux inscriptions simultanées ne peuvent
	// pas créer deux premiers comptes.
	queryInsertFirstUser = `
		INSERT INTO UTILISATEUR (pseudo, password_hash, role)
		SELECT ?, ?, 'admin'
		WHERE NOT EXISTS (SELECT 1 FROM UTILISATEUR)
	`

	querySignupOpen = `SELECT NOT EXISTS (SELECT 1 FROM UTILISATEUR)`

	// Compte créé par un admin.
	queryInsertUser = `
		INSERT INTO UTILISATEUR (pseudo, password_hash)
		VALUES (?, ?)
	`

	querySelectHash = `
		SELECT password_hash
		FROM UTILISATEUR
		WHERE id_utilisateur = ?
	`

	queryUpdatePassword = `
		UPDATE UTILISATEUR
		SET password_hash = ?
		WHERE id_utilisateur = ?
	`

	queryDeleteUserTokens = `
		DELETE FROM REFRESH_TOKEN
		WHERE id_utilisateur = ?
	`

	queryArchiveUser = `
		UPDATE UTILISATEUR
		SET archive_le = date('now')
		WHERE id_utilisateur = ? AND archive_le IS NULL
	`

	querySelectRole = `
		SELECT role
		FROM UTILISATEUR
		WHERE id_utilisateur = ? AND archive_le IS NULL
	`

	querySelectCredentials = `
		SELECT id_utilisateur, pseudo, password_hash
		FROM UTILISATEUR
		WHERE pseudo = ? AND archive_le IS NULL
	`

	querySelectPseudo = `
		SELECT pseudo
		FROM UTILISATEUR
		WHERE id_utilisateur = ? AND archive_le IS NULL
	`

	queryPurgeExpiredTokens = `
		DELETE FROM REFRESH_TOKEN
		WHERE id_utilisateur = ? AND expires_at <= ?
	`

	queryInsertRefreshToken = `
		INSERT INTO REFRESH_TOKEN (id_token, id_utilisateur, expires_at)
		VALUES (?, ?, ?)
	`

	// Lecture et suppression en une seule instruction : deux requêtes concurrentes
	// avec le même jeton ne peuvent pas le consommer toutes les deux.
	queryConsumeRefreshToken = `
		DELETE FROM REFRESH_TOKEN
		WHERE id_token = ? AND expires_at > ?
		RETURNING id_utilisateur
	`

	queryDeleteRefreshToken = `
		DELETE FROM REFRESH_TOKEN
		WHERE id_token = ?
	`
)

var (
	ErrPseudoTaken   = errors.New("pseudo déjà utilisé")
	ErrSignupClosed  = errors.New("inscription fermée")
	ErrUserNotFound  = errors.New("utilisateur introuvable")
	ErrTokenNotFound = errors.New("refresh token inconnu ou expiré")
)

// SignupOpen : vrai tant que la base n'a aucun compte.
func SignupOpen(ctx context.Context) (bool, error) {
	stmt, err := storage.Stmt(querySignupOpen)
	if err != nil {
		return false, err
	}
	var open bool
	err = stmt.QueryRowContext(ctx).Scan(&open)
	return open, err
}

// CreateFirstUser insère le compte admin initial ; ErrSignupClosed si la base a déjà un compte.
func CreateFirstUser(ctx context.Context, pseudo, passwordHash string) (int64, error) {
	return insertUser(ctx, queryInsertFirstUser, pseudo, passwordHash)
}

// CreateUser insère un compte au rôle user ; l'unicité du pseudo (insensible à la casse) est garantie par la table.
func CreateUser(ctx context.Context, pseudo, passwordHash string) (int64, error) {
	return insertUser(ctx, queryInsertUser, pseudo, passwordHash)
}

func insertUser(ctx context.Context, query, pseudo, passwordHash string) (int64, error) {
	stmt, err := storage.Stmt(query)
	if err != nil {
		return 0, err
	}

	result, err := stmt.ExecContext(ctx, pseudo, passwordHash)
	if err != nil {
		if storage.IsConstraint(err, sqlite3.ErrConstraintUnique) {
			return 0, ErrPseudoTaken
		}
		return 0, err
	}
	if affected, err := result.RowsAffected(); err != nil || affected == 0 {
		return 0, ErrSignupClosed
	}
	return result.LastInsertId()
}

// FindHash renvoie le hash du mot de passe d'un compte.
func FindHash(ctx context.Context, userID int64) (string, error) {
	stmt, err := storage.Stmt(querySelectHash)
	if err != nil {
		return "", err
	}
	var hash string
	if err := stmt.QueryRowContext(ctx, userID).Scan(&hash); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", ErrUserNotFound
		}
		return "", err
	}
	return hash, nil
}

// UpdatePassword remplace le hash et révoque tous les refresh tokens du compte : les autres
// sessions tombent à l'expiration de leur access token.
func UpdatePassword(ctx context.Context, userID int64, passwordHash string) error {
	tx, err := storage.DB().BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	update, err := storage.Stmt(queryUpdatePassword)
	if err != nil {
		return err
	}
	if _, err := tx.StmtContext(ctx, update).ExecContext(ctx, passwordHash, userID); err != nil {
		return err
	}

	revoke, err := storage.Stmt(queryDeleteUserTokens)
	if err != nil {
		return err
	}
	if _, err := tx.StmtContext(ctx, revoke).ExecContext(ctx, userID); err != nil {
		return err
	}
	return tx.Commit()
}

// ArchiveUser archive un compte et révoque ses refresh tokens : sa session tombe à
// l'expiration de son access token (15 min max). ErrUserNotFound s'il est absent ou déjà archivé.
func ArchiveUser(ctx context.Context, userID int64) error {
	tx, err := storage.DB().BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	archive, err := storage.Stmt(queryArchiveUser)
	if err != nil {
		return err
	}
	result, err := tx.StmtContext(ctx, archive).ExecContext(ctx, userID)
	if err != nil {
		return err
	}
	if affected, err := result.RowsAffected(); err != nil || affected == 0 {
		return ErrUserNotFound
	}

	revoke, err := storage.Stmt(queryDeleteUserTokens)
	if err != nil {
		return err
	}
	if _, err := tx.StmtContext(ctx, revoke).ExecContext(ctx, userID); err != nil {
		return err
	}
	return tx.Commit()
}

// FindCredentials renvoie l'identifiant, le pseudo tel qu'enregistré et le hash du compte.
// La comparaison ignore la casse (COLLATE NOCASE de la colonne).
func FindCredentials(ctx context.Context, pseudo string) (int64, string, string, error) {
	stmt, err := storage.Stmt(querySelectCredentials)
	if err != nil {
		return 0, "", "", err
	}

	var userID int64
	var stored, hash string
	if err := stmt.QueryRowContext(ctx, pseudo).Scan(&userID, &stored, &hash); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return 0, "", "", ErrUserNotFound
		}
		return 0, "", "", err
	}
	return userID, stored, hash, nil
}

// FindRole renvoie le rôle d'un compte : user, admin ou bloque.
func FindRole(ctx context.Context, userID int64) (string, error) {
	stmt, err := storage.Stmt(querySelectRole)
	if err != nil {
		return "", err
	}
	var role string
	if err := stmt.QueryRowContext(ctx, userID).Scan(&role); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", ErrUserNotFound
		}
		return "", err
	}
	return role, nil
}

// FindPseudo renvoie le pseudo d'un compte.
func FindPseudo(ctx context.Context, userID int64) (string, error) {
	stmt, err := storage.Stmt(querySelectPseudo)
	if err != nil {
		return "", err
	}

	var pseudo string
	if err := stmt.QueryRowContext(ctx, userID).Scan(&pseudo); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", ErrUserNotFound
		}
		return "", err
	}
	return pseudo, nil
}

// StoreRefreshToken enregistre un refresh token et purge au passage les jetons expirés
// du même utilisateur, pour que la table ne grossisse pas indéfiniment.
func StoreRefreshToken(ctx context.Context, tokenID string, userID, expiresAt, now int64) error {
	tx, err := storage.DB().BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	purge, err := storage.Stmt(queryPurgeExpiredTokens)
	if err != nil {
		return err
	}
	if _, err := tx.StmtContext(ctx, purge).ExecContext(ctx, userID, now); err != nil {
		return err
	}

	insert, err := storage.Stmt(queryInsertRefreshToken)
	if err != nil {
		return err
	}
	if _, err := tx.StmtContext(ctx, insert).ExecContext(ctx, tokenID, userID, expiresAt); err != nil {
		return err
	}
	return tx.Commit()
}

// ConsumeRefreshToken supprime le jeton s'il est valide et renvoie son propriétaire.
func ConsumeRefreshToken(ctx context.Context, tokenID string, now int64) (int64, error) {
	stmt, err := storage.Stmt(queryConsumeRefreshToken)
	if err != nil {
		return 0, err
	}

	var userID int64
	if err := stmt.QueryRowContext(ctx, tokenID, now).Scan(&userID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return 0, ErrTokenNotFound
		}
		return 0, err
	}
	return userID, nil
}

// DeleteRefreshToken révoque un jeton ; sans effet s'il n'existe plus.
func DeleteRefreshToken(ctx context.Context, tokenID string) error {
	stmt, err := storage.Stmt(queryDeleteRefreshToken)
	if err != nil {
		return err
	}
	_, err = stmt.ExecContext(ctx, tokenID)
	return err
}
