import * as SQLite from 'expo-sqlite';

async function updateField(
	db: SQLite.SQLiteDatabase,
	table: string,
	idColumn: string,
	field: string,
	id: number,
	value: string | number | null
): Promise<void> {
	await db.runAsync(`UPDATE ${table} SET ${field} = ? WHERE ${idColumn} = ?`, value, id);
}

async function deleteRow(
	db: SQLite.SQLiteDatabase,
	table: string,
	idColumn: string,
	id: number
): Promise<void> {
	await db.runAsync(`DELETE FROM ${table} WHERE ${idColumn} = ?`, id);
}

export type Revenu = {
	id_revenu:	number;
	label:		string;
	valeur:		number | null;
	ordre:		number | null;
};

export async function getRevenus(db: SQLite.SQLiteDatabase): Promise<Revenu[]> {
	return db.getAllAsync<Revenu>('SELECT * FROM REVENU ORDER BY ordre');
}

export async function addRevenu(
	db: SQLite.SQLiteDatabase,
	label: string,
	valeur: number | null = 0,
	ordre: number | null = null
): Promise<number> {
	const result = await db.runAsync(
		'INSERT INTO REVENU (label, valeur, ordre) VALUES (?, ?, ?)',
		label, valeur, ordre
	);
	return result.lastInsertRowId;
}

export const updateRevenuLabel = (db: SQLite.SQLiteDatabase, id: number, label: string) =>
	updateField(db, 'REVENU', 'id_revenu', 'label', id, label);

export const updateRevenuValeur = (db: SQLite.SQLiteDatabase, id: number, valeur: number | null) =>
	updateField(db, 'REVENU', 'id_revenu', 'valeur', id, valeur);

export const updateRevenuOrdre = (db: SQLite.SQLiteDatabase, id: number, ordre: number | null) =>
	updateField(db, 'REVENU', 'id_revenu', 'ordre', id, ordre);

export const deleteRevenu = (db: SQLite.SQLiteDatabase, id: number) =>
	deleteRow(db, 'REVENU', 'id_revenu', id);

export type DepenseGroup = {
	id_depense_group:	number;
	label:				string;
	ordre:				number | null;
	couleur:			string | null;
};

export type Depense = {
	id_depense:			number;
	label:				string;
	valeur:				number | null;
	ordre:				number | null;
	id_depense_group:	number;
};

export async function getDepenseGroups(db: SQLite.SQLiteDatabase): Promise<DepenseGroup[]> {
	return db.getAllAsync<DepenseGroup>('SELECT * FROM DEPENSE_GROUP ORDER BY ordre');
}

export async function addDepenseGroup(
	db: SQLite.SQLiteDatabase,
	label: string,
	couleur: string | null = null,
	ordre: number | null = null
): Promise<number> {
	const result = await db.runAsync(
		'INSERT INTO DEPENSE_GROUP (label, ordre, couleur) VALUES (?, ?, ?)',
		label, ordre, couleur
	);
	return result.lastInsertRowId;
}

export const updateDepenseGroupLabel = (db: SQLite.SQLiteDatabase, id: number, label: string) =>
	updateField(db, 'DEPENSE_GROUP', 'id_depense_group', 'label', id, label);

export const updateDepenseGroupCouleur = (db: SQLite.SQLiteDatabase, id: number, couleur: string | null) =>
	updateField(db, 'DEPENSE_GROUP', 'id_depense_group', 'couleur', id, couleur);

export const updateDepenseGroupOrdre = (db: SQLite.SQLiteDatabase, id: number, ordre: number | null) =>
	updateField(db, 'DEPENSE_GROUP', 'id_depense_group', 'ordre', id, ordre);

export const deleteDepenseGroup = (db: SQLite.SQLiteDatabase, id: number) =>
	// ON DELETE CASCADE (schema.ts) supprime les DEPENSE du groupe automatiquement
	deleteRow(db, 'DEPENSE_GROUP', 'id_depense_group', id);

