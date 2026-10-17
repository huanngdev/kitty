/**
 * Runtime spike for M0 (KIT-10): de-risk the two runtime assumptions the leash
 * core depends on, before any money-path code is written.
 *
 *   1. postgres.js transactions over the **pooled** Neon `DATABASE_URL`
 *      (PgBouncer transaction mode, `{ prepare: false }` — exactly like
 *      `@kitty/db` `createDb`): two concurrent `SELECT … FOR UPDATE`
 *      transactions must serialize, not race.
 *   2. Ed25519 via WebCrypto (`crypto.subtle`) on Bun — no `Bun.*` APIs, so the
 *      same code can run on Node (`packages/signing`).
 *
 * Run from the repo root (loads the gateway env, which holds the pooled URL):
 *
 *   bun --env-file=apps/gateway/.env scripts/spikes/runtime-spike.ts
 *   # or: bun run spike:runtime
 *
 * Prints one PASS/FAIL line per check and exits 1 on any FAIL. Findings are
 * written into docs/07-tech-stack.md §6.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const ROW_ID = "lsh_spike";
const START_BALANCE = 1000n;
const DECREMENT = 700n;
const ITERATIONS = 5;
const TX_SLEEP_MS = 500;
const SERIALIZATION_TOLERANCE_MS = 400;

type Check = { name: string; pass: boolean; detail: string };

const results: Check[] = [];

function check(name: string, pass: boolean, detail: string): void {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name} — ${detail}`);
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Web-standard base64url encode (btoa, no Bun.* APIs). */
function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

/** Web-standard base64url decode (atob, no Bun.* APIs). */
function fromBase64Url(value: string): Uint8Array {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function toBigInt(value: unknown): bigint {
  return typeof value === "bigint" ? value : BigInt(value as string | number);
}

function resolvedPostgresVersion(): string {
  try {
    const entry = fileURLToPath(import.meta.resolve("postgres"));
    const pkg = JSON.parse(readFileSync(join(dirname(entry), "..", "package.json"), "utf8"));
    return typeof pkg.version === "string" ? pkg.version : "unknown";
  } catch {
    return "unknown";
  }
}

type Attempt = {
  label: string;
  startMs: number;
  lockAcquiredMs: number;
  endMs: number;
  sawBalance: bigint;
  decremented: boolean;
  error: string | undefined;
};

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("FAIL  env — DATABASE_URL is not set (run with --env-file=apps/gateway/.env)");
  process.exit(1);
}

const bunVersion = (process.versions as Record<string, string | undefined>).bun ?? "unknown";
const nodeVersion = process.versions.node ?? "unknown";
const pgVersion = resolvedPostgresVersion();

console.log(`RUNTIME  bun ${bunVersion} · node-compat ${nodeVersion} · postgres.js ${pgVersion}`);
console.log(`SPIKE    pooled DATABASE_URL · prepare:false · ${ITERATIONS} iterations\n`);

const sql = postgres(databaseUrl, { prepare: false, max: 10 });

/**
 * One race participant: open a transaction, take a row lock with `FOR UPDATE`,
 * hold it ~500 ms, then decrement only if the observed balance allows it.
 */
async function attempt(label: string): Promise<Attempt> {
  const rec: Attempt = {
    label,
    startMs: Date.now(),
    lockAcquiredMs: -1,
    endMs: -1,
    sawBalance: -1n,
    decremented: false,
    error: undefined,
  };
  try {
    await sql.begin(async (tx) => {
      const rows =
        await tx`SELECT balance_cents FROM spike.leashes WHERE id = ${ROW_ID} FOR UPDATE`;
      rec.lockAcquiredMs = Date.now();
      rec.sawBalance = toBigInt(rows[0]?.balance_cents);
      await sleep(TX_SLEEP_MS);
      if (rec.sawBalance >= DECREMENT) {
        await tx`UPDATE spike.leashes SET balance_cents = balance_cents - ${DECREMENT} WHERE id = ${ROW_ID}`;
        rec.decremented = true;
      }
    });
  } catch (error) {
    rec.error = error instanceof Error ? error.message : String(error);
  }
  rec.endMs = Date.now();
  return rec;
}

