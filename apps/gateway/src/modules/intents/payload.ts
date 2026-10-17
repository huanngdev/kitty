import type { SpendIntent } from "@kitty/leash";
import { sha256Hex } from "@kitty/signing";

/**
 * Canonical payload of a spend intent, used for the idempotency check
 * (docs/05 §7).
 *
 * `justification` is deliberately excluded: it is display/audit only and never
 * affects a decision (AGENTS.md invariant #2), so a retry that only changes it
 * must be treated as the same request. Every other field is rendered with a
 * fixed key order and `amountCents` as a decimal string, so the JSON is
 * byte-stable for identical requests.
 */
function canonicalPayload(intent: SpendIntent): string {
  return JSON.stringify({
    action: intent.action,
    amountCents: intent.amountCents.toString(),
    currency: intent.currency,
    payee: intent.payee ?? null,
    category: intent.category ?? null,
    memo: intent.memo,
    taskId: intent.taskId ?? null,
  });
}

const textEncoder = new TextEncoder();

/** SHA-256 hex digest of {@link canonicalPayload}, the stored payload hash. */
export function payloadHash(intent: SpendIntent): Promise<string> {
  return sha256Hex(textEncoder.encode(canonicalPayload(intent)));
}
