import type { AuthConfigPayload, SocialProviderId } from "@kitty/shared/auth";
import { socialProviderIdSchema } from "@kitty/shared/auth";
import type { BetterAuthOptions } from "better-auth";

/**
 * Pure decisions about the auth feature set for a given env (ADR-028/029).
 *
 * Kept out of `auth.ts` so route tests and unit tests can assert every env
 * combination without building a Better Auth instance or touching a database.
 */
export interface AuthEnvInput {
  readonly NODE_ENV: "development" | "test" | "production";
  readonly GITHUB_CLIENT_ID?: string | undefined;
  readonly GITHUB_CLIENT_SECRET?: string | undefined;
  readonly PAYPAL_LOGIN_CLIENT_ID?: string | undefined;
  readonly PAYPAL_LOGIN_CLIENT_SECRET?: string | undefined;
  readonly PAYPAL_LOGIN_ENV?: "sandbox" | "live" | undefined;
  readonly RESEND_API_KEY?: string | undefined;
  readonly MAIL_FROM?: string | undefined;
  readonly AUTH_REQUIRE_EMAIL_VERIFICATION?: boolean | undefined;
  readonly DEMO_LOGIN_ENABLED?: boolean | undefined;
}

export interface SocialProviderCredentials {
  readonly github?: { readonly clientId: string; readonly clientSecret: string };
  readonly paypal?: { readonly clientId: string; readonly clientSecret: string };
}

/** A provider is available only when BOTH of its credentials are present. */
export function readProviderCredentials(env: AuthEnvInput): SocialProviderCredentials {
  const credentials: {
    github?: { clientId: string; clientSecret: string };
    paypal?: { clientId: string; clientSecret: string };
  } = {};

  if (env.GITHUB_CLIENT_ID !== undefined && env.GITHUB_CLIENT_SECRET !== undefined) {
    credentials.github = {
      clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET,
    };
  }

  if (env.PAYPAL_LOGIN_CLIENT_ID !== undefined && env.PAYPAL_LOGIN_CLIENT_SECRET !== undefined) {
    credentials.paypal = {
      clientId: env.PAYPAL_LOGIN_CLIENT_ID,
      clientSecret: env.PAYPAL_LOGIN_CLIENT_SECRET,
    };
  }

  return credentials;
}

/** Providers to render in the UI, in a stable order. */
export function enabledProviders(env: AuthEnvInput): SocialProviderId[] {
  const credentials = readProviderCredentials(env);
  const providers: SocialProviderId[] = [];

  if (credentials.github !== undefined) providers.push("github");
  if (credentials.paypal !== undefined) providers.push("paypal");

  return providers.map((provider) => socialProviderIdSchema.parse(provider));
}

/** Resend is configured when both the key and a sender address exist. */
export function isRealMailerConfigured(env: AuthEnvInput): boolean {
  return env.RESEND_API_KEY !== undefined && env.MAIL_FROM !== undefined;
}

/**
 * Verification policy (ADR-029):
 * - explicit `AUTH_REQUIRE_EMAIL_VERIFICATION` always wins;
 * - otherwise ON in production only when a real mailer can deliver the link;
 * - OFF in development/test, where the UI shows a banner instead.
 *
 * Production without a real mailer is a documented, warned-about trade-off:
 * requiring verification without a way to deliver it would lock everyone out.
 */
export function shouldRequireEmailVerification(env: AuthEnvInput): boolean {
  if (env.AUTH_REQUIRE_EMAIL_VERIFICATION !== undefined) {
    return env.AUTH_REQUIRE_EMAIL_VERIFICATION;
  }

  return env.NODE_ENV === "production" && isRealMailerConfigured(env);
}

/** The public `GET /api/auth-config` payload — never contains secrets. */
export function toPublicAuthConfig(env: AuthEnvInput): AuthConfigPayload {
  return {
    emailPassword: true,
    providers: enabledProviders(env),
    demo: env.DEMO_LOGIN_ENABLED ?? false,
    emailVerification: shouldRequireEmailVerification(env),
  };
}

/**
 * Builds the Better Auth `socialProviders` map. Only fully configured providers
 * are registered, so a deployment without GitHub credentials cannot be tricked
 * into starting a broken OAuth flow (the UI hides the button too).
 */
export function buildSocialProviders(
  env: AuthEnvInput,
): NonNullable<BetterAuthOptions["socialProviders"]> {
  const credentials = readProviderCredentials(env);

  return {
    ...(credentials.github === undefined
      ? {}
      : {
          github: {
            clientId: credentials.github.clientId,
            clientSecret: credentials.github.clientSecret,
            scope: ["read:user", "user:email"],
          },
        }),
    ...(credentials.paypal === undefined
      ? {}
      : {
          paypal: {
            clientId: credentials.paypal.clientId,
            clientSecret: credentials.paypal.clientSecret,
            environment: env.PAYPAL_LOGIN_ENV ?? "sandbox",
          },
        }),
  };
}