async function pooledTransactionSpike(): Promise<void> {
  console.log("--- Neon pooler: concurrent SELECT … FOR UPDATE ---");

  await sql`DROP SCHEMA IF EXISTS spike CASCADE`;
  await sql`CREATE SCHEMA spike`;
  await sql`CREATE TABLE spike.leashes (id text primary key, balance_cents bigint not null)`;
  await sql`INSERT INTO spike.leashes (id, balance_cents) VALUES (${ROW_ID}, ${START_BALANCE})`;
  check("setup: create spike.leashes and seed balance 1000", true, "schema spike + table created");

  for (let i = 1; i <= ITERATIONS; i += 1) {
    await sql`UPDATE spike.leashes SET balance_cents = ${START_BALANCE} WHERE id = ${ROW_ID}`;

    const [a, b] = await Promise.all([attempt("A"), attempt("B")]);
    const attempts = [a, b];
    const first = a.lockAcquiredMs <= b.lockAcquiredMs ? a : b;
    const second = first === a ? b : a;
    const waitMs = second.lockAcquiredMs - first.lockAcquiredMs;
    const successes = attempts.filter((r) => r.decremented).length;
    const errors = attempts.filter((r) => r.error);
    const finalRows = await sql`SELECT balance_cents FROM spike.leashes WHERE id = ${ROW_ID}`;
    const finalBalance = toBigInt(finalRows[0]?.balance_cents);

    console.log(
      `      iter ${i}: tx ${first.label} lock @+${first.lockAcquiredMs - first.startMs}ms ` +
        `(saw ${first.sawBalance}) · tx ${second.label} lock @+${second.lockAcquiredMs - second.startMs}ms ` +
        `(saw ${second.sawBalance}, waited ${waitMs}ms) · final ${finalBalance}`,
    );

    check(
      `iter ${i}: exactly one decrement succeeds`,
      successes === 1,
      `${successes} of 2 transactions decremented`,
    );
    check(
      `iter ${i}: serialized — second waits for first`,
      waitMs >= SERIALIZATION_TOLERANCE_MS,
      `lock Δ = ${waitMs}ms (≥ ${SERIALIZATION_TOLERANCE_MS}ms)`,
    );
    check(`iter ${i}: final balance is 300`, finalBalance === 300n, `final = ${finalBalance}`);
    check(
      `iter ${i}: no "prepared statement" error through the pooler`,
      errors.length === 0,
      errors.length === 0 ? "no errors" : errors.map((e) => e.error).join("; "),
    );
  }
}

async function ed25519Spike(): Promise<void> {
  console.log("\n--- Ed25519 via WebCrypto (crypto.subtle) ---");
  try {
    const t0 = Date.now();
    const generated = await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
      "sign",
      "verify",
    ]);
    const keyPair = generated as CryptoKeyPair;
    const generateMs = Date.now() - t0;

    const t1 = Date.now();
    const rawPublic = new Uint8Array(await crypto.subtle.exportKey("raw", keyPair.publicKey));
    const exportMs = Date.now() - t1;
    const publicKeyB64 = toBase64Url(rawPublic);
    check(
      "ed25519: generateKey + export raw public key",
      rawPublic.length === 32 && publicKeyB64.length > 0,
      `public key ${rawPublic.length} bytes (base64url: ${publicKeyB64})`,
    );

    const t2 = Date.now();
    const imported = await crypto.subtle.importKey(
      "raw",
      fromBase64Url(publicKeyB64),
      { name: "Ed25519" },
      true,
      ["verify"],
    );
    const importMs = Date.now() - t2;
    const roundTrips = toBase64Url(new Uint8Array(await crypto.subtle.exportKey("raw", imported)));
    check(
      "ed25519: re-import exported public key",
      roundTrips === publicKeyB64,
      "raw import round-trips to the same base64url",
    );

    const canonical = JSON.stringify({
      v: 1,
      id: "lsh_spike",
      op: "payout",
      amount_cents: "700",
      nonce: "spike-nonce",
      iat: "2026-10-17T00:00:00Z",
    });
    const payload = new TextEncoder().encode(canonical);

    const t3 = Date.now();
    const signature = new Uint8Array(
      await crypto.subtle.sign({ name: "Ed25519" }, keyPair.privateKey, payload),
    );
    const signMs = Date.now() - t3;

    const t4 = Date.now();
    const valid = await crypto.subtle.verify({ name: "Ed25519" }, imported, signature, payload);
    const verifyMs = Date.now() - t4;
    check("ed25519: sign/verify round-trip", valid === true, `signature ${signature.length} bytes`);

    const tamperedPayload = new TextEncoder().encode(canonical.replace('"700"', '"999"'));
    const t5 = Date.now();
    const tampered = await crypto.subtle.verify(
      { name: "Ed25519" },
      imported,
      signature,
      tamperedPayload,
    );
    const tamperMs = Date.now() - t5;
    check(
      "ed25519: verify rejects a tampered message",
      tampered === false,
      "tampered payload rejected",
    );

    console.log(
      `      timings: generateKey ${generateMs}ms · exportKey(raw) ${exportMs}ms · ` +
        `importKey ${importMs}ms · sign ${signMs}ms · verify ${verifyMs}ms · verify(tampered) ${tamperMs}ms`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    check("ed25519: WebCrypto Ed25519 supported on this runtime", false, message);
  }
}

try {
  await pooledTransactionSpike();
  await ed25519Spike();
} finally {
  try {
    await sql`DROP SCHEMA IF EXISTS spike CASCADE`;
    console.log("\ncleanup  dropped schema spike");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`cleanup  failed to drop schema spike: ${message}`);
  }
  await sql.end();
}

const failed = results.filter((r) => !r.pass);
console.log(`\nSUMMARY  ${results.length - failed.length}/${results.length} checks passed`);
if (failed.length > 0) {
  for (const f of failed) console.log(`  FAIL  ${f.name} — ${f.detail}`);
}
process.exit(failed.length === 0 ? 0 : 1);
