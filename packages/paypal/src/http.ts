import axios, { type AxiosInstance, type AxiosResponse } from "axios";
import { PayPalApiError, toPayPalApiError } from "./errors";
import { tokenResponseSchema } from "./schemas";
import type { PayPalLogger } from "./types";

/** HTTP verbs used at the PayPal edge. */
export type PayPalMethod = "GET" | "POST" | "PATCH";

/** Axios-free view of a response, so `parse` stays transport-agnostic. */
export interface PayPalResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string | undefined>>;
}

/** One call description handed to the transport. */
export interface PayPalRequestSpec<T> {
  readonly method: PayPalMethod;
  readonly path: string;
  /** Required for POST/PATCH: sent as `PayPal-Request-Id` on every attempt. */
  readonly requestId?: string;
  readonly body?: unknown;
  readonly params?: Readonly<Record<string, string>>;
  readonly headers?: Readonly<Record<string, string>>;
  /** `false` for the OAuth token call itself. Defaults to token auth. */
  readonly auth?: boolean;
  /** Validates and maps the raw body after a successful response. */
  readonly parse: (data: unknown, response: PayPalResponse) => T;
}

/** The internal executor shared by every namespace. */
export interface PayPalTransport {
  request<T>(spec: PayPalRequestSpec<T>): Promise<T>;
  /** Acquires (or reuses) an access token, proving the OAuth credentials. */
  verifyCredentials(): Promise<void>;
}

export interface PayPalTransportOptions {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly instance: AxiosInstance;
  readonly now: () => number;
  readonly sleep: (ms: number) => Promise<void>;
  readonly logger?: PayPalLogger;
  readonly maxAttempts: number;
}

/** Backoff parameters — exported for the retry tests. */
export const BACKOFF_BASE_MS = 250;

interface FailureInfo {
  readonly retryable: boolean;
  readonly status: number | undefined;
  readonly retryAfterMs: number | undefined;
}

interface CachedToken {
  readonly token: string;
  readonly expiresAtMs: number;
}

/** Reads a header case-insensitively from any object (axios headers included). */
export function readHeader(headers: unknown, name: string): string | undefined {
  if (headers === null || typeof headers !== "object") {
    return undefined;
  }

  const target = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() !== target) {
      continue;
    }

    const value = Reflect.get(headers, key);
    if (typeof value === "string") {
      return value;
    }
  }

  return undefined;
}

function toHeaderRecord(headers: AxiosResponse["headers"]): Record<string, string | undefined> {
  const record: Record<string, string | undefined> = {};

  for (const key of Object.keys(headers)) {
    const value = Reflect.get(headers, key);
    if (typeof value === "string") {
      record[key.toLowerCase()] = value;
    }
  }

  return record;
}

/**
 * Finds the first HATEOAS link whose `rel` is in `rels` (in preference order)
 * and returns its `href`.
 */
export function findLink(
  links: readonly { readonly rel: string; readonly href: string }[] | undefined,
  rels: readonly string[],
): string | undefined {
  if (links === undefined) {
    return undefined;
  }

  for (const rel of rels) {
    const match = links.find((link) => link.rel === rel);
    if (match !== undefined) {
      return match.href;
    }
  }

  return undefined;
}

function parseRetryAfter(value: string | undefined, now: () => number): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }

  const date = Date.parse(value);
  if (Number.isNaN(date)) {
    return undefined;
  }

  return Math.max(0, date - now());
}

function classify(error: unknown, now: () => number): FailureInfo {
  if (!axios.isAxiosError(error)) {
    return { retryable: false, status: undefined, retryAfterMs: undefined };
  }

  const status = error.response?.status;
  if (status === undefined) {
    // Network error or timeout: retry with the same request id.
    return { retryable: true, status: undefined, retryAfterMs: undefined };
  }

  if (status === 429) {
    return {
      retryable: true,
      status,
      retryAfterMs: parseRetryAfter(readHeader(error.response?.headers, "retry-after"), now),
    };
  }

  if (status >= 500) {
    return { retryable: true, status, retryAfterMs: undefined };
  }

  return { retryable: false, status, retryAfterMs: undefined };
}

/** Exponential backoff with full jitter: `base·2^(n-1) + rand(base·2^(n-1))`. */
export function backoffMs(attemptIndex: number, random: () => number = Math.random): number {
  const base = BACKOFF_BASE_MS * 2 ** (Math.max(attemptIndex, 1) - 1);

  return base + Math.floor(random() * base);
}

