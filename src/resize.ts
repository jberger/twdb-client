// src/resize.ts
import sharp from 'sharp';
import { basename } from 'node:path';
import type { ImageSource, ResizedImage } from './types.js';

const nameFor = (src: ImageSource, fallback: string): string =>
  typeof src === 'string' ? basename(src) : fallback;

async function resizeTo(
  src: ImageSource,
  filename: string,
  w: number,
  h: number,
): Promise<ResizedImage> {
  // .rotate() bakes EXIF orientation into the pixels (TWDB strips metadata, so uploads must be
  // EXIF-independent — see spec §8). toBuffer() drops metadata by default; do NOT add withMetadata.
  const content = await sharp(src)
    .rotate()
    .resize({ width: w, height: h, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer();
  return {
    content,
    filename: filename.replace(/\.[^.]+$/, '') + '.jpg',
    contentType: 'image/jpeg',
  };
}

export function resizeForGallery(src: ImageSource, filename = 'photo.jpg'): Promise<ResizedImage> {
  return resizeTo(src, nameFor(src, filename), 630, 630);
}

export function resizeForTypeSample(
  src: ImageSource,
  filename = 'typesample.jpg',
): Promise<ResizedImage> {
  return resizeTo(src, nameFor(src, filename), 550, 300);
}
