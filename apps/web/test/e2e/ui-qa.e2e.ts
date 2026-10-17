/**
 * Full UI QA sweep for apps/web.
 *
 * Visits every screen in both viewports and themes, signed out and signed in,
 * drives every interactive element, and records:
 *   - console errors/warnings (including hydration mismatches)
 *   - uncaught page errors
 *   - failed requests and unexpected 4xx/5xx from `/api/*`
 *   - whether the design system CSS actually applied (colors, fonts, spacing)
 *   - horizontal overflow
 *
 * It also saves a full-page screenshot per (page × viewport × theme × auth
 * state) so the before/after can be compared by eye.
 *
 * Not part of `bun run ci` — it needs a running dev server and a seeded demo
 * account for the "Try the demo (for judges)" step.
 *
 *   bunx playwright install chromium          # first run only
 *   bun run dev                               # in another terminal
 *   QA_PHASE=before bun apps/web/test/e2e/ui-qa.e2e.ts
 *   QA_PHASE=after  bun apps/web/test/e2e/ui-qa.e2e.ts
 *
 * Env:
 *   E2E_BASE_URL  default http://localhost:3000
 *   QA_PHASE      "before" | "after" — picks the screenshot folder
 *   QA_OUT_ROOT   default /private/tmp/claude-501/-Users-huanngdev/82ba82b4-fc25-46ec-bbdb-88bb74f441af/scratchpad/ui-qa
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright";

const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:3100";
const phase = process.env.QA_PHASE === "after" ? "after" : "before";
const outRoot =
  process.env.QA_OUT_ROOT ??
  "/private/tmp/claude-501/-Users-huanngdev/82ba82b4-fc25-46ec-bbdb-88bb74f441af/scratchpad/ui-qa";
const screenshotDir = join(outRoot, phase);
const password = "Kitty-QA-pass-123";
const runId = `${Date.now().toString(36)}`;

type ViewportName = "desktop" | "mobile";
type ThemeName = "light" | "dark";
type AuthState = "signed-out" | "signed-in";

interface Issue {
  kind: string;
  page: string;
  viewport: ViewportName;
  theme: ThemeName;
  state: AuthState;
  step: string;
  symptom: string;
  evidence: string;
}

const viewports: Record<ViewportName, { width: number; height: number }> = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
};

/** Dev-server noise that is never a product regression. */
const ignoredConsole = [
  /Download the React DevTools/i,
  /\[HMR\]/i,
  /\[Fast Refresh\]/i,
  /\[React Query Devtools\]/i,
  /favicon/i,
];

const issues: Issue[] = [];
const rawConsole: string[] = [];
const notes: string[] = [];
/** Window during which a deliberately failing request may log a browser error. */
let expectedHttpErrorUntil = 0;

function expectHttpError(windowMs = 10_000): void {
  expectedHttpErrorUntil = Date.now() + windowMs;
}

const stepContext = {
  page: "start",
  viewport: "desktop" as ViewportName,
  theme: "light" as ThemeName,
  state: "signed-out" as AuthState,
  step: "boot",
};

function recordIssue(kind: string, symptom: string, evidence: string[]): void {
  issues.push({
    kind,
    page: stepContext.page,
    viewport: stepContext.viewport,
    theme: stepContext.theme,
    state: stepContext.state,
    step: stepContext.step,
    symptom,
    evidence: evidence.join(" | "),
  });
}

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.evaluate(() => document.fonts.ready).catch(() => undefined);
  // Effects (tooltips, theme class, query state) land after paint.
  await page.waitForTimeout(350);
}

/** Reads the computed color and converts it to RGB through a 1×1 canvas. */
async function readColors(page: Page): Promise<{
  bodyBg: string;
  bodyColor: string;
  bodyFont: string;
  darkClass: boolean;
  bgRgb: [number, number, number] | null;
}> {
  return page.evaluate(() => {
    const body = getComputedStyle(document.body);
    const toRgb = (value: string): [number, number, number] | null => {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const ctx = canvas.getContext("2d");
      if (ctx === null) return null;
      ctx.fillStyle = value;
      ctx.fillRect(0, 0, 1, 1);
      const data = ctx.getImageData(0, 0, 1, 1).data;
      return [data[0] ?? 0, data[1] ?? 0, data[2] ?? 0];
    };

    return {
      bodyBg: body.backgroundColor,
      bodyColor: body.color,
      bodyFont: body.fontFamily,
      darkClass: document.documentElement.classList.contains("dark"),
      bgRgb: toRgb(body.backgroundColor),
    };
  });
}

