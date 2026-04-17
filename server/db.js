import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, 'data', 'data.json');

export const readDb = () => JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
export const writeDb = (data) => fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
export const nextId = (db, key, prefix) => {
  db.counters[key] += 1;
  return `${prefix}${db.counters[key]}`;
};
export const publicFileUrl = (req, filename) => `${req.protocol}://${req.get('host')}/uploads/${filename}`;
