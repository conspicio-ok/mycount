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

// Allowlist des colonnes valides par table (miroir de schema.ts) : un fichier de sauvegarde
// est du JSON arbitraire fourni par l'utilisateur (choisi via le sélecteur de fichier) — sans
// ça, une clé de colonne forgée (ex: "x); DROP TABLE REVENU;--") s'insère telle quelle dans le
// SQL généré dynamiquement (INSERT INTO table (${columns}) ...), permettant une injection SQL.
const TABLE_COLUMNS: Record<string, string[]> = {
	PROFIL_INVEST:	['id_profil_inv', 'label', 'taux', 'style_acquisition', 'couleur'],
	DEPENSE_GROUP:	['id_depense_group', 'label', 'ordre', 'couleur'],
	REVENU:			['id_revenu', 'label', 'valeur', 'ordre'],
	BANNED:			['id_banned', 'label', 'texte'],
	ACTION:			['id_action', 'label', 'ordre', 'prix', 'nb_part_acquis', 'div', 'prix_inv', 'nb_inv', 'id_profil_inv'],
	BILAN:			['id_bilan', 'valeur', 'gain', 'date', 'label', 'couleur', 'id_profil_inv'],
	PROJECTION:		['id_projection', 'valeur', 'gain', 'annee', 'label', 'couleur', 'id_profil_inv'],
	DEPENSE:		['id_depense', 'label', 'valeur', 'ordre', 'id_depense_group'],
	VERSEMENT_DIV:	['id_action', 'mois'],
};

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

// Valide la structure complète AVANT de toucher à la base : une valeur (type ou clé) invalide
// doit faire échouer tout l'import, pas seulement la ligne en cours après que les tables aient
// déjà été vidées — sinon un fichier corrompu au milieu de l'import laisse la base à moitié détruite.
function validateBackupShape(data: BackupData): void {
	for (const table of TABLES) {
		const allowedColumns = TABLE_COLUMNS[table];
		const rows = data.tables[table] ?? [];
		if (!Array.isArray(rows)) {
			throw new Error(`Fichier invalide : "${table}" n'est pas une liste de lignes`);
		}
		for (const row of rows) {
			if (!row || typeof row !== 'object' || Array.isArray(row)) {
				throw new Error(`Fichier invalide : une ligne de "${table}" n'est pas un objet`);
			}
			for (const [key, value] of Object.entries(row)) {
				if (!allowedColumns.includes(key)) {
					throw new Error(`Fichier invalide : colonne inconnue "${key}" dans "${table}"`);
				}
				if (value !== null && typeof value !== 'string' && typeof value !== 'number') {
					throw new Error(`Fichier invalide : valeur non supportée pour "${table}.${key}"`);
				}
			}
		}
	}
}

export async function restoreDatabase(db: SQLite.SQLiteDatabase, data: BackupData): Promise<void> {
	if (!data || typeof data !== 'object' || !data.tables) {
		throw new Error('Fichier invalide : structure de sauvegarde non reconnue');
	}
	validateBackupShape(data);

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