/** Design-system smoke check: if these fail, Tailwind/theme CSS is not applied. */
async function checkCssApplied(page: Page, theme: ThemeName): Promise<void> {
  const colors = await readColors(page);
  const rgb = colors.bgRgb;
  const luminance = rgb === null ? null : (rgb[0] + rgb[1] + rgb[2]) / 3;

  if (colors.bodyBg === "rgba(0, 0, 0, 0)" || colors.bodyBg === "transparent") {
    recordIssue("css", "body has a transparent background (globals.css not applied)", [
      `background-color=${colors.bodyBg}`,
    ]);
  }

  if (luminance === null) {
    recordIssue("css", "could not resolve the body background colour", [colors.bodyBg]);
  } else if (theme === "dark" && luminance > 110) {
    recordIssue("css", "dark theme did not darken the page", [
      `body background=${colors.bodyBg} (luminance ${Math.round(luminance)})`,
      `html.dark=${String(colors.darkClass)}`,
    ]);
  } else if (theme === "light" && luminance < 140) {
    recordIssue("css", "light theme page is unexpectedly dark", [
      `body background=${colors.bodyBg} (luminance ${Math.round(luminance)})`,
      `html.dark=${String(colors.darkClass)}`,
    ]);
  }

  if (theme === "dark" && !colors.darkClass) {
    recordIssue("css", "html element is missing the `dark` class in dark mode", [
      `body background=${colors.bodyBg}`,
    ]);
  }

  if (!/Inter/i.test(colors.bodyFont)) {
    recordIssue("css", "brand font (Inter) is not applied to the body", [
      `font-family=${colors.bodyFont}`,
    ]);
  }

  const primitives = await page.evaluate(() => {
    const button = document.querySelector<HTMLElement>('[data-slot="button"]');
    const card = document.querySelector<HTMLElement>('[data-slot="card"]');
    const buttonStyle = button === null ? null : getComputedStyle(button);
    const cardStyle = card === null ? null : getComputedStyle(card);
    return {
      button:
        buttonStyle === null
          ? null
          : {
              padding: buttonStyle.padding,
              borderRadius: buttonStyle.borderRadius,
              fontSize: buttonStyle.fontSize,
            },
      card:
        cardStyle === null
          ? null
          : { borderRadius: cardStyle.borderRadius, boxShadow: cardStyle.boxShadow },
    };
  });

  if (primitives.button === null) {
    recordIssue("css", "no button primitive rendered on the page", [
      "querySelector [data-slot=button]",
    ]);
  } else {
    if (primitives.button.padding === "0px") {
      recordIssue("css", "button has no padding (buttonVariants not applied)", [
        `padding=${primitives.button.padding}`,
      ]);
    }
    if (primitives.button.borderRadius === "0px") {
      recordIssue("css", "button has no border radius (buttonVariants not applied)", [
        `border-radius=${primitives.button.borderRadius}`,
      ]);
    }
  }

  if (primitives.card !== null && primitives.card.boxShadow === "none") {
    recordIssue("css", "card has no ring/shadow (card styles not applied)", [
      `box-shadow=${primitives.card.boxShadow}`,
    ]);
  }

  const overflow = await page.evaluate(() => {
    const clientWidth = document.documentElement.clientWidth;
    let worst: { tag: string; right: number } | null = null;

    for (const element of document.querySelectorAll<HTMLElement>("body *")) {
      // Dev-only overlays (Next.js indicator, React Query devtools) paint
      // outside the layout and are not product regressions.
      if (element.closest("nextjs-portal, .tsqd-parent-container") !== null) continue;
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (rect.right > clientWidth + 1 && (worst === null || rect.right > worst.right)) {
        worst = { tag: element.tagName.toLowerCase(), right: Math.round(rect.right) };
      }
    }

    return { clientWidth, scrollWidth: document.documentElement.scrollWidth, worst };
  });

  if (overflow.worst !== null) {
    recordIssue("layout", "page overflows horizontally", [
      `clientWidth=${overflow.clientWidth} scrollWidth=${overflow.scrollWidth} widest=<${overflow.worst.tag}> right=${overflow.worst.right}`,
    ]);
  }

  const notFound = await page.evaluate(() =>
    document.body.innerText.includes("This page could not be found"),
  );
  if (notFound) {
    recordIssue("routing", "page rendered the Next.js 404 screen", [page.url()]);
  }
}

