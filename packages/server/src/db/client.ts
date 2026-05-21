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
  const baseDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(baseDir, 'migrations', '001-init.sql'),
    path.resolve(baseDir, '../src/db/migrations/001-init.sql'),
    path.resolve(process.cwd(), 'packages/server/src/db/migrations/001-init.sql'),
    path.resolve(process.cwd(), '../../packages/server/src/db/migrations/001-init.sql'),
    path.resolve(process.cwd(), '../packages/server/src/db/migrations/001-init.sql'),
  ];
  const sqlPath = candidates.find((p) => fs.existsSync(p));
  if (!sqlPath) throw new Error(`migration file not found: ${candidates.join(', ')}`);
  db.exec(fs.readFileSync(sqlPath, 'utf8'));
}
