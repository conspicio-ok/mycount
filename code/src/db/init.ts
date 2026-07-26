import * as SQLite from 'expo-sqlite';
import { SCHEMA } from './schema';

type FkTable = {
    table:				string;
    fkColumn:			string;
    expectedOnDelete:	'CASCADE' | 'SET NULL';
    requireNullable:	boolean; // true pour SET NULL : la colonne doit aussi accepter NULL
    columnsSql:			string; // corps de la définition (colonnes + contraintes), sans le "CREATE TABLE <nom> ("
};

// Tables dont la clause ON DELETE (CASCADE ou SET NULL) a été ajoutée/changée après leur
// création initiale sur les installations existantes : `CREATE TABLE IF NOT EXISTS` ne touche
// jamais une table déjà présente, donc une base créée avant ce changement garde l'ancienne
// contrainte pour toujours (souvent NO ACTION, ou NOT NULL au lieu de nullable). Conséquences
// concrètes : la suppression du parent échoue silencieusement (CASCADE manquant sur des enfants
// obligatoires), ou la ligne enfant reste accrochée à un parent supprimé sans jamais devenir
// "fantôme" (SET NULL manquant sur BILAN/PROJECTION) — elle disparaît alors de l'écran sans
// message d'erreur. On reconstruit la table en préservant les lignes existantes.
//
// Ordre : ACTION avant VERSEMENT_DIV, qui la référence — sinon indifférent. On crée la nouvelle
// table à côté puis on DROP l'ancienne avant de la renommer à sa place (jamais l'inverse) :
// renommer une table référencée redirige automatiquement les FK des autres tables vers elle, ce
// qui casserait VERSEMENT_DIV pendant la reconstruction d'ACTION si on renommait l'ancienne
// table au lieu de la supprimer.
const FK_TABLES: FkTable[] = [
    {
        table: 'ACTION',
        fkColumn: 'id_profil_inv',
        expectedOnDelete: 'CASCADE',
        requireNullable: false,
        columnsSql: `
	id_action		INTEGER PRIMARY KEY,
	label			VARCHAR(24) NOT NULL,
	ordre			INTEGER,
	prix			REAL,
	nb_part_acquis	REAL DEFAULT 0,
	div				REAL,
	prix_inv		REAL DEFAULT 0,
	nb_inv			INTEGER DEFAULT 0,
	id_profil_inv	INTEGER NOT NULL REFERENCES PROFIL_INVEST(id_profil_inv) ON DELETE CASCADE
`,
    },
    {
        table: 'DEPENSE',
        fkColumn: 'id_depense_group',
        expectedOnDelete: 'CASCADE',
        requireNullable: false,
        columnsSql: `
	id_depense			INTEGER PRIMARY KEY,
	label				VARCHAR(24) NOT NULL,
	valeur				REAL DEFAULT 0,
	ordre				INTEGER,
	id_depense_group	INTEGER NOT NULL REFERENCES DEPENSE_GROUP(id_depense_group) ON DELETE CASCADE
`,
    },
    {
        table: 'VERSEMENT_DIV',
        fkColumn: 'id_action',
        expectedOnDelete: 'CASCADE',
        requireNullable: false,
        columnsSql: `
	id_action	INTEGER NOT NULL REFERENCES ACTION(id_action) ON DELETE CASCADE,
	mois		INTEGER CHECK (mois BETWEEN 1 AND 12),
	PRIMARY KEY (id_action, mois)
`,
    },
    {
        table: 'BILAN',
        fkColumn: 'id_profil_inv',
        expectedOnDelete: 'SET NULL',
        requireNullable: true,
        columnsSql: `
	id_bilan		INTEGER PRIMARY KEY,
	valeur			REAL,
	gain			REAL,
	date			DATE,
	label			VARCHAR(24),
	couleur			CHAR(6),
	id_profil_inv	INTEGER REFERENCES PROFIL_INVEST(id_profil_inv) ON DELETE SET NULL,
	UNIQUE (id_profil_inv, date)
`,
    },
    {
        table: 'PROJECTION',
        fkColumn: 'id_profil_inv',
        expectedOnDelete: 'SET NULL',
        requireNullable: true,
        columnsSql: `
	id_projection	INTEGER PRIMARY KEY,
	valeur			REAL,
	gain			REAL,
	annee			INTEGER,
	label			VARCHAR(24),
	couleur			CHAR(6),
	id_profil_inv	INTEGER REFERENCES PROFIL_INVEST(id_profil_inv) ON DELETE SET NULL,
	UNIQUE (id_profil_inv, annee)
`,
    },
];

async function needsRebuild(db: SQLite.SQLiteDatabase, { table, fkColumn, expectedOnDelete, requireNullable }: FkTable): Promise<boolean> {
    const fks = await db.getAllAsync<{ from: string; on_delete: string }>(`PRAGMA foreign_key_list(${table})`);
    const fk = fks.find((f) => f.from === fkColumn);
    if (!fk) return false; // table absente ou FK différente : rien à comparer ici
    if (fk.on_delete.toUpperCase() !== expectedOnDelete) return true;

    if (requireNullable) {
        const cols = await db.getAllAsync<{ name: string; notnull: number }>(`PRAGMA table_info(${table})`);
        const col = cols.find((c) => c.name === fkColumn);
        if (col?.notnull) return true;
    }
    return false;
}

async function rebuildTable(db: SQLite.SQLiteDatabase, { table, columnsSql }: FkTable): Promise<void> {
    const rows = await db.getAllAsync<Record<string, unknown>>(`SELECT * FROM ${table}`);
    const tmpTable = `${table}_rebuild_fix`;
    await db.withExclusiveTransactionAsync(async (txn) => {
        await txn.execAsync(`CREATE TABLE ${tmpTable} (${columnsSql})`);
        for (const row of rows) {
            const columns = Object.keys(row);
            if (columns.length === 0) continue;
            await txn.runAsync(
                `INSERT INTO ${tmpTable} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
                columns.map((c) => row[c] as string | number | null)
            );
        }
        await txn.execAsync(`DROP TABLE ${table}`);
        await txn.execAsync(`ALTER TABLE ${tmpTable} RENAME TO ${table}`);
    });
}

export async function initDb()
{
    const db = await SQLite.openDatabaseAsync('mycount.db');
    await db.execAsync('PRAGMA foreign_keys = ON;');

    await db.execAsync(SCHEMA);

    for (const fkTable of FK_TABLES) {
        if (await needsRebuild(db, fkTable)) {
            await rebuildTable(db, fkTable);
        }
    }

    return db;
}
