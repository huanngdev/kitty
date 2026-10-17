import { ulid } from "@kitty/shared";

/**
 * ULID helpers for gateway-owned ids (AGENTS.md §6: `<prefix>_<ULID>`).
 *
 * The ULID implementation lives in `@kitty/shared` so every service generates
 * ids the same way; this module only adds the gateway's ledger txn id.
 */

export { newId, ulid } from "@kitty/shared";

/** A ledger transaction group id (`leash.ledger_entries.txn_id`). */
export function newTxnId(): string {
  return `txn_${ulid()}`;
}
