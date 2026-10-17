/**
 * Auth end-to-end test (docs/18.4) — NOT part of `bun run ci`.
 *
 * Drives a real browser against a local dev stack on spare ports:
 *
 *   # terminal 1 — API
 *   cd apps/api && PORT=8887 WEB_ORIGIN=http://localhost:3100 \
 *     BETTER_AUTH_URL=http://localhost:3100 bun run dev
 *   # terminal 2 — web
 *   cd apps/web && bun run dev --port 3100   # API_URL=http://localhost:8887
 *   # terminal 3
 *   bun apps/web/test/e2e/auth.e2e.ts
 *
 * Env: E2E_BASE_URL (default http://localhost:3100), E2E_API_URL
 * (default http://localhost:8887) for the dev-only email capture endpoint.
 *
 * Covers: sign-up → verify → sign-out → wrong password → sign-in → change
 * password → sign out other devices → forgot/reset → open-redirect attempts →
 * provider buttons per /api/auth-config, and fails on any console error.
 */
import { chromium, type BrowserContext, type Page } from "playwright";

const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:3100";
const apiUrl = process.env.E2E_API_URL ?? "http://localhost:8887";
const runId = Date.now().toString(36);
const email = `e2e-${runId}@kitty.test`;
const password = "Kitty-E2E-pass-1";
const changedPassword = "Kitty-E2E-pass-2";
const resetPassword = "Kitty-E2E-pass-3";

const ignoredConsole = [
  /favicon/i,
  /\[Fast Refresh\]/i,
  /Download the React DevTools/i,
  /\[React Query Devtools\]/i,
  // Deliberate negative tests (wrong password, rate limit) make the browser log
  // the 4xx response itself; the UI assertion is what matters.
  /Failed to load resource: the server responded with a status of (401|429)/i,
];

const consoleErrors: string[] = [];
let stepNumber = 0;

function step(name: string, detail = ""): void {
  stepNumber += 1;
  console.log(`${stepNumber}. ${name}${detail.length === 0 ? "" : ` — ${detail}`}`);
}

