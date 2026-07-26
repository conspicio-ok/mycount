CREATE TABLE PROFIL_INVEST (
	id_profil_inv		INTEGER PRIMARY KEY,
	label				VARCHAR(24) NOT NULL,
	taux				REAL,
	style_acquisition	VARCHAR(24),
	couleur				CHAR(6)
);

CREATE TABLE ACTION (
	id_action		INTEGER PRIMARY KEY,
	label			VARCHAR(24) NOT NULL,
	ordre			INTEGER,
	prix			REAL,
	nb_part_acquis	REAL,
	div				REAL,
	prix_inv		REAL,
	nb_inv			INTEGER,
	id_profil_inv	INTEGER NOT NULL REFERENCES PROFIL_INVEST(id_profil_inv) ON DELETE CASCADE
);

CREATE TABLE BANNED (
	id_banned	INTEGER PRIMARY KEY,
	texte		VARCHAR(24) NOT NULL
);

CREATE TABLE BILAN (
	id_bilan		INTEGER PRIMARY KEY,
	valeur			REAL,
	gain			REAL,
	date			DATE,
	id_profil_inv	INTEGER NOT NULL REFERENCES PROFIL_INVEST(id_profil_inv) ON DELETE CASCADE,
	UNIQUE (id_profil_inv, date)
);

CREATE TABLE DEPENSE_GROUP (
	id_depense_group	INTEGER PRIMARY KEY,
	label				VARCHAR(24) NOT NULL,
	ordre				INTEGER,
	couleur				CHAR(6)
);

CREATE TABLE DEPENSE (
	id_depense			INTEGER PRIMARY KEY,
	label				VARCHAR(24) NOT NULL,
	valeur				REAL,
	ordre				INTEGER,
	id_depense_group	INTEGER NOT NULL REFERENCES DEPENSE_GROUP(id_depense_group) ON DELETE CASCADE
);

CREATE TABLE REVENU (
	id_revenu	INTEGER PRIMARY KEY,
	label		VARCHAR(24) NOT NULL,
	valeur		REAL,
	ordre		INTEGER
);

CREATE TABLE VERSEMENT_DIV (
	id_action	INTEGER NOT NULL REFERENCES ACTION(id_action) ON DELETE CASCADE,
	mois		INTEGER CHECK (mois BETWEEN 1 AND 12),
	PRIMARY KEY (id_action, mois)
);
