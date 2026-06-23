// src/parse.ts -- all TWDB HTML selectors live here (one place to fix on upstream drift).
import type { Brand, Model, MachineRef, PhotoRef, WebLink, RemoteMachine } from './types.js';

// Structural shape of a @mojojs/dom node — what res.html() returns, and what tests build.
interface DomNode {
  attr: Record<string, string>;
  text(): string;
  at(selector: string): DomNode | null;
}
export interface DomLike {
  find(selector: string): DomNode[];
}

function options(dom: DomLike, selector: string): { id: string; name: string }[] {
  const out: { id: string; name: string }[] = [];
  for (const opt of dom.find(selector)) {
    const id = (opt.attr.value ?? '').trim();
    const name = opt.text().trim();
    if (id && name) out.push({ id, name }); // skip the empty "Select…" placeholder
  }
  return out;
}

// Brands: the cat_id <select> on the create form (typewriter_edit.php). Value = numeric cat_id.
export const parseBrandOptions = (dom: DomLike): Brand[] =>
  options(dom, 'select[name="cat_id"] option');

// Models (public model browser): GET mfr.<catId>.model_list returns a BARE <option> list whose
// value is an opaque composite (e.g. "Remington.Portable+2.42.bmys"). Used for navigation/lookup —
// NOT a valid value for the create form's `models` field (see parseCreateModelNames).
export const parseModelOptions = (dom: DomLike): Model[] => options(dom, 'option');

// Models (create form): GET mfr.<catId>.models_list feeds the create form's `models` <select>. Its
// <option>s have NO value attribute, so the submitted value is the option TEXT (the bare model name);
// the leading value="" option ("Entered Next") is the new-model placeholder. Returns the submittable
// names. These are what `models` must be set to — sending a model_list composite id is rejected.
export function parseCreateModelNames(dom: DomLike): string[] {
  const names: string[] = [];
  for (const opt of dom.find('option')) {
    if (opt.attr.value !== undefined) continue; // skip the value="" "Entered Next" placeholder
    const name = opt.text().trim();
    if (name) names.push(name);
  }
  return names;
}

// Photos: each stored image URL embeds the gp_id (/img/g<gid>_<gp_id>_<ts>.ext). We read the
// gallery's photos straight off those <img> srcs — self-contained identity, no per-form nesting
// needed (and the empty add form has no such <img>, so it's naturally excluded).
export function parsePhotoList(dom: DomLike): PhotoRef[] {
  const photos: PhotoRef[] = [];
  for (const img of dom.find('img')) {
    const src = (img.attr.src ?? '').trim();
    const m = src.match(/\/img\/g\d+_(\d+)_\d+\.\w+/i);
    if (m) photos.push({ photoId: m[1], url: src });
  }
  return photos;
}

// New-photo detection: the create response lists every photo as an edit form with a hidden
// gp_id input. We read those ids directly — addPhoto can't use parsePhotoList there because a
// freshly-uploaded photo has a transient image URL of a different shape.
export function parsePhotoIds(dom: DomLike): string[] {
  const ids: string[] = [];
  for (const input of dom.find('input[name="gp_id"]')) {
    const v = (input.attr.value ?? '').trim();
    if (v) ids.push(v);
  }
  return ids;
}

// Links: each saved link is a list row (<li>) holding the link anchor (url + name) and a separate
// delete control `<a href="javascript:confirmLinkDelete(<id>)">`. We walk each <li> with the DOM
// and pull both anchors; rows without both (the tab-nav <li>s) are skipped. The only regex is
// pulling the numeric id out of the confirmLinkDelete(...) JS call — not HTML parsing.
export function parseLinks(dom: DomLike): WebLink[] {
  const links: WebLink[] = [];
  for (const li of dom.find('li')) {
    const link = li.at('a[target="_blank"]');
    const del = li.at('a[href^="javascript:confirmLinkDelete"]');
    if (!link || !del) continue;
    const id = (del.attr.href ?? '').match(/confirmLinkDelete\((\d+)\)/)?.[1];
    if (!id) continue;
    // text() may leave the layout-padding nbsp as the literal &nbsp; entity OR as U+00A0;
    // normalize both to spaces.
    const name = link.text().replace(/&nbsp;|\u00a0/gi, " ").trim();
    links.push({ id, name, url: link.attr.href ?? '' });
  }
  return links;
}

// New gallery id/url from the create response: prefer the resolved/redirected URL, else any
// <id>.typewriter anchor. The `.typewriter` must end the path segment — `(?![\w-])` rejects the
// site-chrome "Popular Models" link `popular.0.typewriter-models`, which otherwise false-matches as
// gallery id "0" and silently turns a failed create into a fake success.
const GALLERY_URL_RE = /(\d+)\.typewriter(?![\w-])/;
export function parseCreateResult(dom: DomLike, finalUrl = ''): MachineRef | null {
  const fromUrl = finalUrl.match(GALLERY_URL_RE);
  if (fromUrl) return { id: fromUrl[1], url: finalUrl };
  for (const a of dom.find('a')) {
    const href = a.attr.href ?? '';
    const m = href.match(GALLERY_URL_RE);
    if (m) return { id: m[1], url: href };
  }
  return null;
}

// A gallery page's canonical public URL (the descriptive `<slug>.<id>.typewriter` form), read from
// its <link rel="canonical"> (or og:url). The create response only links the bare `see.<id>` form, so
// we fetch the gallery page and read this to store the nice URL.
export function parseCanonicalUrl(dom: DomLike): string | null {
  const canonical = dom.find('link[rel="canonical"]')[0]?.attr.href;
  if (canonical) return canonical;
  return dom.find('meta[property="og:url"]')[0]?.attr.content ?? null;
}

// Hunter export: GET typewriter_list_ajax.php?hunter_search=<id>&output=csv → a TAB-delimited table
// (despite "csv"). Map by header name so column-order drift doesn't break us.
export function parseHunterCsv(csv: string): RemoteMachine[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length < 2) return [];
  const cols = lines[0].split('\t');
  const at = (row: string[], name: string) => row[cols.indexOf(name)] ?? '';
  const out: RemoteMachine[] = [];
  for (const line of lines.slice(1)) {
    const r = line.split('\t');
    out.push({
      id: at(r, 'id'),
      url: at(r, 'twdb_url'),
      manufacturer: at(r, 'manufacturer'),
      model: at(r, 'model'),
      serial: at(r, 'serial'),
      year: at(r, 'year'),
      status: at(r, 'status'),
      photoCount: Number(at(r, 'images')) || 0,
    });
  }
  return out;
}
