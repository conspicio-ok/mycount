import { createContext, useContext, ReactNode } from 'react';
import * as SQLite from 'expo-sqlite';

const DbContext = createContext<SQLite.SQLiteDatabase | null>(null);

export function DbProvider({ db, children }: { db: SQLite.SQLiteDatabase; children: ReactNode }) {
	return <DbContext.Provider value={db}>{children}</DbContext.Provider>;
}

export function useDb(): SQLite.SQLiteDatabase {
	const db = useContext(DbContext);
	if (!db) throw new Error('useDb() appelé hors DbProvider');
	return db;
}
