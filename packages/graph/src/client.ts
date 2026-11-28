/**
 * Minimal Microsoft Graph client for app-only (client credentials) access.
 * fetch is injected so tests run without the network.
 */

export type Fetch = typeof fetch;

export interface AppCredentials {
  clientId: string;
  clientSecret: string;
  /** Defaults to https://login.microsoftonline.com */
  authority?: string;
}

export class GraphError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    /** AADSTS error numbers from the token endpoint, e.g. 7000215 for a wrong client secret. */
    readonly aadCodes: number[] = [],
  ) {
    super(message);
  }
  /**
   * Sigwide's own client secret is wrong or expired (AADSTS7000215, 7000222). This is our
   * configuration problem, not the customer's: it must never mark their consent as revoked.
   */
  get isCredentialProblem(): boolean {
    return this.aadCodes.some((c) => CREDENTIAL_ERRORS.has(c));
  }
  /** Consent removed, app deleted in the tenant, or permissions missing. */
  get isConsentProblem(): boolean {
    if (this.isCredentialProblem) return false;
    return this.status === 401 || this.status === 403 || this.code === "invalid_client" || this.code === "unauthorized_client";
  }
}

const CREDENTIAL_ERRORS = new Set([7000215, 7000222]);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class GraphClient {
  private token: { value: string; expiresAt: number } | null = null;

  constructor(
    private readonly tenantId: string,
    private readonly creds: AppCredentials,
    private readonly fetchImpl: Fetch = fetch,
    private readonly opts: { maxRetries?: number; sleep?: (ms: number) => Promise<void> } = {},
  ) {}

  async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value;
    const authority = this.creds.authority ?? "https://login.microsoftonline.com";
    const res = await this.fetchImpl(`${authority}/${encodeURIComponent(this.tenantId)}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.creds.clientId,
        client_secret: this.creds.clientSecret,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }),
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || typeof body.access_token !== "string") {
      const aadCodes = Array.isArray(body.error_codes) ? body.error_codes.filter((c): c is number => typeof c === "number") : [];
      throw new GraphError(`token request failed: ${String(body.error_description ?? res.status)}`, res.status, String(body.error ?? ""), aadCodes);
    }
    this.token = { value: body.access_token, expiresAt: Date.now() + Number(body.expires_in ?? 3600) * 1000 };
    return this.token.value;
  }

  /** GET an absolute Graph URL or a path under /v1.0, retrying 429 and 5xx with Retry-After. */
  async get<T>(urlOrPath: string, headers: Record<string, string> = {}): Promise<T> {
    const url = urlOrPath.startsWith("https://") ? urlOrPath : `https://graph.microsoft.com/v1.0${urlOrPath}`;
    if (!url.startsWith("https://graph.microsoft.com/")) throw new Error("refusing to call a non-Graph URL");
    const max = this.opts.maxRetries ?? 5;
    const wait = this.opts.sleep ?? sleep;
    for (let attempt = 0; ; attempt++) {
      const res = await this.fetchImpl(url, { headers: { Authorization: `Bearer ${await this.accessToken()}`, ...headers } });
      if (res.ok) return (await res.json()) as T;
      if ((res.status === 429 || res.status >= 500) && attempt < max) {
        const ra = Number(res.headers.get("Retry-After"));
        await wait(Number.isFinite(ra) && ra > 0 ? ra * 1000 : Math.min(30_000, 500 * 2 ** attempt));
        continue;
      }
      const body = (await res.json().catch(() => ({}))) as { error?: { code?: string; message?: string } };
      throw new GraphError(body.error?.message ?? `Graph ${res.status}`, res.status, body.error?.code);
    }
  }

  /** Follows @odata.nextLink pages; returns all values and the final @odata.deltaLink if any. */
  async *pages<T>(start: string): AsyncGenerator<{ value: T[]; deltaLink?: string }> {
    let next: string | undefined = start;
    while (next) {
      const page: { value?: T[]; "@odata.nextLink"?: string; "@odata.deltaLink"?: string } = await this.get(next);
      yield { value: page.value ?? [], deltaLink: page["@odata.deltaLink"] };
      next = page["@odata.nextLink"];
    }
  }
}
