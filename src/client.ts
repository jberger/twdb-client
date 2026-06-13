// src/client.ts
import UserAgent from '@mojojs/user-agent';
import { HttpError } from './errors.js';

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

  /** GET `path` and return its parsed HTML DOM (@mojojs/dom). Throws HttpError on non-2xx. */
  async fetchHtml(path: string) {
    const res = await this.#ua.get(path);
    if (!res.isSuccess) {
      throw new HttpError(`GET ${path} -> ${res.statusCode}`, res.statusCode);
    }
    return res.html();
  }
}
