// test/parse.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import DOM from '@mojojs/dom';
import { parseBrandOptions, parseModelOptions, parseCreateResult, parsePhotoList, parsePhotoIds } from '../src/parse.js';

const tree = (file: string) => new DOM(readFileSync(`fixtures/${file}`, 'utf8'));

describe('parse', () => {
  it('parses brand options, skipping the empty placeholder', () => {
    const brands = parseBrandOptions(tree('brand-options.html'));
    expect(brands).toContainEqual({ id: '42', name: 'Remington' });
    expect(brands.some((b) => b.id === '' || b.name === '')).toBe(false);
  });

  it('parses model options (bare list, composite ids)', () => {
    const models = parseModelOptions(tree('model-list-42.html'));
    expect(models).toContainEqual({ id: 'Remington.Portable+2.42.bmys', name: 'Portable 2' });
    expect(models.some((m) => m.name === 'Select Model')).toBe(false);
  });

  it('extracts the new gallery id from the result URL', () => {
    const url = 'https://typewriterdatabase.com/1928-remington-portable-2.25059.typewriter';
    expect(parseCreateResult(new DOM('<html></html>'), url)).toEqual({ id: '25059', url });
  });

  it('falls back to a .typewriter anchor href', () => {
    const dom = new DOM("<a href='https://x/foo.25748.typewriter'>see</a>");
    expect(parseCreateResult(dom, 'https://x/edit')?.id).toBe('25748');
  });
});

describe('parsePhotoList', () => {
  it('returns photoId + url for each existing photo, ignoring the add form', () => {
    const photos = parsePhotoList(tree('photos-list.html'));
    expect(photos).toEqual([
      { photoId: '192579', url: 'https://typewriterdatabase.com/img/g25286_192579_1744222359.jpg' },
      { photoId: '192580', url: 'https://typewriterdatabase.com/img/g25286_192580_1744222360.jpg' },
    ]);
  });
});

describe('parsePhotoIds', () => {
  it('returns the gp_id of each photo edit form (ignoring the add form)', () => {
    expect(parsePhotoIds(tree('photos-list.html'))).toEqual(['192579', '192580']);
  });
});