export async function getDepenses(db: SQLite.SQLiteDatabase): Promise<Depense[]> {
	return db.getAllAsync<Depense>('SELECT * FROM DEPENSE ORDER BY id_depense_group, ordre');
}

export async function addDepense(
	db: SQLite.SQLiteDatabase,
	label: string,
	id_depense_group: number,
	valeur: number | null = 0,
	ordre: number | null = null
): Promise<number> {
	const result = await db.runAsync(
		'INSERT INTO DEPENSE (label, valeur, ordre, id_depense_group) VALUES (?, ?, ?, ?)',
		label, valeur, ordre, id_depense_group
	);
	return result.lastInsertRowId;
}

export const updateDepenseLabel = (db: SQLite.SQLiteDatabase, id: number, label: string) =>
	updateField(db, 'DEPENSE', 'id_depense', 'label', id, label);

export const updateDepenseValeur = (db: SQLite.SQLiteDatabase, id: number, valeur: number | null) =>
	updateField(db, 'DEPENSE', 'id_depense', 'valeur', id, valeur);

export const updateDepenseOrdre = (db: SQLite.SQLiteDatabase, id: number, ordre: number | null) =>
	updateField(db, 'DEPENSE', 'id_depense', 'ordre', id, ordre);

export const deleteDepense = (db: SQLite.SQLiteDatabase, id: number) =>
	deleteRow(db, 'DEPENSE', 'id_depense', id);

export type ProfilInvest = {
	id_profil_inv:		number;
	label:				string;
	taux:				number | null;
	style_acquisition:	string | null;
	couleur:			string | null;
};

export type Action = {
	id_action:			number;
	label:				string;
	ordre:				number | null;
	prix:				number | null;
	nb_part_acquis:		number | null;
	div:				number | null;
	prix_inv:			number | null;
	nb_inv:				number | null;
	id_profil_inv:		number;
};

export type VersementDiv = {
	id_action:	number;
	mois:		number;
};

export async function getProfilsInvest(db: SQLite.SQLiteDatabase): Promise<ProfilInvest[]> {
	return db.getAllAsync<ProfilInvest>('SELECT * FROM PROFIL_INVEST ORDER BY id_profil_inv');
}

export async function addProfilInvest(
	db: SQLite.SQLiteDatabase,
	label: string,
	taux: number | null = 0,
	style_acquisition: string | null = 'montant',
	couleur: string | null = null
): Promise<number> {
	const result = await db.runAsync(
		'INSERT INTO PROFIL_INVEST (label, taux, style_acquisition, couleur) VALUES (?, ?, ?, ?)',
		label, taux, style_acquisition, couleur
	);
	return result.lastInsertRowId;
}

export const updateProfilInvestLabel = (db: SQLite.SQLiteDatabase, id: number, label: string) =>
	updateField(db, 'PROFIL_INVEST', 'id_profil_inv', 'label', id, label);

export const updateProfilInvestTaux = (db: SQLite.SQLiteDatabase, id: number, taux: number | null) =>
	updateField(db, 'PROFIL_INVEST', 'id_profil_inv', 'taux', id, taux);

export const updateProfilInvestStyleAcquisition = (db: SQLite.SQLiteDatabase, id: number, style_acquisition: string) =>
	updateField(db, 'PROFIL_INVEST', 'id_profil_inv', 'style_acquisition', id, style_acquisition);

export const updateProfilInvestCouleur = (db: SQLite.SQLiteDatabase, id: number, couleur: string | null) =>
	updateField(db, 'PROFIL_INVEST', 'id_profil_inv', 'couleur', id, couleur);

export const deleteProfilInvest = (db: SQLite.SQLiteDatabase, id: number) =>
	// ON DELETE CASCADE (schema.ts) supprime les ACTION (et leurs VERSEMENT_DIV) du profil automatiquement
	deleteRow(db, 'PROFIL_INVEST', 'id_profil_inv', id);

export async function getActions(db: SQLite.SQLiteDatabase): Promise<Action[]> {
	return db.getAllAsync<Action>('SELECT * FROM ACTION ORDER BY id_profil_inv, ordre');
}

