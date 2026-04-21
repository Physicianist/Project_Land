import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export const allowedUploadMimeTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
]);

export function sanitizeFilename(name = '') {
  const extension = path.extname(name).toLowerCase();
  const base = path.basename(name, extension)
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
  return `${base || 'file'}${extension}`;
}

export function safeStoredFilename(originalName = '') {
  const sanitized = sanitizeFilename(originalName);
  return `${Date.now()}-${crypto.randomBytes(6).toString('hex')}-${sanitized}`;
}

export function fileKindFromMime(mimeType = '', fileName = '') {
  if (String(mimeType).startsWith('image/')) return 'photo';
  if (mimeType === 'application/pdf' || String(fileName).toLowerCase().endsWith('.pdf')) return 'pdf';
  return 'file';
}

export function createSha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function createIdempotencyKey(parts = []) {
  return createSha256(parts.filter(Boolean).join('|'));
}

export async function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

export function guessPdfPageCountFromBuffer(buffer) {
  const text = buffer.toString('latin1');
  const matches = text.match(/\/Type\s*\/Page\b/g);
  return matches?.length || 1;
}

export async function readAssetBuffer(uploadsDir, asset = {}) {
  if (asset.storageName) {
    return fs.promises.readFile(path.join(uploadsDir, asset.storageName));
  }
  if (asset.url && asset.url.startsWith('file://')) {
    return fs.promises.readFile(new URL(asset.url));
  }
  throw new Error('Asset buffer is not available for processing.');
}

export function toDataUrl(buffer, mimeType) {
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

export function detectFormulaHeavyText(text = '') {
  const formulaTokens = (String(text).match(/[=+\-*/^∫√Σπ_]/g) || []).length;
  return formulaTokens >= 8;
}

