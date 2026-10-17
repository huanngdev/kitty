import { type NewLedgerEntry, ledgerEntries } from "@kitty/db";
import type { LedgerTxn, TxnKind } from "@kitty/ledger";
import type { DbLike } from "./db-types";

/**
 * Posts a `@kitty/ledger` transaction into `leash.ledger_entries` (docs/05 §8).
 *
 * The ledger package builds balanced two-line transactions; this is the only
 * place the gateway writes them, always inside the service's transaction so a
 * movement and its audit row commit together.
 */

/** DB `kind` values (docs/09 §3.2) for each `@kitty/ledger` transaction kind. */
const DB_KIND: Record<TxnKind, string> = {
  contribution: "contribution",
  allocateLeash: "allocate",
  delegate: "delegate",
  reserve: "reserve",
  settlePayout: "settle",
  release: "release",
  revokeLeash: "revoke_return",
  refundMember: "refund",
};

export interface PostLedgerOptions {
  /** Overrides the default DB kind, e.g. `topup` for an allocate top-up. */
  readonly kind?: string;
  /** Intent or contribution id the lines belong to. */
  readonly ref?: string;
}

export async function postLedgerTxn(
  db: DbLike,
  txn: LedgerTxn,
  kittyId: string,
  options: PostLedgerOptions = {},
): Promise<void> {
  const rows: NewLedgerEntry[] = txn.lines.map((line) => ({
    kittyId,
    txnId: txn.txnId,
    account: line.account,
    amountCents: line.amountCents,
    kind: options.kind ?? DB_KIND[txn.kind],
    ref: options.ref ?? null,
  }));

  await db.insert(ledgerEntries).values(rows);
}
