-- Schéma appliqué à chaque démarrage : chaque instruction est idempotente.
-- Tables STRICT : SQLite refuse une valeur du mauvais type au lieu de la convertir.
-- Les tables racines portent id_utilisateur ; les tables enfants héritent de la
-- propriété par leur parent (DEPENSE → DEPENSE_GROUP, ACTION → PROFIL_INVEST).
-- Tables communes à tous les utilisateurs : MARCHE, TITRE, VERSEMENT_DIV, PRIX_HISTORIQUE.
-- Rien n'est supprimé côté investissement : PROFIL_INVEST et ACTION s'archivent (archive_le),
-- leur journal MOUVEMENT reste et continue de compter dans le patrimoine.

CREATE TABLE IF NOT EXISTS UTILISATEUR (
	id_utilisateur	INTEGER PRIMARY KEY AUTOINCREMENT,
	pseudo			TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (length(pseudo) BETWEEN 3 AND 32),
	password_hash	TEXT NOT NULL,
	-- Une seule colonne : admin et bloqué s'excluent par construction.
	-- bloque : n'écrit plus le catalogue commun, ne voit que ses PRIX_PERSO.
	role			TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin', 'bloque')),
	created_at		INTEGER NOT NULL DEFAULT (unixepoch()),
	-- Compte supprimé par un admin : plus de connexion, données et pseudo conservés.
	archive_le		TEXT CHECK (archive_le IS NULL OR archive_le IS date(archive_le))
) STRICT;

-- Un refresh token n'est valable que tant que sa ligne existe : le supprimer le révoque.
CREATE TABLE IF NOT EXISTS REFRESH_TOKEN (
	id_token		TEXT PRIMARY KEY,
	id_utilisateur	INTEGER NOT NULL,
	expires_at		INTEGER NOT NULL,
	CONSTRAINT fk_refresh_utilisateur FOREIGN KEY (id_utilisateur) REFERENCES UTILISATEUR(id_utilisateur) ON DELETE CASCADE
) STRICT, WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS PROFIL_INVEST (
	id_profil_inv		INTEGER PRIMARY KEY AUTOINCREMENT,
	id_utilisateur		INTEGER NOT NULL,
	label				TEXT NOT NULL,
	taux				REAL,
	style_acquisition	TEXT NOT NULL DEFAULT 'montant' CHECK (style_acquisition IN ('parts', 'montant')),
	couleur				TEXT CHECK (length(couleur) = 6),
	archive_le			TEXT CHECK (archive_le IS NULL OR archive_le IS date(archive_le)),
	CONSTRAINT fk_profil_utilisateur FOREIGN KEY (id_utilisateur) REFERENCES UTILISATEUR(id_utilisateur) ON DELETE CASCADE
) STRICT;

-- Catalogue commun. Le prix et le dividende sont partagés : un utilisateur qui corrige le
-- prix le corrige pour tous (trace dans PRIX_HISTORIQUE). Un titre = nom + marché.
CREATE TABLE IF NOT EXISTS MARCHE (
	id_marche	INTEGER PRIMARY KEY AUTOINCREMENT,
	label		TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (length(label) BETWEEN 1 AND 64)
) STRICT;

CREATE TABLE IF NOT EXISTS TITRE (
	id_titre	INTEGER PRIMARY KEY AUTOINCREMENT,
	nom			TEXT NOT NULL COLLATE NOCASE CHECK (length(nom) BETWEEN 1 AND 128),
	id_marche	INTEGER NOT NULL,
	prix		REAL,
	div			REAL,	-- montant d'un versement, pas annuel
	UNIQUE (nom, id_marche),
	CONSTRAINT fk_titre_marche FOREIGN KEY (id_marche) REFERENCES MARCHE(id_marche)
) STRICT;

-- Trace de chaque modification du prix commun : qui, quand, avant → après.
CREATE TABLE IF NOT EXISTS PRIX_HISTORIQUE (
	id_prix_historique	INTEGER PRIMARY KEY AUTOINCREMENT,
	id_titre			INTEGER NOT NULL,
	id_utilisateur		INTEGER,
	avant				REAL,
	apres				REAL,
	modifie_le			INTEGER NOT NULL DEFAULT (unixepoch()),
	CONSTRAINT fk_ph_titre FOREIGN KEY (id_titre) REFERENCES TITRE(id_titre) ON DELETE CASCADE,
	CONSTRAINT fk_ph_utilisateur FOREIGN KEY (id_utilisateur) REFERENCES UTILISATEUR(id_utilisateur) ON DELETE SET NULL
) STRICT;

-- Prix personnel d'un utilisateur bloqué : prime sur le prix commun pour lui seul.
CREATE TABLE IF NOT EXISTS PRIX_PERSO (
	id_utilisateur	INTEGER NOT NULL,
	id_titre		INTEGER NOT NULL,
	prix			REAL,
	PRIMARY KEY (id_utilisateur, id_titre),
	CONSTRAINT fk_pp_utilisateur FOREIGN KEY (id_utilisateur) REFERENCES UTILISATEUR(id_utilisateur) ON DELETE CASCADE,
	CONSTRAINT fk_pp_titre FOREIGN KEY (id_titre) REFERENCES TITRE(id_titre) ON DELETE CASCADE
) STRICT, WITHOUT ROWID;

