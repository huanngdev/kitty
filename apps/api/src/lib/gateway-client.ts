import { apiErrorSchema, errorCodes } from "@kitty/shared";
import {
  type KittyDetail,
  type VerifiedPayee,
  kittyDetailSchema,
  payeeListResponseSchema,
  verifiedPayeeSchema,
} from "@kitty/shared/leash-admin";
import axios, { type AxiosInstance } from "axios";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { z } from "zod";
import { env } from "../env";
import { ADMIN_AUTH_HEADERS, signAdminRequest } from "./admin-signing";
import { AppError } from "./errors";

/**
 * Typed client for the Gateway Admin API (docs/10-api-spec.md §1).
 *
 * `apps/api` acts on behalf of an organizer: every call is signed with the
 * shared `GATEWAY_ADMIN_TOKEN` over `userId + "\n" + timestamp + "\n" + rawBody`
 * and the gateway enforces per-kitty ownership (403 `FORBIDDEN`, 404
 * `*_NOT_FOUND`). There is no PayPal code here — the gateway is the only service
 * that holds PayPal secrets (AGENTS.md invariant #1).
 *
 * Like `getDb()`, the client is built lazily: an unconfigured `GATEWAY_URL` /
 * `GATEWAY_ADMIN_TOKEN` only fails the first call that actually needs it, with a
 * clear 503.
 */

export interface GatewayAdminClient {
  /** `POST /v1/kitties` — create the kitty that mirrors an event. */
  createKitty(input: { readonly userId: string; readonly eventId: string }): Promise<KittyDetail>;
  /** `POST /v1/kitties/:id/payees` — organizer confirms a vendor email. */
  verifyPayee(input: {
    readonly userId: string;
    readonly kittyId: string;
    readonly email: string;
  }): Promise<VerifiedPayee>;
  /** `GET /v1/kitties/:id/payees` — organizer-verified payees. */
  listPayees(input: {
    readonly userId: string;
    readonly kittyId: string;
  }): Promise<VerifiedPayee[]>;
}

interface GatewayConfig {
  readonly baseUrl: string;
  readonly token: string;
}

function getGatewayConfig(): GatewayConfig {
  if (env.GATEWAY_URL === undefined || env.GATEWAY_ADMIN_TOKEN === undefined) {
    throw new AppError(errorCodes.gatewayNotConfigured, 503, {
      hint: "Set GATEWAY_URL and GATEWAY_ADMIN_TOKEN in apps/api/.env.",
    });
  }

  return { baseUrl: env.GATEWAY_URL, token: env.GATEWAY_ADMIN_TOKEN };
}

let http: AxiosInstance | undefined;

function getHttp(baseUrl: string): AxiosInstance {
  http ??= axios.create({ baseURL: baseUrl, timeout: 10_000 });

  return http;
}

/** Only statuses the gateway actually returns are forwarded verbatim. */
const forwardedStatuses: Record<number, ContentfulStatusCode> = {
  200: 200,
  201: 201,
  400: 400,
  401: 401,
  403: 403,
  404: 404,
  409: 409,
  422: 422,
  429: 429,
  500: 500,
  502: 502,
  503: 503,
  504: 504,
};

/** Maps an axios failure to an `AppError`, preserving the gateway's error code. */
function toAppError(error: unknown): AppError {
  if (axios.isAxiosError(error)) {
    const response = error.response;

    if (response === undefined) {
      return new AppError(errorCodes.gatewayUnavailable, 503, {
        reason: error.code ?? "network error",
      });
    }

    const status = forwardedStatuses[response.status] ?? 502;
    const parsed = apiErrorSchema.safeParse(response.data);

    if (parsed.success) {
      return new AppError(parsed.data.error.code, status, parsed.data.error.details);
    }

    return new AppError(errorCodes.gatewayError, status, { status: response.status });
  }

  return new AppError(errorCodes.gatewayError, 502);
}

interface SendInput {
  readonly method: "get" | "post";
  readonly path: string;
  readonly userId: string;
  /** Body serialized once and signed; omitted for GET. */
  readonly body?: unknown;
}

async function send<T>(input: SendInput, schema: z.ZodType<T>): Promise<T> {
  const { baseUrl, token } = getGatewayConfig();
  const rawBody = input.body === undefined ? "" : JSON.stringify(input.body);
  const authHeaders = await signAdminRequest({ token, userId: input.userId, body: rawBody });

  try {
    const response = await getHttp(baseUrl).request({
      method: input.method,
      url: input.path,
      headers:
        rawBody === "" ? authHeaders : { ...authHeaders, "content-type": "application/json" },
      data: rawBody === "" ? undefined : rawBody,
    });

    const parsed = schema.safeParse(response.data);

    if (!parsed.success) {
      throw new AppError(errorCodes.gatewayResponseInvalid, 502, {
        path: input.path,
        issues: parsed.error.issues.map((issue) => issue.message),
      });
    }

    return parsed.data;
  } catch (error) {
    throw toAppError(error);
  }
}

/** The admin auth header names re-exported for the smoke test and tests. */
export { ADMIN_AUTH_HEADERS };

/** Builds a client; the app uses the shared {@link gatewayAdminClient}. */
export function createGatewayAdminClient(): GatewayAdminClient {
  return {
    async createKitty({ userId, eventId }) {
      return send(
        { method: "post", path: "/v1/kitties", userId, body: { eventId } },
        kittyDetailSchema,
      );
    },

    async verifyPayee({ userId, kittyId, email }) {
      return send(
        { method: "post", path: `/v1/kitties/${kittyId}/payees`, userId, body: { email } },
        verifiedPayeeSchema,
      );
    },

    async listPayees({ userId, kittyId }) {
      const response = await send(
        { method: "get", path: `/v1/kitties/${kittyId}/payees`, userId },
        payeeListResponseSchema,
      );

      return response.items;
    },
  };
}

/** The single gateway admin client the API modules use. */
export const gatewayAdminClient: GatewayAdminClient = createGatewayAdminClient();
