/**
 * Downloads PT Sans (Cyrillic) TTF from Google Fonts for PDF generation.
 * Run once: node server/download-fonts.js
 */
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fontsDir = path.join(__dirname, 'assets', 'fonts');
if (!fs.existsSync(fontsDir)) fs.mkdirSync(fontsDir, { recursive: true });

const FONTS = [
  {
    url: 'https://fonts.gstatic.com/s/ptsans/v17/jizaRExUiTo99u79D0KEwA.ttf',
    dest: 'PTSans-Regular.ttf',
  },
  {
    url: 'https://fonts.gstatic.com/s/ptsans/v17/jizfRExUiTo99u79B_mh0O6tKA.ttf',
    dest: 'PTSans-Bold.ttf',
  },
];

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.destroy();
        fs.unlinkSync(dest);
        return download(res.headers.location, dest).then(resolve).catch(reject);
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', (err) => { fs.unlinkSync(dest); reject(err); });
  });
}

for (const { url, dest } of FONTS) {
  const destPath = path.join(fontsDir, dest);
  if (fs.existsSync(destPath)) { console.log(`${dest} — already exists, skipping.`); continue; }
  console.log(`Downloading ${dest}...`);
  await download(url, destPath);
  console.log(`${dest} — done (${Math.round(fs.statSync(destPath).size / 1024)} KB)`);
}
console.log('Fonts ready.');
