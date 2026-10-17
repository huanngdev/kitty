import { describe, expect, test } from "bun:test";
import { socialProviderIdSchema } from "@kitty/shared/auth";
import { z } from "zod";
import {
  type AuthEnvInput,
  buildSocialProviders,
  enabledProviders,
  isRealMailerConfigured,
  readProviderCredentials,
  shouldRequireEmailVerification,
  toPublicAuthConfig,
} from "../../src/lib/auth-config";

function baseEnv(overrides: Partial<AuthEnvInput> = {}): AuthEnvInput {
  return { NODE_ENV: "development", ...overrides };
}

const githubEnv = {
  GITHUB_CLIENT_ID: "gh-id",
  GITHUB_CLIENT_SECRET: "gh-secret",
} as const;

const paypalEnv = {
  PAYPAL_LOGIN_CLIENT_ID: "pp-id",
  PAYPAL_LOGIN_CLIENT_SECRET: "pp-secret",
} as const;

/** Shape checks for the provider maps (the config type is a union with a factory). */
const githubShape = z.object({
  github: z.object({
    clientId: z.string(),
    clientSecret: z.string(),
    scope: z.array(z.string()),
  }),
});

const paypalShape = z.object({
  paypal: z.object({
    clientId: z.string(),
    clientSecret: z.string(),
    environment: z.string(),
  }),
});

describe("readProviderCredentials", () => {
  test("registers a provider only when both halves are present", () => {
    expect(readProviderCredentials(baseEnv())).toEqual({});
    expect(readProviderCredentials(baseEnv({ GITHUB_CLIENT_ID: "gh-id" }))).toEqual({});
    expect(readProviderCredentials(baseEnv({ ...githubEnv }))).toEqual({
      github: { clientId: "gh-id", clientSecret: "gh-secret" },
    });
  });
});

describe("enabledProviders", () => {
  test("is empty without credentials and ordered github → paypal", () => {
    expect(enabledProviders(baseEnv())).toEqual([]);
    expect(enabledProviders(baseEnv({ ...paypalEnv, ...githubEnv }))).toEqual(["github", "paypal"]);
  });

  test("only reports known provider ids", () => {
    for (const provider of enabledProviders(baseEnv({ ...paypalEnv, ...githubEnv }))) {
      expect(socialProviderIdSchema.safeParse(provider).success).toBe(true);
    }
  });
});

describe("buildSocialProviders", () => {
  test("returns an empty map without credentials", () => {
    expect(buildSocialProviders(baseEnv())).toEqual({});
  });

  test("builds the GitHub provider with the read:user and user:email scopes", () => {
    const providers = buildSocialProviders(baseEnv({ ...githubEnv }));
    const parsed = githubShape.parse(providers);

    expect(parsed.github).toEqual({
      clientId: "gh-id",
      clientSecret: "gh-secret",
      scope: ["read:user", "user:email"],
    });
  });

  test("builds the PayPal login provider, defaulting to sandbox", () => {
    const providers = buildSocialProviders(baseEnv({ ...paypalEnv }));
    const live = buildSocialProviders(baseEnv({ ...paypalEnv, PAYPAL_LOGIN_ENV: "live" }));

    expect(paypalShape.parse(providers).paypal).toEqual({
      clientId: "pp-id",
      clientSecret: "pp-secret",
      environment: "sandbox",
    });
    expect(paypalShape.parse(live).paypal.environment).toBe("live");
  });

  test("builds PayPal from the login app only", () => {
    const providers = buildSocialProviders(baseEnv({ ...paypalEnv }));
    const serialized = JSON.stringify(providers);

    // Only the login credentials appear: the money app's secret is gateway-only.
    expect(serialized).toContain("pp-secret");
    expect(Object.keys(providers)).toEqual(["paypal"]);
  });
});

describe("shouldRequireEmailVerification", () => {
  test("is off in development and test even with a real mailer", () => {
    expect(
      shouldRequireEmailVerification(baseEnv({ RESEND_API_KEY: "k", MAIL_FROM: "a@b.c" })),
    ).toBe(false);
    expect(
      shouldRequireEmailVerification(
        baseEnv({ NODE_ENV: "test", RESEND_API_KEY: "k", MAIL_FROM: "a@b.c" }),
      ),
    ).toBe(false);
  });

  test("is on in production only when a real mailer is configured", () => {
    expect(shouldRequireEmailVerification(baseEnv({ NODE_ENV: "production" }))).toBe(false);
    expect(
      shouldRequireEmailVerification(
        baseEnv({ NODE_ENV: "production", RESEND_API_KEY: "k", MAIL_FROM: "a@b.c" }),
      ),
    ).toBe(true);
  });

  test("an explicit override wins", () => {
    expect(shouldRequireEmailVerification(baseEnv({ AUTH_REQUIRE_EMAIL_VERIFICATION: true }))).toBe(
      true,
    );
    expect(
      shouldRequireEmailVerification(
        baseEnv({
          NODE_ENV: "production",
          RESEND_API_KEY: "k",
          MAIL_FROM: "a@b.c",
          AUTH_REQUIRE_EMAIL_VERIFICATION: false,
        }),
      ),
    ).toBe(false);
  });
});

describe("isRealMailerConfigured", () => {
  test("needs both the key and the sender", () => {
    expect(isRealMailerConfigured(baseEnv())).toBe(false);
    expect(isRealMailerConfigured(baseEnv({ RESEND_API_KEY: "k" }))).toBe(false);
    expect(isRealMailerConfigured(baseEnv({ RESEND_API_KEY: "k", MAIL_FROM: "a@b.c" }))).toBe(true);
  });
});

describe("toPublicAuthConfig", () => {
  test("never leaks secrets and reflects the env", () => {
    const config = toPublicAuthConfig(
      baseEnv({ ...githubEnv, ...paypalEnv, DEMO_LOGIN_ENABLED: true }),
    );

    expect(config).toEqual({
      emailPassword: true,
      providers: ["github", "paypal"],
      demo: true,
      emailVerification: false,
    });
    expect(JSON.stringify(config)).not.toContain("secret");
  });
});