function attachCollectors(page: Page): void {
  page.on("console", (message) => {
    const text = message.text();
    const line = `[${stepContext.viewport}/${stepContext.theme}/${stepContext.page}/${stepContext.step}] ${message.type()}: ${text}`;
    rawConsole.push(line);

    if (message.type() !== "error" && message.type() !== "warning") return;
    if (ignoredConsole.some((pattern) => pattern.test(text))) return;
    if (/Failed to load resource/i.test(text) && Date.now() < expectedHttpErrorUntil) return;

    const hydration = /hydrat|server rendered HTML didn't match|did not match/i.test(text);
    recordIssue(
      hydration ? "hydration" : `console-${message.type()}`,
      text.split("\n")[0] ?? text,
      [text.slice(0, 500)],
    );
  });

  page.on("pageerror", (error) => {
    rawConsole.push(`[pageerror] ${String(error)}`);
    recordIssue("page-error", String(error).split("\n")[0] ?? String(error), [
      String(error.stack ?? error).slice(0, 600),
    ]);
  });

  page.on("requestfailed", (request) => {
    const failure = request.failure()?.errorText ?? "unknown";
    rawConsole.push(`[requestfailed] ${request.method()} ${request.url()} — ${failure}`);
    // Navigations aborted on purpose (e.g. redirects) surface as aborted.
    if (/ERR_ABORTED/.test(failure)) return;
    recordIssue("network", "request failed", [`${request.method()} ${request.url()} — ${failure}`]);
  });

  page.on("response", (response) => {
    const status = response.status();
    if (status < 400) return;
    const url = response.url();
    rawConsole.push(`[http ${status}] ${response.request().method()} ${url}`);

    if (url.includes("/api/auth/sign-in/email") && status === 401) {
      notes.push(`${stepContext.step}: expected 401 on /api/auth/sign-in/email`);
      return;
    }
    if (url.includes("/api/demo-sign-in") && (status === 503 || status === 404)) {
      notes.push(`${stepContext.step}: demo login answered ${status} (DEMO_USER_PASSWORD not set)`);
      return;
    }
    if (!url.includes("/api/")) return;

    recordIssue("api", `API answered ${status}`, [
      `${response.request().method()} ${new URL(url).pathname} → ${status}`,
    ]);
  });
}

async function openPage(
  browser: Browser,
  viewport: ViewportName,
  theme: ThemeName,
  state: AuthState,
): Promise<Page> {
  const context = await browser.newContext({
    viewport: viewports[viewport],
    colorScheme: theme,
    deviceScaleFactor: 1,
    isMobile: viewport === "mobile",
    hasTouch: viewport === "mobile",
  });

  await context.addInitScript((value) => {
    try {
      window.localStorage.setItem("theme", value);
    } catch {
      // about:blank has no storage; the next navigation retries.
    }
  }, theme);

  stepContext.viewport = viewport;
  stepContext.theme = theme;
  stepContext.state = state;

  const page = await context.newPage();
  attachCollectors(page);
  return page;
}

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({
    path: join(
      screenshotDir,
      `${name}-${stepContext.viewport}-${stepContext.theme}-${stepContext.state}.png`,
    ),
    fullPage: true,
    animations: "disabled",
  });
}