export async function addAction(
	db: SQLite.SQLiteDatabase,
	label: string,
	id_profil_inv: number,
	ordre: number | null = null
): Promise<number> {
	const result = await db.runAsync(
		'INSERT INTO ACTION (label, ordre, nb_part_acquis, prix_inv, nb_inv, id_profil_inv) VALUES (?, ?, 0, 0, 0, ?)',
		label, ordre, id_profil_inv
	);
	return result.lastInsertRowId;
}

export const updateActionLabel = (db: SQLite.SQLiteDatabase, id: number, label: string) =>
	updateField(db, 'ACTION', 'id_action', 'label', id, label);

export const updateActionOrdre = (db: SQLite.SQLiteDatabase, id: number, ordre: number | null) =>
	updateField(db, 'ACTION', 'id_action', 'ordre', id, ordre);

export const updateActionPrix = (db: SQLite.SQLiteDatabase, id: number, prix: number | null) =>
	updateField(db, 'ACTION', 'id_action', 'prix', id, prix);

export const updateActionNbPartAcquis = (db: SQLite.SQLiteDatabase, id: number, nb_part_acquis: number | null) =>
	updateField(db, 'ACTION', 'id_action', 'nb_part_acquis', id, nb_part_acquis);

export const updateActionDiv = (db: SQLite.SQLiteDatabase, id: number, div: number | null) =>
	updateField(db, 'ACTION', 'id_action', 'div', id, div);

export const updateActionPrixInv = (db: SQLite.SQLiteDatabase, id: number, prix_inv: number | null) =>
	updateField(db, 'ACTION', 'id_action', 'prix_inv', id, prix_inv);

export const updateActionNbInv = (db: SQLite.SQLiteDatabase, id: number, nb_inv: number | null) =>
	updateField(db, 'ACTION', 'id_action', 'nb_inv', id, nb_inv);

export const deleteAction = (db: SQLite.SQLiteDatabase, id: number) =>
	// ON DELETE CASCADE (schema.ts) supprime les VERSEMENT_DIV de l'action automatiquement
	deleteRow(db, 'ACTION', 'id_action', id);

export async function getVersementsDiv(db: SQLite.SQLiteDatabase): Promise<VersementDiv[]> {
	return db.getAllAsync<VersementDiv>('SELECT * FROM VERSEMENT_DIV');
}

export async function addVersementDiv(db: SQLite.SQLiteDatabase, id_action: number, mois: number): Promise<void> {
	await db.runAsync('INSERT OR IGNORE INTO VERSEMENT_DIV (id_action, mois) VALUES (?, ?)', id_action, mois);
}

export async function removeVersementDiv(db: SQLite.SQLiteDatabase, id_action: number, mois: number): Promise<void> {
	await db.runAsync('DELETE FROM VERSEMENT_DIV WHERE id_action = ? AND mois = ?', id_action, mois);
}

export async function clearVersementsDiv(db: SQLite.SQLiteDatabase, id_action: number): Promise<void> {
	await db.runAsync('DELETE FROM VERSEMENT_DIV WHERE id_action = ?', id_action);
}

export async function setAllVersementsDiv(db: SQLite.SQLiteDatabase, id_action: number, mois: number[]): Promise<void> {
	await clearVersementsDiv(db, id_action);
	for (const m of mois) {
		await addVersementDiv(db, id_action, m);
	}
}

export type Banned = {
	id_banned:	number;
	label:		string; // titre de la section (ex: "Actions bannies")
	texte:		string | null; // contenu libre de la section
};

export async function getBanned(db: SQLite.SQLiteDatabase): Promise<Banned[]> {
	return db.getAllAsync<Banned>('SELECT * FROM BANNED ORDER BY id_banned');
}

export async function addBanned(db: SQLite.SQLiteDatabase, label: string, texte: string | null = null): Promise<number> {
	const result = await db.runAsync('INSERT INTO BANNED (label, texte) VALUES (?, ?)', label, texte);
	return result.lastInsertRowId;
}

