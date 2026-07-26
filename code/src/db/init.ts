import * as SQLite from 'expo-sqlite';
import { SCHEMA } from './schema';

export async function initDb()
{
    const db = await SQLite.openDatabaseAsync('mycount.db');
    await db.execAsync('PRAGMA foreign_keys = ON;');
    await db.execAsync(SCHEMA);
    return db;
}