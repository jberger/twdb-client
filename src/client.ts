// src/client.ts
import UserAgent, { type NodeResponse } from '@mojojs/user-agent';
import { CookieJar, type SerializedCookieJar } from 'tough-cookie';
import { AuthError, HttpError } from './errors.js';
import { parseBrandOptions, parseModelOptions } from './parse.js';
import type { Brand, Model } from './types.js';

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
