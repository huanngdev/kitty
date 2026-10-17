/**
 * Console-error smoke check for Base UI `nativeButton` warnings.
 *
 * Base UI logs an error when a `render` prop swaps a button for a non-`<button>`
 * element while `nativeButton` is still true (CODE_RULES.md §C). This script
 * loads the public screens in a headless browser and fails if any console error
 * is emitted.
 *
 * Not part of `bun run ci` — it needs a running dev server.
 *
 *   bunx playwright install chromium   # first run only
 *   bun run dev                        # in another terminal
 *   bun run --filter web test:e2e
 *
 * Signed-in routes (`/events`, `/events/new`) can be checked too: create a
 * session, then pass its cookie via `E2E_SESSION_COOKIE` (and `E2E_PAGES`).
 */
import { chromium, type BrowserContext } from "playwright";

const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const paths = (process.env.E2E_PAGES ?? "/,/sign-in,/sign-up").split(",");
const sessionCookie = process.env.E2E_SESSION_COOKIE;

/** Dev-only noise that is never a product regression. */
const ignored = [/favicon/i, /\[Fast Refresh\]/i, /Download the React DevTools/i];

async function contextWithSession(): Promise<BrowserContext> {
  const context = await chromium.launch().then((browser) => browser.newContext());

  if (sessionCookie !== undefined && sessionCookie.length > 0) {
    await context.addCookies([
      {
        name: "better-auth.session_token",
        value: sessionCookie,
        domain: "localhost",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
  }

  return context;
}

async function checkPath(context: BrowserContext, path: string): Promise<string[]> {
  const page = await context.newPage();
  const errors: string[] = [];

  page.on("console", (message) => {
    if (message.type() !== "error" && message.type() !== "warning") {
      return;
    }
    const text = message.text();
    if (!ignored.some((pattern) => pattern.test(text))) {
      errors.push(`${message.type()}: ${text.split("\n")[0]}`);
    }
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${String(error)}`));

  await page.goto(`${baseUrl}${path}`, { waitUntil: "networkidle", timeout: 45_000 });
  // Base UI warnings fire in an effect, so give the page a moment to settle.
  await page.waitForTimeout(1_500);
  await page.close();

  return errors;
}

const context = await contextWithSession();
let failed = false;

for (const path of paths) {
  const errors = await checkPath(context, path);

  if (errors.length === 0) {
    console.log(`✓ ${path} — no console errors`);
    continue;
  }

  failed = true;
  console.error(`✗ ${path} — ${errors.length} console error(s)`);
  for (const error of errors) {
    console.error(`    ${error}`);
  }
}

await context.browser()?.close();

if (failed) {
  process.exit(1);
}
