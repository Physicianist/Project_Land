/**
 * Local filesystem storage backend.
 * Swap STORAGE_BACKEND=s3 in future to use an S3 implementation instead.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.join(__dirname, '..', 'uploads');

if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

export async function saveFile(buffer, filename) {
  await fs.promises.writeFile(path.join(uploadsDir, filename), buffer);
}

export async function getFile(filename) {
  return fs.promises.readFile(path.join(uploadsDir, filename));
}

export async function deleteFile(filename) {
  const p = path.join(uploadsDir, filename);
  if (fs.existsSync(p)) await fs.promises.unlink(p);
}

export function getPublicPath(filename) {
  return `/api/uploads/${filename}`;
}

export function getAbsolutePath(filename) {
  return path.join(uploadsDir, filename);
}
