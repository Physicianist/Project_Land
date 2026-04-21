import fs from 'fs';
import path from 'path';

function parseEnvFile(contents = '') {
  const result = {};
  for (const rawLine of String(contents).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separatorIndex = line.indexOf('=');
    if (separatorIndex === -1) continue;
    const key = line.slice(0, separatorIndex).trim();
    if (!key) continue;
    let value = line.slice(separatorIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

export function loadServerEnv({ cwd = process.cwd(), nodeEnv = process.env.NODE_ENV } = {}) {
  const originalEnv = new Set(Object.keys(process.env));
  const candidates = [
    '.env',
    '.env.local',
    nodeEnv ? `.env.${nodeEnv}` : null,
    nodeEnv ? `.env.${nodeEnv}.local` : null,
  ].filter(Boolean);

  for (const relativePath of candidates) {
    const absolutePath = path.join(cwd, relativePath);
    if (!fs.existsSync(absolutePath)) continue;
    const parsed = parseEnvFile(fs.readFileSync(absolutePath, 'utf-8'));
    Object.entries(parsed).forEach(([key, value]) => {
      if (originalEnv.has(key)) return;
      process.env[key] = value;
    });
  }
}