-- Position : un titre dans une enveloppe. Prix, dividende et nom viennent du titre.
-- Une position à 0 part est masquée mais conservée ; racheter le même titre la réactive
-- (UNIQUE enveloppe + titre).
CREATE TABLE IF NOT EXISTS ACTION (
	id_action		INTEGER PRIMARY KEY AUTOINCREMENT,
	id_profil_inv	INTEGER NOT NULL,
	id_titre		INTEGER NOT NULL,
	ordre			INTEGER NOT NULL,
	nb_part_acquis	REAL,
	prix_inv		REAL,
	nb_inv			REAL,
	archive_le		TEXT CHECK (archive_le IS NULL OR archive_le IS date(archive_le)),
	UNIQUE (id_profil_inv, id_titre),
	CONSTRAINT fk_action_profil FOREIGN KEY (id_profil_inv) REFERENCES PROFIL_INVEST(id_profil_inv) ON DELETE CASCADE,
	CONSTRAINT fk_action_titre FOREIGN KEY (id_titre) REFERENCES TITRE(id_titre)
) STRICT;

-- Mois de versement du dividende : propriété du titre, commune à tous.
CREATE TABLE IF NOT EXISTS VERSEMENT_DIV (
	id_titre	INTEGER NOT NULL,
	mois		INTEGER NOT NULL CHECK (mois BETWEEN 1 AND 12),
	PRIMARY KEY (id_titre, mois),
	CONSTRAINT fk_versement_titre FOREIGN KEY (id_titre) REFERENCES TITRE(id_titre) ON DELETE CASCADE
) STRICT, WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS DEPENSE_GROUP (
	id_depense_group	INTEGER PRIMARY KEY AUTOINCREMENT,
	id_utilisateur		INTEGER NOT NULL,
	label				TEXT NOT NULL,
	ordre				INTEGER NOT NULL,
	couleur				TEXT CHECK (length(couleur) = 6),
	CONSTRAINT fk_group_utilisateur FOREIGN KEY (id_utilisateur) REFERENCES UTILISATEUR(id_utilisateur) ON DELETE CASCADE
) STRICT;

CREATE TABLE IF NOT EXISTS DEPENSE (
	id_depense			INTEGER PRIMARY KEY AUTOINCREMENT,
	label				TEXT NOT NULL,
	valeur				REAL,
	ordre				INTEGER NOT NULL,
	id_depense_group	INTEGER NOT NULL,
	CONSTRAINT fk_depense_group FOREIGN KEY (id_depense_group) REFERENCES DEPENSE_GROUP(id_depense_group) ON DELETE CASCADE
) STRICT;

CREATE TABLE IF NOT EXISTS REVENU (
	id_revenu		INTEGER PRIMARY KEY AUTOINCREMENT,
	id_utilisateur	INTEGER NOT NULL,
	label			TEXT NOT NULL,
	valeur			REAL,
	ordre			INTEGER,
	CONSTRAINT fk_revenu_utilisateur FOREIGN KEY (id_utilisateur) REFERENCES UTILISATEUR(id_utilisateur) ON DELETE CASCADE
) STRICT;

-- Journal des achats et ventes validés. Chaque mouvement répercute nb_part sur
-- ACTION.nb_part_acquis dans la même transaction : ce qui n'est pas validé n'a pas eu lieu.
CREATE TABLE IF NOT EXISTS MOUVEMENT (
	id_mouvement	INTEGER PRIMARY KEY AUTOINCREMENT,
	id_action		INTEGER NOT NULL,
	date			TEXT NOT NULL CHECK (date IS date(date)),
	sens			TEXT NOT NULL CHECK (sens IN ('achat', 'vente')),
	nb_part			REAL NOT NULL CHECK (nb_part > 0),
	prix			REAL,
	CONSTRAINT fk_mouvement_action FOREIGN KEY (id_action) REFERENCES ACTION(id_action) ON DELETE CASCADE
) STRICT;

CREATE TABLE IF NOT EXISTS BANNED (
	id_banned		INTEGER PRIMARY KEY AUTOINCREMENT,
	id_utilisateur	INTEGER NOT NULL,
	label			TEXT NOT NULL,
	texte			TEXT,
	CONSTRAINT fk_banned_utilisateur FOREIGN KEY (id_utilisateur) REFERENCES UTILISATEUR(id_utilisateur) ON DELETE CASCADE
) STRICT;

-- Sans index, chaque filtre par propriétaire et chaque ON DELETE parcourt la table entière.
CREATE INDEX IF NOT EXISTS idx_refresh_utilisateur	ON REFRESH_TOKEN(id_utilisateur);
CREATE INDEX IF NOT EXISTS idx_profil_utilisateur	ON PROFIL_INVEST(id_utilisateur);
CREATE INDEX IF NOT EXISTS idx_action_profil		ON ACTION(id_profil_inv);
CREATE INDEX IF NOT EXISTS idx_action_titre		ON ACTION(id_titre);
CREATE INDEX IF NOT EXISTS idx_titre_marche		ON TITRE(id_marche);
CREATE INDEX IF NOT EXISTS idx_ph_titre			ON PRIX_HISTORIQUE(id_titre, modifie_le);
CREATE INDEX IF NOT EXISTS idx_group_utilisateur	ON DEPENSE_GROUP(id_utilisateur);
CREATE INDEX IF NOT EXISTS idx_depense_group		ON DEPENSE(id_depense_group);
CREATE INDEX IF NOT EXISTS idx_revenu_utilisateur	ON REVENU(id_utilisateur);
CREATE INDEX IF NOT EXISTS idx_banned_utilisateur	ON BANNED(id_utilisateur);
CREATE INDEX IF NOT EXISTS idx_mouvement_action		ON MOUVEMENT(id_action, date);

-- Marché par défaut ; l'utilisateur en ajoute d'autres depuis le catalogue.
INSERT INTO MARCHE (label) VALUES ('Trade Republic') ON CONFLICT DO NOTHING;
