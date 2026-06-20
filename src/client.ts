// src/client.ts
import UserAgent, { type NodeResponse } from '@mojojs/user-agent';
import { CookieJar, type SerializedCookieJar } from 'tough-cookie';
import { AuthError, HttpError, TwdbValidationError } from './errors.js';
import { parseBrandOptions, parseModelOptions, parseCreateResult, parsePhotoList, parsePhotoIds, parseLinks, parseHunterCsv } from './parse.js';
import { resizeForGallery, resizeForTypeSample } from './resize.js';
import type { Brand, Model, MachineInput, MachineRef, ResizedImage, PhotoRef, AddPhotoOptions, UpdatePhotoOptions, ImageSource, WebLink, RemoteMachine } from './types.js';

type MojoDOM = Awaited<ReturnType<NodeResponse['html']>>;

export interface TwdbClientOptions {
  baseUrl: string;
  userAgent?: string;
  /** Minimum ms between requests (politeness). Default 1000. */
  minRequestIntervalMs?: number;
  /** passed to @mojojs/user-agent; null disables keep-alive -- use in tests for speed */
  keepAlive?: number | null;
}

export interface SerializedSession {
  cookies: SerializedCookieJar;
}

/** Internal shape of httpTransport at runtime (UndiciTransport). */
interface UndiciTransportLike {
  cookieJar: CookieJar | null;
}

const DEFAULT_UA = 'twdb-client/0.1 (+github:jberger/twdb-client)';

export class TwdbClient {
  #ua: UserAgent;
  #minInterval: number;
  #lastRequestAt = 0;
  #queue: Promise<unknown> = Promise.resolve();
  #brands?: Brand[];

