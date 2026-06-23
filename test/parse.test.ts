// test/parse.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import DOM from '@mojojs/dom';
import { parseBrandOptions, parseModelOptions, parseCreateModelNames, parseCreateResult, parseCanonicalUrl, parsePhotoList, parsePhotoIds, parseLinks, parseHunterCsv } from '../src/parse.js';

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

  it('does NOT match the "Popular Models" nav link (.typewriter-models) — failed create → null', () => {
    // The create-failure page only has site chrome like popular.0.typewriter-models; treating that
    // as gallery id "0" was the bug that fabricated a fake success. It must yield null now.
    const dom = new DOM('<a href="https://typewriterdatabase.com/popular.0.typewriter-models">Popular Models</a>');
    expect(parseCreateResult(dom)).toBeNull();
    expect(parseCreateResult(dom, 'https://typewriterdatabase.com/popular.0.typewriter-models')).toBeNull();
  });

  it('parses create-form model names (value-less options), skipping the "Entered Next" placeholder', () => {
    const names = parseCreateModelNames(tree('models-list-42.html'));
    expect(names).toContain('Portable 2');
    expect(names).not.toContain('Entered Next');
    expect(names.some((n) => n === '')).toBe(false);
  });

  it('reads the canonical gallery URL from <link rel="canonical">, falling back to og:url', () => {
    const canon = new DOM('<link rel="canonical" href="https://typewriterdatabase.com/1932-continental-klein.28339.typewriter">');
    expect(parseCanonicalUrl(canon)).toBe('https://typewriterdatabase.com/1932-continental-klein.28339.typewriter');
    const og = new DOM('<meta property="og:url" content="https://typewriterdatabase.com/x.5.typewriter">');
    expect(parseCanonicalUrl(og)).toBe('https://typewriterdatabase.com/x.5.typewriter');
    expect(parseCanonicalUrl(new DOM('<html></html>'))).toBeNull();
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

describe('parseLinks', () => {
  it('parses saved links (id from confirmLinkDelete, name+url from the anchor), ignoring tab nav', () => {
    const links = parseLinks(tree('links-list.html'));
    expect(links).toEqual([
      { id: '7001', name: 'My blog post', url: 'https://example.com/blog/molle' },
      { id: '7002', name: 'YouTube', url: 'https://youtube.com/watch?v=abc' },
    ]);
  });
});

describe('parseHunterCsv', () => {
  it('parses the TAB-delimited export by header (order-independent)', () => {
    const machines = parseHunterCsv(readFileSync('fixtures/02-list-7773.csv', 'utf8'));
    expect(machines.length).toBeGreaterThan(0);
    const remington = machines.find((m) => m.id === '25059')!;
    expect(remington).toMatchObject({
      id: '25059',
      manufacturer: 'Remington',
      model: 'Portable 2',
      serial: 'NM89031',
      year: '1928',
      status: 'Sightings',
      photoCount: 7,
      url: 'https://typewriterdatabase.com/1928-remington-portable-2.25059.typewriter',
    });
  });
});
