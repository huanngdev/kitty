import type { NewAuditEvent, NewOutbox, NewPaypalObject, SpendIntentRow } from "@kitty/db/schema";
import type { LedgerTxn } from "@kitty/ledger";
import type { IntentWithKitty, LedgerEntryInsert } from "../../intents/intents.repository";
import type {
  WebhookEventInsert,
  WebhookEventVerdict,
  WebhooksStore,
  WebhooksTx,
} from "../webhooks.repository";

/**
 * In-memory `WebhooksStore` for unit tests.
 *
 * It emulates only the *database* semantics the services rely on: dedupe by
 * webhook event id, the row lock (a locked intent is copied so a caller cannot
 * mutate storage through it), and `submitted`-only reads. Business logic —
 * the state machine, the ledger builders — always comes from production code.
 */

export interface FakeWebhookEventRow extends WebhookEventInsert {
  status: string;
  error: string | null;
  processedAt: Date | null;
}

export interface FakeWebhooksState {
  readonly webhookEvents: FakeWebhookEventRow[];
  readonly intents: SpendIntentRow[];
  readonly ledgerTxns: { kittyId: string; txn: LedgerTxn }[];
  readonly paypalObjects: NewPaypalObject[];
  readonly auditEvents: NewAuditEvent[];
  readonly outboxEvents: NewOutbox[];
}

export interface FakeWebhooksStore extends WebhooksStore {
  readonly state: FakeWebhooksState;
  /** Number of transactions opened — asserts one commit per event. */
  transactionCount(): number;
}

function cloneIntent(intent: SpendIntentRow): SpendIntentRow {
  return { ...intent };
}

export function createFakeWebhooksStore(initial: {
  intents?: readonly SpendIntentRow[];
  kittyIdOfLeash?: ReadonlyMap<string, string>;
  ledgerTxns?: readonly { kittyId: string; txn: LedgerTxn }[];
}): FakeWebhooksStore {
  const state: FakeWebhooksState = {
    webhookEvents: [],
    intents: (initial.intents ?? []).map(cloneIntent),
    ledgerTxns: [...(initial.ledgerTxns ?? [])],
    paypalObjects: [],
    auditEvents: [],
    outboxEvents: [],
  };

  let transactions = 0;

  function kittyOf(intent: SpendIntentRow): string | null {
    return initial.kittyIdOfLeash?.get(intent.leashId) ?? null;
  }

  function withKitty(intent: SpendIntentRow): IntentWithKitty | null {
    const kittyId = kittyOf(intent);

    return kittyId === null ? null : { intent, kittyId };
  }

  const tx: WebhooksTx = {
    async insertWebhookEvent(row) {
      if (state.webhookEvents.some((event) => event.id === row.id)) {
        return false;
      }

      state.webhookEvents.push({ ...row, status: "received", error: null, processedAt: null });

      return true;
    },

    async recordWebhookVerdict(eventId, verdict: WebhookEventVerdict) {
      const row = state.webhookEvents.find((event) => event.id === eventId);

      if (row !== undefined) {
        row.status = verdict.status;
        row.error = verdict.error ?? null;
        row.processedAt = new Date();
      }
    },

    async lockIntentById(intentId) {
      const row = state.intents.find((intent) => intent.id === intentId);

      // Like `SELECT … FOR UPDATE`: hand out a copy so the caller writes through
      // `updateIntentStatus` and storage stays the single source of truth.
      return row === undefined ? null : withKitty(cloneIntent(row));
    },

    async lockSubmittedIntentsByBatch(batchId) {
      return state.intents
        .filter((intent) => intent.paypalRef === batchId && intent.status === "submitted")
        .sort((a, b) => a.id.localeCompare(b.id))
        .flatMap((intent) => {
          const found = withKitty(cloneIntent(intent));

          return found === null ? [] : [found];
        });
    },

    async listStaleSubmittedIntents(input) {
      return state.intents
        .filter(
          (intent) =>
            intent.status === "submitted" &&
            intent.updatedAt.getTime() <= input.updatedBefore.getTime(),
        )
        .sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime())
        .slice(0, input.limit)
        .flatMap((intent) => {
          const found = withKitty(intent);

          return found === null ? [] : [found];
        });
    },

    async updateIntentStatus(intentId, patch) {
      const row = state.intents.find((intent) => intent.id === intentId);

      if (row === undefined) {
        return;
      }

      row.status = patch.status;
      if (patch.error !== undefined) {
        row.error = patch.error;
      }
      row.updatedAt = new Date();
    },

    async insertLedgerEntry(entry: LedgerEntryInsert) {
      state.ledgerTxns.push({ kittyId: entry.kittyId, txn: entry.txn });
    },

    async upsertPaypalObject(row) {
      const index = state.paypalObjects.findIndex(
        (candidate) => candidate.kind === row.kind && candidate.id === row.id,
      );

      if (index >= 0) {
        state.paypalObjects[index] = row;

        return;
      }

      state.paypalObjects.push(row);
    },

    async insertAuditEvent(row) {
      state.auditEvents.push(row);
    },

    async insertOutboxEvent(row) {
      state.outboxEvents.push(row);
    },
  };

  return {
    state,
    transactionCount: () => transactions,
    transaction: async (fn) => {
      transactions += 1;

      return fn(tx);
    },
  };
}
