/**
 * SafePinterestClient: the ONLY code that sends requests to the Pinterest API
 * (apart from the OAuth token exchange in auth.ts).
 *
 * Data-safety guarantee: every request is checked against a small allowlist
 * BEFORE it goes out. There is no DELETE, PATCH or PUT, and the only POSTs are
 * "create board" and "save/create pin on a board". Pins are never deleted,
 * moved or edited.
 */

export type HttpMethod = 'GET' | 'POST';

export class SafetyViolation extends Error {
  constructor(method: string, pathname: string) {
    super(`Blocked by safety allowlist: ${method} ${pathname}`);
    this.name = 'SafetyViolation';
  }
}

export class PinterestApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly retryAfterMs?: number,
    public readonly code?: number,
  ) {
    super(message);
    this.name = 'PinterestApiError';
  }

  get retryable() {
    return this.status === 0 || this.status === 429 || this.status >= 500;
  }
}

const ID = '[A-Za-z0-9_-]+';
const ALLOWLIST: ReadonlyArray<{ method: HttpMethod; pattern: RegExp; why: string }> = [
  { method: 'GET', pattern: /^\/user_account$/, why: 'read profile' },
  { method: 'GET', pattern: /^\/boards$/, why: 'list boards' },
  { method: 'GET', pattern: new RegExp(`^/boards/${ID}$`), why: 'read board' },
  { method: 'GET', pattern: new RegExp(`^/boards/${ID}/pins$`), why: 'list board pins' },
  { method: 'GET', pattern: new RegExp(`^/pins/${ID}$`), why: 'read pin' },
  { method: 'POST', pattern: /^\/boards$/, why: 'create destination board' },
  { method: 'POST', pattern: new RegExp(`^/pins/${ID}/save$`), why: 're-pin a copy onto a board' },
  { method: 'POST', pattern: /^\/pins$/, why: 'create a copy of a pin on a board' },
];

export function assertAllowed(method: string, pathname: string): void {
  const ok = ALLOWLIST.some((rule) => rule.method === method && rule.pattern.test(pathname));
  if (!ok) throw new SafetyViolation(method, pathname);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function backoffMs(attempt: number, baseMs = 1000, maxMs = 5 * 60_000) {
  const exp = Math.min(maxMs, baseMs * 2 ** attempt);
  return Math.round(exp / 2 + Math.random() * (exp / 2)); // "equal jitter"
}

function parseRetryAfter(res: Response): number | undefined {
  const h = res.headers.get('retry-after');
  if (!h) return undefined;
  const secs = Number(h);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const date = Date.parse(h);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
}

export interface ClientOptions {
  baseUrl: string;
  getToken: () => Promise<string>;
  /** Called once on 401; should refresh and return a new token (or throw). */
  refreshToken: () => Promise<string>;
  fetchImpl?: typeof fetch;
  maxGetRetries?: number;
}

export class SafePinterestClient {
  /** Shared pause after a 429 so all calls back off together. */
  private pausedUntil = 0;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: ClientOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  get rateLimitedUntil() {
    return this.pausedUntil;
  }

  async request<T>(
    method: HttpMethod,
    pathname: string,
    { query, body }: { query?: Record<string, string | number | undefined>; body?: unknown } = {},
  ): Promise<T> {
    assertAllowed(method, pathname);

    const url = new URL(this.opts.baseUrl + pathname);
    for (const [k, v] of Object.entries(query ?? {})) {
      if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
    }

    const maxRetries = method === 'GET' ? (this.opts.maxGetRetries ?? 5) : 0;
    let token = await this.opts.getToken();
    let refreshed = false;

    for (let attempt = 0; ; attempt++) {
      const wait = this.pausedUntil - Date.now();
      if (wait > 0) await sleep(wait);

      let res: Response;
      try {
        res = await this.fetchImpl(url, {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
            ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          },
          body: body !== undefined ? JSON.stringify(body) : undefined,
        });
      } catch (err) {
        if (attempt < maxRetries) {
          await sleep(backoffMs(attempt));
          continue;
        }
        throw new PinterestApiError(0, `Network error: ${(err as Error).message}`);
      }

      this.trackRateLimit(res);

      if (res.ok) {
        const text = await res.text();
        return (text ? JSON.parse(text) : undefined) as T;
      }

      if (res.status === 401 && !refreshed) {
        refreshed = true;
        token = await this.opts.refreshToken();
        attempt--;
        continue;
      }

      let message = `${res.status} ${res.statusText}`;
      let code: number | undefined;
      try {
        const json = (await res.json()) as { message?: string; code?: number };
        if (json.message) message = json.message;
        code = json.code;
      } catch {
        /* non-JSON error body */
      }

      const retryAfterMs = parseRetryAfter(res);
      if (res.status === 429) {
        this.pausedUntil = Date.now() + (retryAfterMs ?? backoffMs(attempt, 2000));
      }

      const err = new PinterestApiError(res.status, message, retryAfterMs, code);
      if (err.retryable && attempt < maxRetries) {
        if (res.status !== 429) await sleep(retryAfterMs ?? backoffMs(attempt));
        continue;
      }
      throw err;
    }
  }

  private trackRateLimit(res: Response) {
    const remaining = res.headers.get('x-ratelimit-remaining');
    const reset = Number(res.headers.get('x-ratelimit-reset'));
    if (remaining === '0' && Number.isFinite(reset) && reset > 0) {
      // Header is seconds-until-reset; guard against epoch timestamps.
      const ms = reset < 3600 ? reset * 1000 : 60_000;
      this.pausedUntil = Math.max(this.pausedUntil, Date.now() + ms);
    }
  }

  /** Follows Pinterest's `bookmark` cursor until all pages are read. */
  async *paginate<T>(pathname: string, query: Record<string, string | number | undefined> = {}) {
    let bookmark: string | undefined;
    let pages = 0;
    do {
      const page = await this.request<{ items: T[]; bookmark?: string | null }>('GET', pathname, {
        query: { page_size: 250, ...query, bookmark },
      });
      yield* page.items ?? [];
      bookmark = page.bookmark ?? undefined;
      pages++;
    } while (bookmark && pages < 1000);
  }
}
