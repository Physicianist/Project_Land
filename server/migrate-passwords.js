/**
 * One-time password migration script.
 * Reads data.json, hashes all plaintext passwords with bcryptjs, saves back.
 * Run once: node server/migrate-passwords.js
 * Safe to run multiple times — skips already-hashed entries ($2b$ prefix).
 */
import bcrypt from 'bcryptjs';
import { readDb, writeDb } from './db.js';

const SALT_ROUNDS = 12;
const BCRYPT_PREFIX = '$2b$';

async function migrate() {
  const db = readDb();
  let migrated = 0;
  let skipped = 0;

  for (const account of (db.accounts || [])) {
    if (!account.password) { skipped++; continue; }
    if (String(account.password).startsWith(BCRYPT_PREFIX)) { skipped++; continue; }
    account.password = await bcrypt.hash(account.password, SALT_ROUNDS);
    migrated++;
  }

  writeDb(db);
  console.log(`Migration complete: ${migrated} hashed, ${skipped} skipped.`);
}

migrate().catch(err => { console.error(err); process.exit(1); });
