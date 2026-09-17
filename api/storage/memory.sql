-- Base en RAM, recréée vide à chaque démarrage.

-- Échecs de connexion par couple pseudo + IP. Au-delà du seuil, le couple est banni : la
-- connexion est refusée avant tout calcul de hash. La ligne expire 5 min après le dernier
-- échec compté ; une fois expirée, elle est purgée et le couple repart de zéro.
CREATE TABLE IF NOT EXISTS BANNI (
	pseudo		TEXT NOT NULL COLLATE NOCASE,
	ip			TEXT NOT NULL,
	echecs		INTEGER NOT NULL,
	expires_at	INTEGER NOT NULL,
	PRIMARY KEY (pseudo, ip)
) STRICT, WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS idx_banni_expires ON BANNI(expires_at);