  constructor(opts: TwdbClientOptions) {
    this.#ua = new UserAgent({
      baseURL: opts.baseUrl,
      name: opts.userAgent ?? DEFAULT_UA,
      maxRedirects: 5,
      keepAlive: opts.keepAlive,
    });
    this.#minInterval = opts.minRequestIntervalMs ?? 1000;
  }

  /** Serialize requests and enforce the minimum interval between them. */
  #send<T>(fn: () => Promise<T>): Promise<T> {
    const run = async (): Promise<T> => {
      const wait = this.#lastRequestAt + this.#minInterval - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      this.#lastRequestAt = Date.now();
      return fn();
    };
    const result = this.#queue.then(run, run);
    this.#queue = result.then(() => undefined, () => undefined);
    return result;
  }

  /** POST multipart/form-data: text fields + file parts (image bytes wrapped as Blobs, since the
   *  user-agent's formData `content` is string|Blob, not Buffer). Routed through #send for pacing. */
  #postMultipart(
    path: string,
    data: { fields: Record<string, string>; files?: Record<string, ResizedImage> },
  ) {
    const formData: Record<string, string | { content: Blob; filename: string }> = { ...data.fields };
    for (const [key, f] of Object.entries(data.files ?? {})) {
      // Fresh Uint8Array so the Blob part is ArrayBuffer-backed (Buffer's backing is ArrayBufferLike).
      formData[key] = {
        content: new Blob([new Uint8Array(f.content)], { type: f.contentType }),
        filename: f.filename,
      };
    }
    return this.#send(() => this.#ua.post(path, { formData }));
  }

  /** Access the underlying undici transport's cookie jar. */
  #transport(): UndiciTransportLike {
    return this.#ua.httpTransport as unknown as UndiciTransportLike;
  }

  /**
   * Authenticate. Posts the TWDB login form and follows the redirect. Success is
   * detected by the absence of the login form in the resulting page (a re-rendered
   * login form == failure). NOTE: refine this marker against the real login.php
   * response during the slice-1 recon pass.
   */
  async login(username: string, password: string): Promise<void> {
    const res = await this.#send(() =>
      this.#ua.post('/login.php', { form: { username, passwd: password, commit: 'Sign In' } }),
    );
    const dom = await res.html();
    if (dom.at('input[name="passwd"]')) {
      throw new AuthError('TWDB login failed (check username/password)');
    }
  }

  /** GET `path` and return its parsed HTML DOM (@mojojs/dom). Throws HttpError on non-2xx. */
  async fetchHtml(path: string): Promise<MojoDOM> {
    const res = await this.#send(() => this.#ua.get(path));
    if (!res.isSuccess) {
      throw new HttpError(`GET ${path} -> ${res.statusCode}`, res.statusCode);
    }
    return res.html();
  }

  /** GET `path` and return the raw response body text. Throws HttpError on non-2xx. */
  async fetchText(path: string): Promise<string> {
    const res = await this.#send(() => this.#ua.get(path));
    if (!res.isSuccess) {
      throw new HttpError(`GET ${path} -> ${res.statusCode}`, res.statusCode);
    }
    return res.text();
  }

  /** All TWDB brands (scraped from the create form's cat_id <select>), cached per client. */
  async listBrands(): Promise<Brand[]> {
    if (!this.#brands) this.#brands = parseBrandOptions(await this.fetchHtml('/typewriter_edit.php?id=0'));
    return this.#brands;
  }

  /** Resolve a brand name to its TWDB record (case-insensitive), or null. */
  async resolveBrand(name: string): Promise<Brand | null> {
    const n = name.trim().toLowerCase();
    return (await this.listBrands()).find((b) => b.name.toLowerCase() === n) ?? null;
  }

  /** Models for a brand (from mfr.<catId>.model_list). Option value is an opaque composite id. */
  async listModels(brandId: string): Promise<Model[]> {
    return parseModelOptions(await this.fetchHtml(`/mfr.${brandId}.model_list`));
  }

  /** Create a new machine gallery (id=0). Resolves brand/model, resizes images, submits the form. */
  createMachine(input: MachineInput): Promise<MachineRef> {
    return this.#submitMachine('0', input);
  }

  /** Update an existing machine gallery (id=N). Caller passes a full MachineInput. */
  updateMachine(id: string, input: MachineInput): Promise<MachineRef> {
    return this.#submitMachine(id, input);
  }

  async #submitMachine(id: string, input: MachineInput): Promise<MachineRef> {
    const brand = typeof input.brand === 'string' ? await this.resolveBrand(input.brand) : input.brand;
    if (!brand) throw new TwdbValidationError(`Unknown brand: ${String(input.brand)}`);

    const fields: Record<string, string> = {
      site_id: '1',
      gallery_active: '1',
      id,
      collection: input.collection,
      cat_id: brand.id,
      gallery_name: input.year,
      serial_no: input.serialNo,
      gallery_desc: input.description,
      photo_wm: input.watermark === false ? '0' : '1',
      submit: '1',
    };

    // Existing model → `models` (its composite id); a new name → `model`.
    if (typeof input.model === 'string') {
      const name = input.model;
      const existing = (await this.listModels(brand.id)).find(
        (m) => m.name.toLowerCase() === name.toLowerCase(),
      );
      if (existing) fields.models = existing.id;
      else fields.model = name;
    } else {
      fields.models = input.model.id;
    }

    const files: Record<string, ResizedImage> = {};
    if (input.coverImage) files.photo = await resizeForGallery(input.coverImage);
    if (input.typeSampleImage) files.typesample = await resizeForTypeSample(input.typeSampleImage);

    const res = await this.#postMultipart('/typewriter_edit.php', { fields, files });
    const ref = parseCreateResult(await res.html());
    if (!ref) throw new TwdbValidationError('TWDB did not return a gallery id (the form was likely rejected)');
    return ref;
  }

  /** List a gallery's external links. */
  async listLinks(galleryId: string): Promise<WebLink[]> {
    return parseLinks(await this.fetchHtml(`/typewriter_editor_links.php?gallery_id=${galleryId}`));
  }

  #addLink(galleryId: string, name: string, url: string) {
    return this.#send(() =>
      this.#ua.post('/create.weblink', {
        form: { sub_app: 'typewriter', sub_id: galleryId, link_name: name, link_url: url, submit: '1' },
      }),
    );
  }

  #deleteLink(linkId: string) {
    return this.fetchText(`/delete.weblink?id=${linkId}`);
  }

  /** Reconcile a gallery's links to exactly `links` (matched by URL): add missing, delete extras,
   *  leave matches untouched. Idempotent. */
  async setLinks(galleryId: string, links: { name: string; url: string }[]): Promise<void> {
    const norm = (u: string) => u.trim();
    const current = await this.listLinks(galleryId);
    const currentUrls = new Set(current.map((l) => norm(l.url)));
    const desiredUrls = new Set(links.map((l) => norm(l.url)));
    for (const l of links) {
      if (!currentUrls.has(norm(l.url))) await this.#addLink(galleryId, l.name, l.url);
    }
    for (const c of current) {
      if (!desiredUrls.has(norm(c.url))) await this.#deleteLink(c.id);
    }
  }

  /** List a gallery's photos (ids + stored image URLs). */
  async listMachinePhotos(galleryId: string): Promise<PhotoRef[]> {
    return parsePhotoList(await this.fetchHtml(`/typewriter_editor_photos.php?gallery_id=${galleryId}`));
  }

  /** Add a photo to a gallery. Resizes, uploads, and returns the new TWDB photo id. */
  async addPhoto(
    galleryId: string,
    image: ImageSource,
    opts: AddPhotoOptions = {},
  ): Promise<{ photoId: string }> {
    const fields: Record<string, string> = {
      site_id: '1',
      gallery_id: galleryId,
      photo_desc: opts.description ?? '',
      photo_wm: opts.watermark === false ? '0' : '1',
      photo_active: opts.publish === false ? '0' : '1',
      submit: '1',
    };
    const files = { photo: await resizeForGallery(image) };
    const res = await this.#postMultipart('/typewriter_photo_create.php', { fields, files });
    const ids = parsePhotoIds(await res.html());
    if (ids.length === 0) {
      throw new TwdbValidationError('TWDB did not return a photo id (the upload was likely rejected)');
    }
    // gp_id is a global autoincrement → the just-added photo is the numerically largest.
    const photoId = ids.reduce((a, b) => (Number(b) > Number(a) ? b : a));
    return { photoId };
  }

  /** Delete a photo from a gallery (TWDB's delete is a GET). */
  async deletePhoto(galleryId: string, photoId: string): Promise<void> {
    await this.fetchText(`/typewriter_photo_delete.php?id=${galleryId}&gp_id=${photoId}`);
  }

  /** Edit a photo's description / flags, optionally replacing its image. See UpdatePhotoOptions. */
  async updatePhoto(galleryId: string, photoId: string, opts: UpdatePhotoOptions = {}): Promise<void> {
    const fields: Record<string, string> = {
      site_id: '1',
      gp_id: photoId,
      gallery_id: galleryId,
      photo_desc: opts.description ?? '',
      photo_wm: opts.watermark === false ? '0' : '1',
      photo_active: opts.publish === false ? '0' : '1',
      submit: '1',
    };
    const files = opts.image ? { photo: await resizeForGallery(opts.image) } : undefined;
    await this.#postMultipart('/typewriter_photo_edit.php', { fields, files });
  }

  /** All of a hunter's machines from the public export (no login required). */
  async listMyMachines(hunterId: string): Promise<RemoteMachine[]> {
    return parseHunterCsv(
      await this.fetchText(`/typewriter_list_ajax.php?hunter_search=${hunterId}&output=csv`),
    );
  }

  /** Find a hunter's machine by manufacturer + model (+ serial if given), case-insensitive. */
  async findMachine(
    hunterId: string,
    criteria: { manufacturer: string; model: string; serial?: string },
  ): Promise<RemoteMachine | null> {
    const norm = (s: string) => s.trim().toLowerCase();
    // Serials are written inconsistently with spaces/dashes ("NM-89031", "NM 89031", "nm89031"),
    // so strip those too when matching — but NOT for model (spaces are meaningful: "Portable 2").
    const normSerial = (s: string) => s.toLowerCase().replace(/[\s-]/g, '');
    const machines = await this.listMyMachines(hunterId);
    return (
      machines.find(
        (m) =>
          norm(m.manufacturer) === norm(criteria.manufacturer) &&
          norm(m.model) === norm(criteria.model) &&
          (criteria.serial === undefined || normSerial(m.serial) === normSerial(criteria.serial)),
      ) ?? null
    );
  }

  /** Export the live cookie jar so a caller can persist the session (no password). */
  exportSession(): SerializedSession {
    const jar = this.#transport().cookieJar;
    if (!jar) throw new Error('Cookie jar not available');
    // serializeSync() is typed as returning `undefined` but never does in practice
    return { cookies: jar.serializeSync()! };
  }

  /** Rebuild a client from a previously exported session. */
  static fromSession(session: SerializedSession, opts: TwdbClientOptions): TwdbClient {
    const client = new TwdbClient(opts);
    (client.#transport()).cookieJar = CookieJar.deserializeSync(session.cookies);
    return client;
  }
}
