/**
 * One-time migration: JSON file-based DB → SQLite.
 * Run: node server/migrate-json-to-sqlite.js
 *
 * Prerequisites: npm install better-sqlite3
 * After running, set STORAGE_DB=sqlite in .env to switch the runtime.
 * The original data.json is renamed to data.json.bak (kept as rollback).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const JSON_PATH = path.join(__dirname, 'data', 'data.json');
const SQLITE_PATH = path.join(__dirname, 'data', 'db.sqlite');
const BAK_PATH = `${JSON_PATH}.bak`;

let Database;
try {
  ({ default: Database } = await import('better-sqlite3'));
} catch {
  console.error('better-sqlite3 is not installed. Run: npm install better-sqlite3');
  process.exit(1);
}

if (!fs.existsSync(JSON_PATH)) {
  console.error('data.json not found:', JSON_PATH);
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(JSON_PATH, 'utf-8'));
const db = new Database(SQLITE_PATH);

db.exec(`CREATE TABLE IF NOT EXISTS store (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
)`);

const insert = db.prepare('INSERT OR REPLACE INTO store (key, value) VALUES (?, ?)');
const migrate = db.transaction(() => {
  for (const [key, value] of Object.entries(data)) {
    insert.run(key, JSON.stringify(value));
  }
});

migrate();
db.close();

// Rename original JSON as backup
fs.renameSync(JSON_PATH, BAK_PATH);
console.log(`Migration complete. ${Object.keys(data).length} keys migrated.`);
console.log(`Backup saved: ${BAK_PATH}`);
console.log(`SQLite DB: ${SQLITE_PATH}`);
