#!/usr/bin/env bun
/**
 * Enforces AGENTS.md invariant #1: only `apps/gateway` may hold the PayPal money
 * credential or call the PayPal REST API.
 *
 * 1. The literal `PAYPAL_CLIENT_SECRET` may only appear under `apps/gateway/**`.
 * 2. The literal `PAYPAL_LOGIN_CLIENT_SECRET` may only appear under `apps/api/**`
 *    (ADR-028: "Log in with PayPal" uses a separate REST app with no Payouts /
 *    Invoicing features, so its secret never reaches the money path).
 * 3. `@kitty/paypal` may only be imported from `apps/gateway/**`.
 *
 * Exits 1 when a rule is broken. Build output and dependencies are skipped.
 * `docs/` and `scripts/` are not scanned (they describe the rule).
 *
 * `bun scripts/check-env-isolation.ts --self-test` exercises both failure
 * cases (and the allowed case) without touching the repository.
 */
import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";

const GATEWAY_PREFIX = `apps${sep}gateway${sep}`;
const API_PREFIX = `apps${sep}api${sep}`;
const SCAN_ROOTS = ["apps", "packages"];
const IGNORED_DIRS = new Set(["node_modules", ".next", ".turbo", "dist", "coverage", ".git"]);

/**
 * Matches an actual import of the package: static `import`/`export … from`,
 * side-effect `import "…"`, dynamic `import("…")` or `require("…")`. It
 * deliberately does not match the package name inside a message string (for
 * example the ESLint config or this file).
 */
