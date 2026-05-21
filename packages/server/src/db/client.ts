import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

export type Db = Database.Database;

export function openDb(filePath: string): Db {
  if (filePath !== ':memory:') fs.mkdirSync(path.dirname(filePath), { recursive: true });
  return new Database(filePath);
}

export function runMigrations(db: Db): void {
  const sqlPath = fileURLToPath(new URL('./migrations/001-init.sql', import.meta.url));
  db.exec(fs.readFileSync(sqlPath, 'utf8'));
}