const noopLogger: PayPalLogger = {
  debug: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

interface TokenManager {
  getToken(): Promise<string>;
  invalidate(): void;
}

/**
 * OAuth2 client-credentials token cache.
 *
 * The token is reused until `expires_in − 60s`; concurrent callers share one
 * in-flight request (single-flight) and a 401 triggers exactly one refresh.
 */
export function createTokenManager(options: {
  readonly instance: AxiosInstance;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly now: () => number;
  readonly logger: PayPalLogger;
}): TokenManager {
  let cached: CachedToken | undefined;
  let pending: Promise<CachedToken> | undefined;

  async function fetchToken(): Promise<CachedToken> {
    let response: AxiosResponse<unknown>;
    try {
      response = await options.instance.post("/v1/oauth2/token", "grant_type=client_credentials", {
        auth: { username: options.clientId, password: options.clientSecret },
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });
    } catch (error) {
      throw toPayPalApiError(error);
    }

    const parsed = tokenResponseSchema.parse(response.data);
    const expiresAtMs = options.now() + parsed.expires_in * 1000 - 60_000;
    options.logger.debug(
      { event: "paypal.token.acquired", expiresAtMs },
      "PayPal access token acquired",
    );

    return { token: parsed.access_token, expiresAtMs };
  }

  function refresh(): Promise<CachedToken> {
    if (pending !== undefined) {
      return pending;
    }

    pending = fetchToken().finally(() => {
      pending = undefined;
    });

    return pending;
  }

  return {
    async getToken(): Promise<string> {
      if (cached !== undefined && options.now() < cached.expiresAtMs) {
        return cached.token;
      }

      const result = await refresh();
      cached = result;

      return result.token;
    },
    invalidate(): void {
      cached = undefined;
    },
  };
}

/** Builds the shared transport: token cache + retry + error mapping. */
export function createTransport(options: PayPalTransportOptions): PayPalTransport {
  const logger = options.logger ?? noopLogger;
  const token = createTokenManager({
    instance: options.instance,
    clientId: options.clientId,
    clientSecret: options.clientSecret,
    now: options.now,
    logger,
  });

  return {
    async verifyCredentials(): Promise<void> {
      // The token is acquired and discarded — it is never returned to callers.
      await token.getToken();
    },

    async request<T>(spec: PayPalRequestSpec<T>): Promise<T> {
      let attempt = 1;
      let refreshedOn401 = false;

      for (;;) {
        let response: AxiosResponse<unknown>;
        try {
          const headers: Record<string, string> = { ...spec.headers };
          if (spec.auth !== false) {
            headers.Authorization = `Bearer ${await token.getToken()}`;
          }
          if (spec.requestId !== undefined) {
            headers["PayPal-Request-Id"] = spec.requestId;
          }

          response = await options.instance.request({
            method: spec.method,
            url: spec.path,
            data: spec.body,
            params: spec.params,
            headers,
          });
        } catch (error) {
          const failure = classify(error, options.now);

          if (failure.status === 401 && spec.auth !== false && !refreshedOn401) {
            refreshedOn401 = true;
            token.invalidate();
            logger.warn(
              { event: "paypal.token.refresh", path: spec.path },
              "PayPal returned 401 — refreshing the access token once",
            );
            continue;
          }

          if (attempt >= options.maxAttempts || !failure.retryable) {
            logger.error(
              { event: "paypal.request.failed", path: spec.path, status: failure.status, attempt },
              "PayPal request failed",
            );

            // Transport failures (axios) and OAuth failures become one
            // PayPalApiError; anything else (for example a Zod parse error)
            // keeps its own type so callers can tell a schema bug apart.
            if (error instanceof PayPalApiError || axios.isAxiosError(error)) {
              throw toPayPalApiError(error);
            }

            throw error;
          }

          const delayMs = failure.retryAfterMs ?? backoffMs(attempt);
          logger.warn(
            { event: "paypal.retry", path: spec.path, attempt, status: failure.status, delayMs },
            "Retrying PayPal request",
          );
          await options.sleep(delayMs);
          attempt += 1;
          continue;
        }

        return spec.parse(response.data, {
          status: response.status,
          headers: toHeaderRecord(response.headers),
        });
      }
    },
  };
}