const PAYPAL_IMPORT_PATTERN =
  /(?:from\s+|import\s*\(\s*|require\s*\(\s*|import\s+)["']@kitty\/paypal(?:\/[^"']*)?["']/;

interface IsolationRule {
  readonly label: string;
  readonly describe: string;
  /** Directory prefix (relative to the repo root) allowed to contain the match. */
  readonly allowedPrefix: string;
  readonly matches: (content: string) => boolean;
}

export const rules: IsolationRule[] = [
  {
    label: "PAYPAL_CLIENT_SECRET",
    describe: `the literal "PAYPAL_CLIENT_SECRET" must only appear in apps/gateway/**`,
    allowedPrefix: GATEWAY_PREFIX,
    matches: (content) => content.includes("PAYPAL_CLIENT_SECRET"),
  },
  {
    label: "PAYPAL_LOGIN_CLIENT_SECRET",
    describe: `the literal "PAYPAL_LOGIN_CLIENT_SECRET" must only appear in apps/api/**`,
    allowedPrefix: API_PREFIX,
    matches: (content) => content.includes("PAYPAL_LOGIN_CLIENT_SECRET"),
  },
  {
    label: "@kitty/paypal",
    describe: `"@kitty/paypal" may only be imported by apps/gateway/**`,
    allowedPrefix: GATEWAY_PREFIX,
    matches: (content) => PAYPAL_IMPORT_PATTERN.test(content),
  },
];

/** Labels of the rules a file breaks. Pure, so the self-test can reuse it. */
export function violatedRules(relativePath: string, content: string): string[] {
  return rules
    .filter((rule) => !relativePath.startsWith(rule.allowedPrefix) && rule.matches(content))
    .map((rule) => rule.label);
}

interface SelfTestCase {
  readonly name: string;
  readonly relativePath: string;
  readonly content: string;
  readonly expected: string[];
}

const SELF_TEST_CASES: SelfTestCase[] = [
  {
    name: "the money secret outside apps/gateway fails",
    relativePath: `apps${sep}web${sep}src${sep}leak.ts`,
    content: "const secret = process.env.PAYPAL_CLIENT_SECRET;",
    expected: ["PAYPAL_CLIENT_SECRET"],
  },
  {
    name: "the login secret outside apps/api fails",
    relativePath: `packages${sep}shared${sep}src${sep}leak.ts`,
    content: "const secret = process.env.PAYPAL_LOGIN_CLIENT_SECRET;",
    expected: ["PAYPAL_LOGIN_CLIENT_SECRET"],
  },
  {
    name: "the login secret inside apps/web fails",
    relativePath: `apps${sep}web${sep}src${sep}leak.ts`,
    content: "const secret = process.env.PAYPAL_LOGIN_CLIENT_SECRET;",
    expected: ["PAYPAL_LOGIN_CLIENT_SECRET"],
  },
  {
    name: "the money secret in apps/gateway is allowed",
    relativePath: `apps${sep}gateway${sep}src${sep}env.ts`,
    content: "const secret = process.env.PAYPAL_CLIENT_SECRET;",
    expected: [],
  },
  {
    name: "the login secret in apps/api is allowed",
    relativePath: `apps${sep}api${sep}src${sep}env.ts`,
    content: "const secret = process.env.PAYPAL_LOGIN_CLIENT_SECRET;",
    expected: [],
  },
  {
    name: "the money secret in apps/api is still a violation",
    relativePath: `apps${sep}api${sep}src${sep}env.ts`,
    content: "const secret = process.env.PAYPAL_CLIENT_SECRET;",
    expected: ["PAYPAL_CLIENT_SECRET"],
  },
  {
    name: "importing @kitty/paypal outside the gateway is a violation",
    relativePath: `apps${sep}api${sep}src${sep}pay.ts`,
    content: 'import { client } from "@kitty/paypal";',
    expected: ["@kitty/paypal"],
  },
  {
    name: "naming the package in a message string is not an import",
    relativePath: `apps${sep}api${sep}src${sep}doc.ts`,
    content: 'const message = "@kitty/paypal is gateway only";',
    expected: [],
  },
];

function selfTest(): never {
  const failures: string[] = [];

  for (const testCase of SELF_TEST_CASES) {
    const actual = violatedRules(testCase.relativePath, testCase.content);

    if (actual.join(",") !== testCase.expected.join(",")) {
      failures.push(
        `${testCase.name}: expected [${testCase.expected.join(", ")}] got [${actual.join(", ")}]`,
      );
    }
  }

  if (failures.length > 0) {
    console.error("env isolation self-test FAILED:");
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }

  console.log(`env isolation self-test passed: ${SELF_TEST_CASES.length} cases`);
  process.exit(0);
}

if (process.argv.includes("--self-test")) {
  selfTest();
}

const repoRoot = join(import.meta.dirname, "..");

async function* walk(dir: string): AsyncGenerator<string> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      yield* walk(full);
    } else if (entry.isFile()) {
      yield full;
    }
  }
}

async function directoryExists(dir: string): Promise<boolean> {
  try {
    await readdir(dir);
    return true;
  } catch {
    return false;
  }
}

const violations = new Map<string, string[]>();

for (const root of SCAN_ROOTS) {
  const absoluteRoot = join(repoRoot, root);
  if (!(await directoryExists(absoluteRoot))) continue;

  for await (const file of walk(absoluteRoot)) {
    const relativePath = relative(repoRoot, file);
    const content = await readFile(file, "utf8").catch(() => "");

    for (const label of violatedRules(relativePath, content)) {
      const list = violations.get(label) ?? [];
      list.push(relativePath);
      violations.set(label, list);
    }
  }
}

if (violations.size > 0) {
  console.error("env isolation check FAILED:");
  for (const rule of rules) {
    const files = violations.get(rule.label);
    if (files === undefined) continue;

    console.error(`  ${rule.describe}`);
    for (const file of files) {
      console.error(`    - ${file}`);
    }
  }
  process.exit(1);
}

console.log(
  `env isolation check passed: PAYPAL_CLIENT_SECRET + "@kitty/paypal" stay in apps/gateway/**, PAYPAL_LOGIN_CLIENT_SECRET stays in apps/api/**`,
);
