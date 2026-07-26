import * as SQLite from 'expo-sqlite';

// Ordre d'insertion : les tables référencées (parents) avant celles qui les référencent (enfants),
// pour que les clés étrangères existent déjà au moment de l'INSERT. La suppression se fait dans
// l'ordre inverse, enfants d'abord, pour ne jamais violer une contrainte pendant l'import.
const TABLES = [
	'PROFIL_INVEST',
	'DEPENSE_GROUP',
	'REVENU',
	'BANNED',
	'ACTION',
	'BILAN',
	'PROJECTION',
	'DEPENSE',
	'VERSEMENT_DIV',
];

const BACKUP_VERSION = 1;

export type BackupData = {
	version:	number;
	exportedAt:	string;
	tables:		Record<string, Record<string, unknown>[]>;
};

export async function dumpDatabase(db: SQLite.SQLiteDatabase): Promise<BackupData> {
	const tables: Record<string, Record<string, unknown>[]> = {};
	for (const table of TABLES) {
		tables[table] = await db.getAllAsync<Record<string, unknown>>(`SELECT * FROM ${table}`);
	}
	return { version: BACKUP_VERSION, exportedAt: new Date().toISOString(), tables };
}

export async function restoreDatabase(db: SQLite.SQLiteDatabase, data: BackupData): Promise<void> {
	if (!data || typeof data !== 'object' || !data.tables) {
		throw new Error('Fichier invalide : structure de sauvegarde non reconnue');
	}

	await db.withExclusiveTransactionAsync(async (txn) => {
		for (const table of [...TABLES].reverse()) {
			await txn.execAsync(`DELETE FROM ${table}`);
		}
		for (const table of TABLES) {
			const rows = data.tables[table] ?? [];
			for (const row of rows) {
				const columns = Object.keys(row);
				if (columns.length === 0) continue;
				const placeholders = columns.map(() => '?').join(', ');
				await txn.runAsync(
					`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`,
					columns.map((c) => row[c] as string | number | null)
				);
			}
		}
	});
}
