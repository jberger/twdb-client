// test/resize.test.ts
import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { resizeForGallery, resizeForTypeSample } from '../src/resize.js';

async function img(w: number, h: number): Promise<Buffer> {
  return sharp({ create: { width: w, height: h, channels: 3, background: '#888' } })
    .jpeg()
    .toBuffer();
}
const dims = async (b: Buffer): Promise<[number, number]> => {
  const m = await sharp(b).metadata();
  return [m.width!, m.height!];
};

describe('resize', () => {
  it('caps gallery images at 630px on the longest side', async () => {
    const r = await resizeForGallery(await img(2000, 1500), 'photo.jpg');
    const [w, h] = await dims(r.content);
    expect(Math.max(w, h)).toBeLessThanOrEqual(630);
    expect(r.contentType).toBe('image/jpeg');
    expect(r.filename).toBe('photo.jpg');
  });

  it('does not upscale a small image', async () => {
    const [w] = await dims((await resizeForGallery(await img(400, 300), 'x.jpg')).content);
    expect(w).toBe(400);
  });

  it('bakes in rotation AND strips EXIF (uploads must be EXIF-independent)', async () => {
    // 400x200 landscape tagged orientation 6 (=90°) → must come out portrait, pixels baked, tag gone
    const tagged = await sharp(await img(400, 200)).withMetadata({ orientation: 6 }).jpeg().toBuffer();
    const out = (await resizeForGallery(tagged, 'r.jpg')).content;
    const meta = await sharp(out).metadata();
    expect(meta.height!).toBeGreaterThan(meta.width!); // .rotate() ran (else stays landscape)
    expect([undefined, 1]).toContain(meta.orientation); // EXIF stripped → no tag to rely on
  });

  it('fits type samples within 550x300', async () => {
    const [w, h] = await dims((await resizeForTypeSample(await img(2000, 2000), 'ts.jpg')).content);
    expect(w).toBeLessThanOrEqual(550);
    expect(h).toBeLessThanOrEqual(300);
  });
});
