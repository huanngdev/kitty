#!/usr/bin/env bun
/**
 * Enforces AGENTS.md invariant #1: only `apps/gateway` may hold PayPal
 * credentials or call the PayPal REST API.
 *
 * 1. The literal `PAYPAL_CLIENT_SECRET` may only appear under `apps/gateway/**`.
 * 2. `@kitty/paypal` may only be imported from `apps/gateway/**`.
 *
 * Exits 1 when either rule is broken. Build output and dependencies are
 * skipped. `docs/` and `scripts/` are not scanned (they describe the rule).
 */
import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";

const ALLOWED_PREFIX = `apps${sep}gateway${sep}`;
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
  readonly matches: (content: string) => boolean;
}

const rules: IsolationRule[] = [
  {
    label: "PAYPAL_CLIENT_SECRET",
    describe: `the literal "PAYPAL_CLIENT_SECRET" must only appear in apps/gateway/**`,
    matches: (content) => content.includes("PAYPAL_CLIENT_SECRET"),
  },
  {
    label: "@kitty/paypal",
    describe: `"@kitty/paypal" may only be imported by apps/gateway/**`,
    matches: (content) => PAYPAL_IMPORT_PATTERN.test(content),
  },
];

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
    if (relativePath.startsWith(ALLOWED_PREFIX)) continue;

    const content = await readFile(file, "utf8").catch(() => "");
    for (const rule of rules) {
      if (!rule.matches(content)) continue;

      const list = violations.get(rule.label) ?? [];
      list.push(relativePath);
      violations.set(rule.label, list);
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
  `env isolation check passed: PayPal secret and imports of "@kitty/paypal" are confined to apps/gateway/**`,
);
