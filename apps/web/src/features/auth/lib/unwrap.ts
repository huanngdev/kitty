import { readLastRetryAfterSeconds } from "@/lib/auth-client";
import { AuthFlowError, describeAuthError } from "./auth-error";

/**
 * Unwraps a Better Auth client response: throws a user-facing `AuthFlowError`
 * on failure, returns the data otherwise. `null` data is treated as a failure
 * (no auth endpoint Kitty uses returns a meaningful `null`).
 */
export function unwrapResult<T>(
  result: { readonly data: T | null; readonly error: unknown },
  fallback: string,
): T {
  if (result.error !== null && result.error !== undefined) {
    throw new AuthFlowError(
      describeAuthError(result.error, {
        fallback,
        retryAfterSeconds: readLastRetryAfterSeconds(),
      }),
    );
  }

  if (result.data === null || result.data === undefined) {
    throw new AuthFlowError(describeAuthError(undefined, { fallback }));
  }

  return result.data;
}