async function visit(page: Page, path: string, label: string, takeShot = true): Promise<void> {
  stepContext.page = label;
  stepContext.step = `visit ${path}`;
  try {
    await page.goto(`${baseUrl}${path}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  } catch (error) {
    recordIssue("navigation", `could not load ${path}`, [String(error).slice(0, 400)]);
    return;
  }
  await settle(page);
  await checkCssApplied(page, stepContext.theme);
  if (takeShot) {
    await shot(page, label);
  }
}

async function waitForPath(page: Page, path: string, step: string): Promise<boolean> {
  stepContext.step = step;
  try {
    await page.waitForURL((url) => new URL(url).pathname === path, { timeout: 15_000 });
    await settle(page);
    return true;
  } catch {
    recordIssue("navigation", `expected to land on ${path}`, [
      `actual path=${new URL(page.url()).pathname}`,
    ]);
    return false;
  }
}

async function alertTexts(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('[role="alert"]')]
      .map((node) => (node.textContent ?? "").trim())
      .filter((text) => text.length > 0),
  );
}

async function expectAlert(page: Page, expected: RegExp, step: string): Promise<void> {
  stepContext.step = step;
  const alerts: string[] = [];
  const deadline = Date.now() + 10_000;

  while (Date.now() < deadline) {
    alerts.push(...(await alertTexts(page)));
    if (alerts.some((text) => expected.test(text))) return;
    await page.waitForTimeout(250);
  }

  recordIssue("ux", `missing expected message ${expected}`, [
    alerts.length === 0 ? "no [role=alert] elements" : alerts.join(" / ").slice(0, 500),
  ]);
}

/** Signed-out screens + auth interactions. Ends signed in (fresh account). */
async function signedOutFlow(page: Page): Promise<{ email: string } | null> {
  // Landing
  await visit(page, "/", "home");
  const apiBadge = await page.locator("text=API online").count();
  if (apiBadge === 0) {
    recordIssue("ux", "landing API status badge never reports online", [
      (await page.locator("main").innerText()).slice(0, 300),
    ]);
  }

  // Landing → sign in. `LinkButton` renders a button role, not a link role.
  stepContext.page = "home";
  stepContext.step = "landing: sign in link";
  await page
    .getByRole("button", { name: "Sign in", exact: true })
    .click()
    .catch((error: unknown) =>
      recordIssue("ux", "could not click the landing Sign in link", [String(error).slice(0, 300)]),
    );
  await waitForPath(page, "/sign-in", "landing: sign in link → /sign-in");

  // Auth shell logo → home ("back" affordance on the auth screens).
  stepContext.page = "sign-in";
  stepContext.step = "auth shell: logo link";
  await page
    .locator('a[href="/"]')
    .first()
    .click()
    .catch((error: unknown) =>
      recordIssue("ux", "could not click the auth-shell logo link", [String(error).slice(0, 300)]),
    );
  await waitForPath(page, "/", "auth shell: logo → /");

  // Demo login from the landing page
  stepContext.page = "home";
  stepContext.step = "landing: demo sign in";
  const demoButton = page.getByRole("button", { name: /demo/i }).first();
  if ((await demoButton.count()) > 0) {
    const label = (await demoButton.innerText()).trim();
    if (label !== "Try the demo (for judges)") {
      recordIssue("ux", "demo button is easy to mistake for the email login", [
        `label="${label}" (expected "Try the demo (for judges)")`,
      ]);
    }

    // It must not look like the primary email login either.
    const demoStyle = await demoButton.evaluate((element) => {
      const style = getComputedStyle(element);
      return { background: style.backgroundColor, border: style.borderColor };
    });
    const signInStyle = await page
      .getByRole("button", { name: "Sign in", exact: true })
      .evaluate((element) => {
        const style = getComputedStyle(element);
        return { background: style.backgroundColor, border: style.borderColor };
      });
    if (demoStyle.background === signInStyle.background) {
      recordIssue("ux", "demo button is not visually distinct from the email login", [
        `both backgrounds=${demoStyle.background}`,
      ]);
    }

    expectHttpError();
    await demoButton.click();
    await page.waitForTimeout(2_500);
    const path = new URL(page.url()).pathname;
    if (path === "/events") {
      notes.push("demo sign-in from landing succeeded");
      await page.context().clearCookies();
    } else {
      const alerts = await alertTexts(page);
      notes.push(`demo sign-in from landing ended on ${path}; alerts: ${alerts.join(" / ")}`);
      if (alerts.length === 0) {
        recordIssue("ux", "demo sign in failed silently (no error message)", [path]);
      }
      await shot(page, "home-demo-sign-in");
    }
  } else {
    recordIssue("ux", "demo sign-in button is hidden while the demo endpoint reports enabled", [
      "GET /api/demo-sign-in/status → enabled",
    ]);
  }

  // Sign-in screen
  await visit(page, "/sign-in", "sign-in");

  stepContext.page = "sign-in";
  stepContext.step = "sign-in: fresh browser shows the email form";
  const emailField = page.locator("#email");
  if ((await emailField.count()) === 0 || !(await emailField.isVisible())) {
    recordIssue("auth", "fresh /sign-in does not show the email field", [page.url()]);
  } else if ((await emailField.inputValue()) !== "") {
    recordIssue("auth", "/sign-in prefilled the email field", [await emailField.inputValue()]);
  }

  stepContext.page = "sign-in";
  stepContext.step = "sign-in: empty submit validation";
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await waitForTimeout(page, 400);
  await expectAlert(page, /Enter your email/i, "sign-in: empty email error");
  await expectAlert(page, /Enter your password/i, "sign-in: empty password error");
  await shot(page, "sign-in-validation-empty");

  stepContext.page = "sign-in";
  stepContext.step = "sign-in: invalid email validation";
  await page.getByLabel("Email").fill("not-an-email");
  await page.getByLabel("Password").fill("whatever");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await waitForTimeout(page, 400);
  await expectAlert(page, /Enter a valid email address/i, "sign-in: invalid email error");

  stepContext.page = "sign-in";
  stepContext.step = "sign-in: wrong password";
  await page.getByLabel("Email").fill(`qa-wrong-${runId}@kitty.test`);
  await page.getByLabel("Password").fill("definitely-not-the-password");
  expectHttpError();
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expectAlert(page, /invalid|incorrect|not found|password/i, "sign-in: wrong password error");
  await shot(page, "sign-in-wrong-password");

  stepContext.page = "sign-in";
  stepContext.step = "sign-in: create account link";
  await page
    .getByRole("link", { name: "Create an account" })
    .click()
    .catch((error: unknown) =>
      recordIssue("ux", "could not click the sign-in Create an account link", [
        String(error).slice(0, 300),
      ]),
    );
  await waitForPath(page, "/sign-up", "sign-in: create account link → /sign-up");

  // Sign-up validation + fresh account
  await visit(page, "/sign-up", "sign-up");
  stepContext.page = "sign-up";
  stepContext.step = "sign-up: sign in link";
  await page
    .getByRole("link", { name: "Sign in", exact: true })
    .click()
    .catch((error: unknown) =>
      recordIssue("ux", "could not click the sign-up Sign in link", [String(error).slice(0, 300)]),
    );
  await waitForPath(page, "/sign-in", "sign-up: sign in link → /sign-in");
  await visit(page, "/sign-up", "sign-up", false);

  stepContext.page = "sign-up";
  stepContext.step = "sign-up: empty submit validation";
  await page.getByRole("button", { name: "Create account" }).click();
  await waitForTimeout(page, 400);
  await expectAlert(page, /Enter your name/i, "sign-up: empty name error");
  await expectAlert(page, /Enter your email/i, "sign-up: empty email error");
  await expectAlert(page, /Use at least 8 characters/i, "sign-up: empty password error");
  await shot(page, "sign-up-validation-empty");

  stepContext.page = "sign-up";
  stepContext.step = "sign-up: invalid email + short password";
  await page.getByLabel("Name").fill("Q");
  await page.getByLabel("Email").fill("nope@");
  await page.getByLabel("Password").fill("short");
  await page.getByRole("button", { name: "Create account" }).click();
  await waitForTimeout(page, 400);
  await expectAlert(page, /Enter your name/i, "sign-up: short name error");
  await expectAlert(page, /Enter a valid email address/i, "sign-up: invalid email error");
  await expectAlert(page, /Use at least 8 characters/i, "sign-up: short password error");
  await shot(page, "sign-up-validation-invalid");

  const email = `qa-${viewportSlug()}-${stepContext.theme}-${runId}@kitty.test`;
  stepContext.page = "sign-up";
  stepContext.step = "sign-up: create fresh account";
  await page.getByLabel("Name").fill(`QA ${viewportSlug()} ${stepContext.theme}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();

  const signedIn = await waitForPath(page, "/events", "sign-up: created account → /events");
  if (!signedIn) {
    return null;
  }

  return { email };
}

function viewportSlug(): string {
  return stepContext.viewport;
}

function waitForTimeout(page: Page, ms: number): Promise<void> {
  return page.waitForTimeout(ms);
}

/** Signed-in screens + every shell interaction, ends signed out. */
async function signedInFlow(page: Page): Promise<void> {
  // Every signed-in screen gets a screenshot.
  await visit(page, "/events", "events");

  // Sidebar interactions (desktop rail / mobile sheet).
  if (stepContext.viewport === "desktop") {
    stepContext.page = "events";
    stepContext.step = "sidebar: collapse";
    const sidebar = page.locator('[data-slot="sidebar"][data-state]').first();
    const before = await sidebar.getAttribute("data-state");
    await page.locator('[data-sidebar="trigger"]').click();
    await page.waitForTimeout(500);
    const after = await sidebar.getAttribute("data-state");
    if (before !== "expanded" || after !== "collapsed") {
      recordIssue("sidebar", "desktop sidebar did not collapse", [
        `data-state before=${before} after=${after}`,
      ]);
    }
    await shot(page, "events-sidebar-collapsed");

    stepContext.step = "sidebar: expand";
    await page.locator('[data-sidebar="trigger"]').click();
    await page.waitForTimeout(500);
    const restored = await sidebar.getAttribute("data-state");
    if (restored !== "expanded") {
      recordIssue("sidebar", "desktop sidebar did not expand again", [`data-state=${restored}`]);
    }
  } else {
    stepContext.page = "events";
    stepContext.step = "sidebar: open mobile sheet";
    await page.locator('[data-sidebar="trigger"]').click();
    await page.waitForTimeout(600);
    const sheet = page.locator('[role="dialog"][data-sidebar="sidebar"]');
    if ((await sheet.count()) === 0 || !(await sheet.first().isVisible())) {
      recordIssue("sidebar", "mobile sidebar sheet did not open", [
        "no visible [role=dialog][data-sidebar=sidebar]",
      ]);
    } else {
      await shot(page, "events-mobile-sheet-open");
    }
  }

  // Every sidebar link: enabled entries navigate, disabled entries explain why.
  stepContext.page = "events";
  stepContext.step = "sidebar: disabled entries + tooltip";
  const disabled = page.locator('[data-slot="sidebar"] button[aria-disabled="true"]');
  const disabledCount = await disabled.count();
  if (disabledCount < 8) {
    recordIssue("sidebar", "expected 8 disabled 'Coming soon' entries", [`found ${disabledCount}`]);
  }

  for (let index = 0; index < disabledCount; index += 1) {
    const item = disabled.nth(index);
    const label = ((await item.innerText()).trim() || `item ${index}`).split("\n")[0];
    await item.hover({ force: true });
    await page.waitForTimeout(700);
    const tooltip = page.locator('[data-slot="tooltip-content"]');
    const visible = (await tooltip.count()) > 0 && (await tooltip.first().isVisible());
    const text = visible ? (await tooltip.first().innerText()).trim() : "";
    if (!visible || !/Coming soon/i.test(text)) {
      recordIssue("sidebar", `no "Coming soon" tooltip for ${label}`, [
        `visible=${String(visible)} text=${text}`,
      ]);
    }
  }
  await shot(page, "events-sidebar-tooltip");

  if (stepContext.viewport === "mobile") {
    // Close the mobile sheet before navigating.
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
  }

  stepContext.page = "events";
  stepContext.step = "sidebar: enabled Events link";
  if (stepContext.viewport === "mobile") {
    await page.locator('[data-sidebar="trigger"]').click();
    await page.waitForTimeout(600);
  }
  const eventsLink = page.locator('[data-slot="sidebar"] a[href="/events"]').first();
  await eventsLink
    .click()
    .catch((error: unknown) =>
      recordIssue("sidebar", "could not click the Events sidebar link", [
        String(error).slice(0, 300),
      ]),
    );
  await waitForPath(page, "/events", "sidebar: Events link → /events");

  if (stepContext.viewport === "mobile") {
    stepContext.step = "sidebar: sheet closes after navigating";
    const sheet = page.locator('[role="dialog"][data-sidebar="sidebar"]');
    const stillOpen = (await sheet.count()) > 0 && (await sheet.first().isVisible());
    if (stillOpen) {
      recordIssue("sidebar", "mobile sidebar sheet stays open after navigating", [
        "nav item click does not close the sheet; the destination page stays aria-hidden",
      ]);
    }
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
  }

  // "Create your first event" CTA → /events/new → back link.
  stepContext.page = "events";
  stepContext.step = "events: create-first-event CTA";
  await page
    .getByRole("button", { name: /Create your first event/i })
    .click()
    .catch((error: unknown) =>
      recordIssue("ux", "could not click the Create your first event CTA", [
        String(error).slice(0, 300),
      ]),
    );
  await waitForPath(page, "/events/new", "events: CTA → /events/new");

  stepContext.page = "events-new";
  stepContext.step = "events/new: back link";
  await page
    .getByRole("button", { name: /Back to events/i })
    .click()
    .catch((error: unknown) =>
      recordIssue("ux", "could not click the Back to events link", [String(error).slice(0, 300)]),
    );
  await waitForPath(page, "/events", "events/new: back link → /events");

  // Remaining signed-in screens.
  await visit(page, "/events/new", "events-new");
  await visit(page, "/", "home");
  if (new URL(page.url()).pathname !== "/events") {
    recordIssue("routing", "signed-in landing did not redirect to /events", [
      `path=${new URL(page.url()).pathname}`,
    ]);
  }
  await visit(page, "/sign-in", "sign-in");
  await visit(page, "/sign-up", "sign-up");

  // Theme toggle.
  await visit(page, "/events", "events");
  stepContext.page = "events";
  stepContext.step = "theme toggle";
  const expectedClass = stepContext.theme === "dark" ? false : true;
  await page
    .getByRole("button", { name: "Switch to dark theme" })
    .click()
    .catch(async () => {
      await page
        .getByRole("button", { name: "Switch to light theme" })
        .click()
        .catch((error: unknown) => {
          recordIssue("theme", "theme toggle button not found", [String(error).slice(0, 300)]);
        });
    });
  await page.waitForTimeout(700);
  const hasDark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
  if (hasDark !== expectedClass) {
    recordIssue("theme", "theme toggle did not switch the theme", [
      `expected dark=${String(expectedClass)} actual=${String(hasDark)}`,
    ]);
  }
  await shot(page, "events-theme-toggled");

  // Toggling again must come back.
  await page
    .getByRole("button", { name: hasDark ? "Switch to light theme" : "Switch to dark theme" })
    .click()
    .catch((error: unknown) =>
      recordIssue("theme", "could not toggle the theme back", [String(error).slice(0, 300)]),
    );
  await page.waitForTimeout(700);
  const restoredDark = await page.evaluate(() =>
    document.documentElement.classList.contains("dark"),
  );
  if (restoredDark === hasDark) {
    recordIssue("theme", "theme toggle is stuck", [`dark=${String(restoredDark)}`]);
  }

  // User menu: identity + sign out.
  stepContext.page = "events";
  stepContext.step = "user menu: open";
  await page
    .getByRole("button", { name: "Open account menu" })
    .click()
    .catch((error: unknown) =>
      recordIssue("ux", "could not open the account menu", [String(error).slice(0, 300)]),
    );
  await page.waitForTimeout(600);
  const menuText = await page
    .locator('[data-slot="dropdown-menu-content"]')
    .innerText()
    .catch(() => "");
  if (!/@kitty\.test/.test(menuText)) {
    recordIssue("ux", "account menu does not show the signed-in email", [menuText.slice(0, 300)]);
  }
  await shot(page, "events-user-menu");

  stepContext.step = "user menu: sign out";
  await page
    .getByRole("menuitem", { name: /Sign out/i })
    .click()
    .catch((error: unknown) =>
      recordIssue("ux", "could not click Sign out", [String(error).slice(0, 300)]),
    );
  await waitForPath(page, "/sign-in", "user menu: sign out → /sign-in");

  // Signed-out guard: product pages must bounce to sign-in.
  stepContext.page = "events";
  stepContext.step = "guard: /events signed out";
  await page.goto(`${baseUrl}/events`, { waitUntil: "domcontentloaded" });
  await waitForPath(page, "/sign-in", "guard: /events redirects to /sign-in");
}

async function signInFlow(page: Page, email: string): Promise<void> {
  await visit(page, "/sign-in", "sign-in");

  stepContext.page = "sign-in";
  stepContext.step = "sign-in: wrong password for real account";
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("wrong-password-123");
  expectHttpError();
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expectAlert(page, /invalid|incorrect|password/i, "sign-in: wrong password error");
  await shot(page, "sign-in-wrong-password-real-account");

  stepContext.step = "sign-in: correct password";
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  const ok = await waitForPath(page, "/events", "sign-in: correct password → /events");
  if (!ok) {
    recordIssue("auth", "could not sign in with the account just created", [email]);
  }
}

/**
 * The owner's report: "I click login and it lets me straight in, no email
 * asked". A stale `better-auth.session_token` used to make `/sign-in` and
 * `/events` redirect to each other forever. These cases prove the cookie alone
 * never counts as a session.
 */
async function staleCookieFlow(
  browser: Browser,
  viewport: ViewportName,
  theme: ThemeName,
): Promise<void> {
  const page = await openPage(browser, viewport, theme, "signed-out");
  const staleCookie = {
    name: "better-auth.session_token",
    value: "stale.invalidsignature",
    domain: "localhost",
    path: "/",
    httpOnly: true,
    sameSite: "Lax" as const,
  };

  for (const path of ["/sign-in", "/sign-up"] as const) {
    await page.context().addCookies([staleCookie]);
    await visit(page, path, `stale-cookie${path}`);

    const current = new URL(page.url()).pathname;
    if (current !== path) {
      recordIssue("auth", `stale cookie bounced ${path} away`, [`landed on ${current}`]);
    }

    const emailInput = page.locator("#email");
    if ((await emailInput.count()) === 0 || !(await emailInput.isVisible())) {
      recordIssue("auth", `stale cookie hid the form on ${path}`, [page.url()]);
    }

    const cookies = await page.context().cookies();
    if (cookies.some((cookie) => cookie.name === staleCookie.name)) {
      recordIssue("auth", "stale session cookie was not cleared", [`after ${path}`]);
    }
  }

  await page.context().addCookies([staleCookie]);
  await visit(page, "/events", "stale-cookie-events");

  if (new URL(page.url()).pathname !== "/sign-in") {
    recordIssue("auth", "stale cookie granted access to /events", [page.url()]);
  }

  await page.context().close();
}

async function runCombo(browser: Browser, viewport: ViewportName, theme: ThemeName): Promise<void> {
  await staleCookieFlow(browser, viewport, theme);

  // ---- signed out ----
  const page = await openPage(browser, viewport, theme, "signed-out");

  await visit(page, "/settings/ai", "settings-ai-guard");
  const guarded = new URL(page.url()).pathname;
  if (guarded !== "/sign-in") {
    recordIssue("routing", "signed-out /settings/ai is not guarded", [`path=${guarded}`]);
  }

  await visit(page, "/", "home");
  await visit(page, "/sign-in", "sign-in");
  await visit(page, "/sign-up", "sign-up");
  await visit(page, "/events", "events");
  if (new URL(page.url()).pathname !== "/sign-in") {
    recordIssue("routing", "signed-out /events is not guarded", [
      `path=${new URL(page.url()).pathname}`,
    ]);
  }
  await visit(page, "/events/new", "events-new");
  if (new URL(page.url()).pathname !== "/sign-in") {
    recordIssue("routing", "signed-out /events/new is not guarded", [
      `path=${new URL(page.url()).pathname}`,
    ]);
  }

  const account = await signedOutFlow(page);

  if (account === null) {
    await page.context().close();
    return;
  }

  // ---- signed in ----
  stepContext.state = "signed-in";
  await signedInFlow(page);
  await signInFlow(page, account.email);

  await page.context().close();
}

await mkdir(screenshotDir, { recursive: true });

const browser = await chromium.launch();
const startedAt = Date.now();

for (const viewport of ["desktop", "mobile"] as ViewportName[]) {
  for (const theme of ["light", "dark"] as ThemeName[]) {
    console.log(`\n▶ ${viewport} · ${theme}`);
    await runCombo(browser, viewport, theme);
    console.log(`  issues so far: ${issues.length}`);
  }
}

await browser.close();

await writeFile(join(outRoot, `${phase}-issues.json`), JSON.stringify({ issues, notes }, null, 2));
await writeFile(join(outRoot, `${phase}-console.log`), rawConsole.join("\n"));

// Console table for the markdown report.
console.log(`\n${issues.length} issue(s) in ${Math.round((Date.now() - startedAt) / 1000)}s`);
for (const issue of issues) {
  console.log(
    `- [${issue.kind}] ${issue.page} · ${issue.viewport}/${issue.theme}/${issue.state} · ${issue.step}: ${issue.symptom}\n    ${issue.evidence}`,
  );
}
console.log(`\nNotes:\n${[...new Set(notes)].map((note) => `- ${note}`).join("\n")}`);
console.log(`\nScreenshots: ${screenshotDir}`);

if (phase === "after" && issues.length > 0) {
  process.exit(1);
}
