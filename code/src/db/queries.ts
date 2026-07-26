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
	valeur: number | null = null,
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
	valeur: number | null = null,
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