export const updateBannedLabel = (db: SQLite.SQLiteDatabase, id: number, label: string) =>
	updateField(db, 'BANNED', 'id_banned', 'label', id, label);

export const updateBannedTexte = (db: SQLite.SQLiteDatabase, id: number, texte: string) =>
	updateField(db, 'BANNED', 'id_banned', 'texte', id, texte);

export const deleteBanned = (db: SQLite.SQLiteDatabase, id: number) =>
	deleteRow(db, 'BANNED', 'id_banned', id);

export type Bilan = {
	id_bilan:		number;
	valeur:			number | null;
	gain:			number | null;
	date:			string; // 'YYYY-MM-01'
	label:			string | null; // copie de l'enveloppe au moment de la saisie
	couleur:		string | null;
	id_profil_inv:	number | null; // null si l'enveloppe d'origine a été supprimée
};

export async function getBilans(db: SQLite.SQLiteDatabase): Promise<Bilan[]> {
	return db.getAllAsync<Bilan>('SELECT * FROM BILAN ORDER BY date');
}

export async function addBilan(
	db: SQLite.SQLiteDatabase,
	id_profil_inv: number,
	date: string,
	valeur: number | null,
	gain: number | null,
	label: string,
	couleur: string | null
): Promise<number> {
	const result = await db.runAsync(
		'INSERT INTO BILAN (id_profil_inv, date, valeur, gain, label, couleur) VALUES (?, ?, ?, ?, ?, ?)',
		id_profil_inv, date, valeur, gain, label, couleur
	);
	return result.lastInsertRowId;
}

export const updateBilanValeur = (db: SQLite.SQLiteDatabase, id: number, valeur: number | null) =>
	updateField(db, 'BILAN', 'id_bilan', 'valeur', id, valeur);

export const updateBilanGain = (db: SQLite.SQLiteDatabase, id: number, gain: number | null) =>
	updateField(db, 'BILAN', 'id_bilan', 'gain', id, gain);

export const deleteBilan = (db: SQLite.SQLiteDatabase, id: number) =>
	deleteRow(db, 'BILAN', 'id_bilan', id);

// Ligne fantôme (enveloppe supprimée, id_profil_inv passé à NULL par ON DELETE SET NULL)
// restée sans aucune saisie : ne sert plus à rien, on la retire.
export async function deleteEmptyGhostBilans(db: SQLite.SQLiteDatabase): Promise<void> {
	await db.runAsync('DELETE FROM BILAN WHERE id_profil_inv IS NULL AND valeur IS NULL AND gain IS NULL');
}

export type Projection = {
	id_projection:	number;
	valeur:			number | null;
	gain:			number | null;
	annee:			number;
	label:			string | null; // copie de l'enveloppe au moment de l'enregistrement
	couleur:		string | null;
	id_profil_inv:	number | null; // null si l'enveloppe d'origine a été supprimée
};

export async function getProjections(db: SQLite.SQLiteDatabase): Promise<Projection[]> {
	return db.getAllAsync<Projection>('SELECT * FROM PROJECTION ORDER BY annee');
}

export async function addProjection(
	db: SQLite.SQLiteDatabase,
	id_profil_inv: number,
	annee: number,
	valeur: number | null,
	gain: number | null,
	label: string,
	couleur: string | null
): Promise<number> {
	const result = await db.runAsync(
		'INSERT INTO PROJECTION (id_profil_inv, annee, valeur, gain, label, couleur) VALUES (?, ?, ?, ?, ?, ?)',
		id_profil_inv, annee, valeur, gain, label, couleur
	);
	return result.lastInsertRowId;
}

export const updateProjectionValeur = (db: SQLite.SQLiteDatabase, id: number, valeur: number | null) =>
	updateField(db, 'PROJECTION', 'id_projection', 'valeur', id, valeur);

export const updateProjectionGain = (db: SQLite.SQLiteDatabase, id: number, gain: number | null) =>
	updateField(db, 'PROJECTION', 'id_projection', 'gain', id, gain);
