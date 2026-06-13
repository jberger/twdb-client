// src/client.ts
import UserAgent from '@mojojs/user-agent';
import { AuthError, HttpError } from './errors.js';

export interface TwdbClientOptions {
  baseUrl: string;
  userAgent?: string;
  /** Minimum ms between requests (politeness). Default 1000. */
  minRequestIntervalMs?: number;
}

const DEFAULT_UA = 'twdb-client/0.1 (+https://github.com/joelberger/twdb-client)';

export class TwdbClient {
  #ua: UserAgent;

  constructor(opts: TwdbClientOptions) {
    this.#ua = new UserAgent({
      baseURL: opts.baseUrl,
      name: opts.userAgent ?? DEFAULT_UA,
      maxRedirects: 5,
    });
  }

  /**
   * Authenticate. Posts the TWDB login form and follows the redirect. Success is
   * detected by the absence of the login form in the resulting page (a re-rendered
   * login form == failure). NOTE: refine this marker against the real login.php
   * response during the slice-1 recon pass.
   */
  async login(username: string, password: string): Promise<void> {
    const res = await this.#ua.post('/login.php', {
      form: { username, passwd: password, commit: 'Sign In' },
    });
    const dom = await res.html();
    if (dom.at('input[name="passwd"]')) {
      throw new AuthError('TWDB login failed (check username/password)');
    }
  }

  /** GET `path` and return its parsed HTML DOM (@mojojs/dom). Throws HttpError on non-2xx. */
  async fetchHtml(path: string) {
    const res = await this.#ua.get(path);
    if (!res.isSuccess) {
      throw new HttpError(`GET ${path} -> ${res.statusCode}`, res.statusCode);
    }
    return res.html();
  }
}
