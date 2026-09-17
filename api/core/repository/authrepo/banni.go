package authrepo

import (
	"context"

	"mycount/storage"
)

// Table BANNI, en RAM (storage.MemDB) : les seuils et durées sont fixés par l'appelant.

const (
	queryIsBanned = `
		SELECT EXISTS (
			SELECT 1 FROM BANNI
			WHERE pseudo = ? AND ip = ? AND echecs >= ? AND expires_at > ?
		)
	`

	queryPurgeBanni = `
		DELETE FROM BANNI
		WHERE expires_at <= ?
	`

	// Chaque échec repousse l'expiration : le couple est libéré 5 min après son dernier échec.
	queryRecordFailure = `
		INSERT INTO BANNI (pseudo, ip, echecs, expires_at) VALUES (?, ?, 1, ?)
		ON CONFLICT (pseudo, ip) DO UPDATE SET echecs = echecs + 1, expires_at = excluded.expires_at
	`

	queryClearFailures = `
		DELETE FROM BANNI
		WHERE pseudo = ? AND ip = ?
	`
)

// IsBanned indique si le couple pseudo + IP a atteint maxFailures échecs non expirés.
func IsBanned(ctx context.Context, pseudo, ip string, maxFailures int, now int64) (bool, error) {
	var banned bool
	err := storage.MemDB().QueryRowContext(ctx, queryIsBanned, pseudo, ip, maxFailures, now).Scan(&banned)
	return banned, err
}

// RecordFailure compte un échec et purge au passage les lignes expirées, pour que la table
// ne garde jamais plus de 5 min d'échecs.
func RecordFailure(ctx context.Context, pseudo, ip string, now, expiresAt int64) error {
	memDB := storage.MemDB()
	if _, err := memDB.ExecContext(ctx, queryPurgeBanni, now); err != nil {
		return err
	}
	_, err := memDB.ExecContext(ctx, queryRecordFailure, pseudo, ip, expiresAt)
	return err
}

// ClearFailures efface les échecs du couple après une connexion réussie.
func ClearFailures(ctx context.Context, pseudo, ip string) error {
	_, err := storage.MemDB().ExecContext(ctx, queryClearFailures, pseudo, ip)
	return err
}
