#!/usr/bin/env bun
/**
 * Enforces AGENTS.md invariant #1: only `apps/gateway` may reference
 * `PAYPAL_CLIENT_SECRET`.
 *
 * Exits 1 when the literal string appears in any file under `apps/*` or
 * `packages/*` outside of `apps/gateway/**`. Build output and dependencies are
 * skipped. `docs/` is not scanned (it describes the rule).
 */
import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";

const FORBIDDEN = "PAYPAL_CLIENT_SECRET";
const ALLOWED_PREFIX = `apps${sep}gateway${sep}`;
const SCAN_ROOTS = ["apps", "packages"];
const IGNORED_DIRS = new Set(["node_modules", ".next", ".turbo", "dist", "coverage", ".git"]);

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

const violations: string[] = [];

for (const root of SCAN_ROOTS) {
  const absoluteRoot = join(repoRoot, root);
  if (!(await directoryExists(absoluteRoot))) continue;

  for await (const file of walk(absoluteRoot)) {
    const relativePath = relative(repoRoot, file);
    if (relativePath.startsWith(ALLOWED_PREFIX)) continue;

    const content = await readFile(file, "utf8").catch(() => "");
    if (content.includes(FORBIDDEN)) {
      violations.push(relativePath);
    }
  }
}

if (violations.length > 0) {
  console.error(`env isolation check FAILED: "${FORBIDDEN}" must only appear in apps/gateway/**`);
  for (const violation of violations) {
    console.error(`  - ${violation}`);
  }
  process.exit(1);
}

console.log(`env isolation check passed: "${FORBIDDEN}" is confined to apps/gateway/**`);
