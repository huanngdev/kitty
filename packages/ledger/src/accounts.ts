/**
 * Ledger accounts of docs/05-leash-spec.md §8.
 *
 * Accounts are buckets: the balance of an account is the sum of its ledger
 * lines. Internal buckets (`kitty:*`, `leash:*`) are money of the kitty that
 * still sits inside the platform PayPal account; external accounts
 * (`external:member:*`, `external:payee:*`) are the outside world — a member's
 * positive contribution makes their balance negative.
 *
 * Account keys are canonical strings:
 *
 * - `kitty:{kittyId}:available`
 * - `leash:{leashId}:available`, `leash:{leashId}:held`
 * - `external:member:{memberId}`
 * - `external:payee:{payeeEmail}` (email lowercased)
 */

/** Bucket of `kitty:{kittyId}:…`. Only `available` exists in MVP. */
export type KittyBucket = "available";

/** Bucket of `leash:{leashId}:…`: free money, or money held for a spend intent. */
export type LeashBucket = "available" | "held";

export interface KittyAccountRef {
  readonly kind: "kitty";
  readonly kittyId: string;
  readonly bucket: KittyBucket;
}

export interface LeashAccountRef {
  readonly kind: "leash";
  readonly leashId: string;
  readonly bucket: LeashBucket;
}

export interface ExternalMemberAccountRef {
  readonly kind: "external-member";
  readonly memberId: string;
}

export interface ExternalPayeeAccountRef {
  readonly kind: "external-payee";
  readonly payeeEmail: string;
}

/** Every account of the bucket model (§8), as a discriminated union. */
export type AccountRef =
  KittyAccountRef | LeashAccountRef | ExternalMemberAccountRef | ExternalPayeeAccountRef;

/** Buckets that belong to the kitty itself (`kitty:*` and `leash:*`). */
export type InternalAccountRef = KittyAccountRef | LeashAccountRef;

/** Accounts outside the kitty: the source of contributions and the payees. */
export type ExternalAccountRef = ExternalMemberAccountRef | ExternalPayeeAccountRef;

/** Thrown by the account builders and {@link parseAccountKey} on invalid input. */
export class AccountKeyError extends Error {
  readonly code = "ACCOUNT_KEY";
  /**
   * The offending key for {@link parseAccountKey}, or the offending field name
   * for the builders (`"kittyId"`, `"leashId"`, `"memberId"`, payee email).
   */
  readonly key: string;

  constructor(key: string, reason: string) {
    super(`Invalid account key ${JSON.stringify(key)}: ${reason}`);
    this.name = "AccountKeyError";
    this.key = key;
  }
}

const payeeEmailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function assertId(value: string, field: string): void {
  if (value.length === 0 || value.includes(":")) {
    throw new AccountKeyError(field, `${field} must be a non-empty id without ":"`);
  }
}

/**
 * Trims and lowercases a payee email so one vendor always maps to one account
 * key. Throws {@link AccountKeyError} when the email does not look like an
 * email.
 */
function normalizePayeeEmail(email: string): string {
  const normalized = email.trim().toLowerCase();

  if (!payeeEmailPattern.test(normalized)) {
    throw new AccountKeyError(email, "payee email must look like name@domain.tld");
  }

  return normalized;
}

/** Builds the `kitty:{kittyId}:available` account. */
export function kittyAvailable(kittyId: string): KittyAccountRef {
  assertId(kittyId, "kittyId");

  return { kind: "kitty", kittyId, bucket: "available" };
}

/** Builds the `leash:{leashId}:available` account (money not yet spent). */
export function leashAvailable(leashId: string): LeashAccountRef {
  assertId(leashId, "leashId");

  return { kind: "leash", leashId, bucket: "available" };
}

/** Builds the `leash:{leashId}:held` account (money reserved by an intent). */
export function leashHeld(leashId: string): LeashAccountRef {
  assertId(leashId, "leashId");

  return { kind: "leash", leashId, bucket: "held" };
}

/** Builds the `external:member:{memberId}` account. */
export function externalMember(memberId: string): ExternalMemberAccountRef {
  assertId(memberId, "memberId");

  return { kind: "external-member", memberId };
}

/** Builds the `external:payee:{payeeEmail}` account, lowercasing the email. */
export function externalPayee(email: string): ExternalPayeeAccountRef {
  return { kind: "external-payee", payeeEmail: normalizePayeeEmail(email) };
}

/** Renders an account reference as its canonical ledger key. */
export function accountKey(ref: AccountRef): string {
  if (ref.kind === "kitty") {
    return `kitty:${ref.kittyId}:${ref.bucket}`;
  }

  if (ref.kind === "leash") {
    return `leash:${ref.leashId}:${ref.bucket}`;
  }

  if (ref.kind === "external-member") {
    return `external:member:${ref.memberId}`;
  }

  return `external:payee:${ref.payeeEmail}`;
}

/**
 * Parses a canonical account key back into an {@link AccountRef}.
 *
 * Throws {@link AccountKeyError} for any unknown namespace, bucket or shape.
 * Payee emails are lowercased, so `parseAccountKey(accountKey(ref))` always
 * returns the canonical reference.
 */
export function parseAccountKey(key: string): AccountRef {
  const parts = key.split(":");
  const [namespace = "", head = ""] = parts;

  if (namespace === "kitty") {
    if (parts.length !== 3 || parts[2] !== "available") {
      throw new AccountKeyError(key, "expected kitty:{kittyId}:available");
    }

    return kittyAvailable(parts[1] ?? "");
  }

  if (namespace === "leash") {
    const bucket = parts[2];

    if (parts.length !== 3 || (bucket !== "available" && bucket !== "held")) {
      throw new AccountKeyError(key, "expected leash:{leashId}:available|held");
    }

    return bucket === "available" ? leashAvailable(parts[1] ?? "") : leashHeld(parts[1] ?? "");
  }

  if (namespace === "external") {
    if (head === "member") {
      if (parts.length !== 3) {
        throw new AccountKeyError(key, "expected external:member:{memberId}");
      }

      return externalMember(parts[2] ?? "");
    }

    if (head === "payee") {
      if (parts.length !== 3) {
        throw new AccountKeyError(key, "expected external:payee:{email}");
      }

      return externalPayee(parts[2] ?? "");
    }

    throw new AccountKeyError(key, "unknown external account");
  }

  throw new AccountKeyError(key, "unknown account namespace");
}

/**
 * True when the reference is an internal bucket (`kitty:*`, `leash:*`), the
 * buckets invariant I2 requires to stay non-negative.
 */
export function isInternal(ref: AccountRef): ref is InternalAccountRef {
  return ref.kind === "kitty" || ref.kind === "leash";
}

/** True when `key` is a valid canonical account key. */
export function isKnownAccountKey(key: string): boolean {
  try {
    parseAccountKey(key);

    return true;
  } catch {
    return false;
  }
}
