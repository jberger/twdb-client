// src/parse.ts -- all TWDB HTML selectors live here (one place to fix on upstream drift).
import type { Brand, Model, MachineRef, PhotoRef, WebLink } from './types.js';

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

// Models: GET mfr.<catId>.model_list returns a BARE <option> list (no <select>). The value is an
// opaque composite (e.g. "Remington.Portable+2.42.bmys"), used verbatim as the `models` field.
export const parseModelOptions = (dom: DomLike): Model[] => options(dom, 'option');

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
    // text() leaves the layout-padding &nbsp; entities literal; normalize them to spaces.
    const name = link.text().replace(/&nbsp;/gi, ' ').trim();
    links.push({ id, name, url: link.attr.href ?? '' });
  }
  return links;
}

// New gallery id/url from the create response: prefer the resolved/redirected URL, else any
// <id>.typewriter anchor. (Confirm against a real create — see the Slice 2 plan, Task 8.)
export function parseCreateResult(dom: DomLike, finalUrl = ''): MachineRef | null {
  const fromUrl = finalUrl.match(/(\d+)\.typewriter/);
  if (fromUrl) return { id: fromUrl[1], url: finalUrl };
  for (const a of dom.find('a')) {
    const href = a.attr.href ?? '';
    const m = href.match(/(\d+)\.typewriter/);
    if (m) return { id: m[1], url: href };
  }
  return null;
}
