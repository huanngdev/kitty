import { describe, expect, test } from "bun:test";
import { authConfigSchema } from "@kitty/shared/auth";
import { handleError } from "../../../src/app";
import { Hono } from "hono";
import { createAuthConfigRoutes } from "../../../src/modules/auth/auth-config.routes";

function buildApp(env: Parameters<typeof createAuthConfigRoutes>[0]) {
  return new Hono().onError(handleError).route("/api", createAuthConfigRoutes(env));
}

describe("GET /api/auth-config", () => {
  test("email + password only, verification off in development", async () => {
    const app = buildApp({ NODE_ENV: "development" });
    const response = await app.request("/api/auth-config");

    expect(response.status).toBe(200);
    expect(authConfigSchema.parse(await response.json())).toEqual({
      emailPassword: true,
      providers: [],
      demo: false,
      emailVerification: false,
      passwordReset: true,
    });
  });

  test("reports each provider only when it is configured", async () => {
    const github = await buildApp({
      NODE_ENV: "development",
      GITHUB_CLIENT_ID: "id",
      GITHUB_CLIENT_SECRET: "secret",
    }).request("/api/auth-config");
    expect(authConfigSchema.parse(await github.json()).providers).toEqual(["github"]);

    const paypal = await buildApp({
      NODE_ENV: "development",
      PAYPAL_LOGIN_CLIENT_ID: "id",
      PAYPAL_LOGIN_CLIENT_SECRET: "secret",
    }).request("/api/auth-config");
    expect(authConfigSchema.parse(await paypal.json()).providers).toEqual(["paypal"]);
  });

  test("reports reset off in production without a transactional mailer", async () => {
    const app = buildApp({ NODE_ENV: "production" });

    const response = await app.request("/api/auth-config");
    const config = authConfigSchema.parse(await response.json());

    expect(config.passwordReset).toBe(false);
    expect(config.emailVerification).toBe(false);
  });

  test("reports verification on in production with a real mailer", async () => {
    const app = buildApp({
      NODE_ENV: "production",
      RESEND_API_KEY: "key",
      MAIL_FROM: "Kitty <hi@kitty.test>",
    });

    const response = await app.request("/api/auth-config");
    expect(authConfigSchema.parse(await response.json()).emailVerification).toBe(true);
  });

  test("never exposes a secret", async () => {
    const app = buildApp({
      NODE_ENV: "development",
      GITHUB_CLIENT_ID: "gh-id",
      GITHUB_CLIENT_SECRET: "gh-secret-value",
      PAYPAL_LOGIN_CLIENT_ID: "pp-id",
      PAYPAL_LOGIN_CLIENT_SECRET: "pp-secret-value",
    });

    const body = await (await app.request("/api/auth-config")).text();

    expect(body).not.toContain("gh-secret-value");
    expect(body).not.toContain("pp-secret-value");
  });
});