function attachConsoleCollector(page: Page): void {
  page.on("console", (message) => {
    if (message.type() !== "error" && message.type() !== "warning") return;
    const text = message.text();
    if (ignoredConsole.some((pattern) => pattern.test(text))) return;
    consoleErrors.push(`${message.type()}: ${text.split("\n")[0]}`);
  });
  page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${String(error)}`));
}

async function expectVisible(page: Page, text: string | RegExp): Promise<void> {
  await page.getByText(text).first().waitFor({ state: "visible", timeout: 15_000 });
}

interface CapturedEmail {
  to: string;
  subject: string;
  text: string;
}

async function lastEmailFor(address: string): Promise<CapturedEmail> {
  const response = await fetch(`${apiUrl}/api/dev/last-email?to=${encodeURIComponent(address)}`);
  const payload = (await response.json()) as { email: CapturedEmail | null };

  if (payload.email === null) {
    throw new Error(`no captured email for ${address} (is NODE_ENV=development?)`);
  }

  return payload.email;
}

async function linkTokenFor(address: string, subject: string): Promise<string> {
  const email = await lastEmailFor(address);
  const match = /token=([^&\s]+)/.exec(email.text);

  if (email.subject !== subject || match?.[1] === undefined) {
    throw new Error(`unexpected email "${email.subject}" with text ${email.text}`);
  }

  return decodeURIComponent(match[1]);
}

async function attemptSignIn(page: Page, address: string, secret: string): Promise<string | null> {
  await page.getByLabel("Email").fill(address);
  await page.getByLabel("Password", { exact: true }).fill(secret);

  await Promise.all([
    page
      .waitForResponse((candidate) => candidate.url().includes("/api/auth/sign-in/email"), {
        timeout: 20_000,
      })
      .catch(() => null),
    page.getByRole("button", { name: "Sign in", exact: true }).click(),
  ]);

  try {
    await page.waitForURL(/\/events/, { timeout: 20_000 });
    return null;
  } catch {
    const alerts = await page.locator('[data-slot="alert"]').allInnerTexts();
    return alerts.join("\n");
  }
}

async function signIn(page: Page, address: string, secret: string): Promise<void> {
  await page.goto(`${baseUrl}/sign-in`, { waitUntil: "networkidle" });

  let failure = await attemptSignIn(page, address, secret);

  // Sign-in is rate limited to 5/minute per IP. Earlier steps (and a previous
  // run of this script) may have used the budget; wait it out once.
  if (failure !== null && /Too many attempts/.test(failure)) {
    const seconds = Number(/in (\d+) second/.exec(failure)?.[1] ?? "60");
    step(`rate limited, waiting ${seconds + 2}s before retrying`);
    await page.waitForTimeout((seconds + 2) * 1_000);
    await page.goto(`${baseUrl}/sign-in`, { waitUntil: "networkidle" });
    failure = await attemptSignIn(page, address, secret);
  }

  if (failure !== null) {
    throw new Error(`sign-in landed on ${page.url()} — alerts: ${JSON.stringify(failure)}`);
  }
}

async function signOut(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Open account menu" }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await page.waitForURL(/\/sign-in/, { timeout: 20_000 });
}

async function main(): Promise<void> {
  // Local runs share one client IP, so clear the persisted counters first.
  await fetch(`${apiUrl}/api/dev/rate-limit/clear`, { method: "POST" }).catch(() => null);

  const browser = await chromium.launch();
  const context: BrowserContext = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();
  attachConsoleCollector(page);

  // 1. Public screens + provider buttons match /api/auth-config.
  const config = (await (await fetch(`${baseUrl}/api/auth-config`)).json()) as {
    providers: string[];
    emailVerification: boolean;
    passwordReset: boolean;
  };

  for (const path of ["/sign-in", "/sign-up", "/forgot-password"]) {
    await page.goto(`${baseUrl}${path}`, { waitUntil: "networkidle" });
    step(`loaded ${path}`);
  }

  await page.goto(`${baseUrl}/sign-in`, { waitUntil: "networkidle" });
  for (const provider of ["GitHub", "PayPal"]) {
    const shown = await page.getByRole("button", { name: `Continue with ${provider}` }).count();
    const expected = config.providers.includes(provider.toLowerCase()) ? 1 : 0;

    if (shown !== expected) {
      throw new Error(`${provider} button shown ${shown}x but config says ${expected}`);
    }
  }
  step("provider buttons match /api/auth-config", JSON.stringify(config.providers));

  const forgotLink = await page.getByRole("link", { name: "Forgot password?" }).count();
  const expectedForgotLink = config.passwordReset ? 1 : 0;

  if (forgotLink !== expectedForgotLink) {
    throw new Error(
      `Forgot password? shown ${forgotLink}x but /api/auth-config says passwordReset=${config.passwordReset}`,
    );
  }
  step("forgot-password entry point matches /api/auth-config", String(config.passwordReset));

  // 2. Sign up.
  await page.goto(`${baseUrl}/sign-up`, { waitUntil: "networkidle" });
  await page.getByLabel("Name").fill("E2E User");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/events|\/verify-email/, { timeout: 20_000 });
  step("sign-up", page.url().replace(baseUrl, ""));

  // 3. Verify the email from the dev-only capture endpoint.
  const verifyToken = await linkTokenFor(email, "Verify your Kitty email");
  await page.goto(`${baseUrl}/verify-email?token=${encodeURIComponent(verifyToken)}`, {
    waitUntil: "networkidle",
  });
  await expectVisible(page, /Email verified|invalid or expired/);
  step("verification link consumed");

  // 4. Sign out, then a wrong password must show a friendly error.
  if (!page.url().includes("/events")) {
    await page.goto(`${baseUrl}/events`, { waitUntil: "networkidle" });
  }
  await signOut(page);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("definitely-wrong");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expectVisible(page, /incorrect|Too many attempts/);
  step("wrong password shows a friendly error");

  // 5. Sign in for real.
  await signIn(page, email, password);
  if (!page.url().includes("/events")) {
    throw new Error(`expected /events after sign-in, got ${page.url()}`);
  }
  step("signed in");

  // 6. Settings → Account: change password, then sign out other devices.
  await page.goto(`${baseUrl}/settings/account`, { waitUntil: "networkidle" });
  await page.locator("#current-password").fill(password);
  await page.locator("#new-password").fill(changedPassword);
  await page.locator("#confirm-new-password").fill(changedPassword);
  await page.getByRole("button", { name: "Update password" }).click();
  await expectVisible(page, /Password updated/);
  step("password changed");

  await page.getByRole("button", { name: "Sign out of all other devices" }).click();
  await expectVisible(page, /Signed out of all other devices/);
  step("other devices signed out");

  // 7. Forgot + reset password.
  await signOut(page);
  await page.goto(`${baseUrl}/forgot-password`, { waitUntil: "networkidle" });
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expectVisible(page, /Check your inbox/);
  step("reset link requested");

  const resetToken = await linkTokenFor(email, "Reset your Kitty password");
  await page.goto(`${baseUrl}/reset-password?token=${encodeURIComponent(resetToken)}`, {
    waitUntil: "networkidle",
  });
  await page.locator("#newPassword").fill(resetPassword);
  await page.locator("#confirmPassword").fill(resetPassword);
  await page.getByRole("button", { name: "Set new password" }).click();
  await expectVisible(page, /Password updated/);
  step("password reset");

  // 8. An open-redirect attempt must land on /events, never off-site.
  await page.goto(`${baseUrl}/sign-in?next=%2F%2Fevil.example`, { waitUntil: "networkidle" });
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(resetPassword);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(/\/events/, { timeout: 20_000 });
  if (new URL(page.url()).origin !== new URL(baseUrl).origin) {
    throw new Error(`open redirect escaped to ${page.url()}`);
  }
  step("open-redirect attempt landed on /events");

  // 9. Mobile viewport renders the sign-in screen without breaking.
  await page.setViewportSize({ width: 390, height: 844 });
  await signOut(page);
  await page.goto(`${baseUrl}/sign-in`, { waitUntil: "networkidle" });
  await expectVisible(page, /Welcome back/);
  step("390px sign-in renders");

  await browser.close();

  if (consoleErrors.length > 0) {
    console.error(`\n✗ ${consoleErrors.length} console error(s):`);
    for (const entry of consoleErrors) console.error(`    ${entry}`);
    process.exit(1);
  }

  console.log("\n✓ auth e2e passed — 0 console errors");
}

await main();
