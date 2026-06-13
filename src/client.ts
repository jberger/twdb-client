// src/client.ts
import UserAgent, { type NodeResponse } from '@mojojs/user-agent';
import { CookieJar, type SerializedCookieJar } from 'tough-cookie';
import { AuthError, HttpError } from './errors.js';

type MojoDOM = Awaited<ReturnType<NodeResponse['html']>>;

export interface TwdbClientOptions {
  baseUrl: string;
  userAgent?: string;
  /** Minimum ms between requests (politeness). Default 1000. */
  minRequestIntervalMs?: number;
  /** passed to @mojojs/user-agent; null disables keep-alive — use in tests for speed */
  keepAlive?: number | null;
}

export interface SerializedSession {
  cookies: SerializedCookieJar;
}

/** Internal shape of httpTransport at runtime (UndiciTransport). */
interface UndiciTransportLike {
  cookieJar: CookieJar | null;
}

const DEFAULT_UA = 'twdb-client/0.1 (+https://github.com/joelberger/twdb-client)';

export class TwdbClient {
  #ua: UserAgent;
  #minInterval: number;
  #lastRequestAt = 0;
  #queue: Promise<unknown> = Promise.resolve();

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
