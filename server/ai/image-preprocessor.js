import sharp from 'sharp';
import { logger } from '../logger.js';

const MAX_DIMENSION = 1400;
const JPEG_QUALITY = 82;

/**
 * Resizes and converts images to greyscale JPEG before sending to OpenAI.
 * PDFs are passed through unchanged.
 * Returns a Buffer ready for toDataUrl().
 */
export async function preprocessImageForAI(buffer, mimeType) {
  if (mimeType === 'application/pdf') return buffer;

  const beforeKb = Math.round(buffer.length / 1024);
  try {
    const metadata = await sharp(buffer).metadata();
    const needsResize = (metadata.width || 0) > MAX_DIMENSION || (metadata.height || 0) > MAX_DIMENSION;
    const processed = await sharp(buffer)
      .resize(MAX_DIMENSION, MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true })
      .grayscale()
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer();
    const afterKb = Math.round(processed.length / 1024);
    if (needsResize || afterKb < beforeKb) {
      logger.info({ beforeKb, afterKb }, '[image-preprocess] compressed');
    }
    return processed;
  } catch (err) {
    logger.warn({ err: err.message }, '[image-preprocess] failed, using original');
    return buffer;
  }
}
