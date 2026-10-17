import type {
  LeashRow,
  NewApproval,
  NewAuditEvent,
  NewOutbox,
  NewPaypalObject,
  NewSpendIntent,
  SpendIntentRow,
} from "@kitty/db/schema";
import { type LedgerLine, type LedgerTxn, type LeashBalance, balanceOf } from "@kitty/ledger";
import type {
  IntentWithKitty,
  IntentsStore,
  IntentsTx,
  LedgerEntryInsert,
} from "../intents.repository";
import type { IntentUsageRow, LeashIdentity } from "../usage";

/**
 * In-memory `IntentsStore` for unit tests.
 *
 * It emulates only the *database* semantics the service relies on (row
 * storage, the `reserved` guard on execution updates, balances summed from
 * ledger lines). All business logic — policy, usage, hashing — comes from the
 * production code under test, so the fake cannot hide a bug there.
 */

export interface FakeStoreState {
  readonly leashes: LeashRow[];
  readonly intents: SpendIntentRow[];
  readonly ledgerTxns: { kittyId: string; txn: LedgerTxn }[];
  readonly approvals: NewApproval[];
  readonly auditEvents: NewAuditEvent[];
  readonly outboxEvents: NewOutbox[];
  readonly paypalObjects: NewPaypalObject[];
}

export interface FakeIntentsStore extends IntentsStore {
  readonly state: FakeStoreState;
}

function cloneLeash(row: LeashRow): LeashRow {
  return { ...row };
}

/** Builds a `LeashRow` with sensible defaults; override what the test cares about. */
export function fakeLeashRow(
  overrides: Partial<LeashRow> & Pick<LeashRow, "id" | "kittyId">,
): LeashRow {
  return {
    parentId: null,
    agentId: "agt_test",
    currency: "USD",
    allocationCents: 10_000n,
    perTxMaxCents: 10_000n,
    dailyMaxCents: 10_000n,
    maxTxPerHour: 100,
    allowedActions: ["payout"],
    allowedPayees: ["vendor@example.com"],
    allowedCategories: ["lodging"],
    stepUpAboveCents: null,
    notBefore: new Date("2026-01-01T00:00:00.000Z"),
    expiresAt: new Date("2027-01-01T00:00:00.000Z"),
    status: "active",
    statusReason: null,
    createdBy: "usr_owner",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    version: 1,
    ...overrides,
  };
}

export function createFakeIntentsStore(initial: {
  leashes?: readonly LeashRow[];
  intents?: readonly SpendIntentRow[];
  ledgerTxns?: readonly { kittyId: string; txn: LedgerTxn }[];
  now?: () => Date;
}): FakeIntentsStore {
  const now = initial.now ?? ((): Date => new Date());
  const state: FakeStoreState = {
    leashes: (initial.leashes ?? []).map(cloneLeash),
    intents: [...(initial.intents ?? [])],
    ledgerTxns: [...(initial.ledgerTxns ?? [])],
    approvals: [],
    auditEvents: [],
    outboxEvents: [],
    paypalObjects: [],
  };

  function findIntent(intentId: string): SpendIntentRow | undefined {
    return state.intents.find((row) => row.id === intentId);
  }

  function ledgerLines(): LedgerLine[] {
    return state.ledgerTxns.flatMap(({ txn }) => txn.lines);
  }

  function toIntentWithKitty(row: SpendIntentRow): IntentWithKitty {
    const leash = state.leashes.find((candidate) => candidate.id === row.leashId);

    return { intent: row, kittyId: leash?.kittyId ?? "" };
  }

  const tx: IntentsTx = {
    async findIntentById(intentId) {
      const row = findIntent(intentId);

      return row === undefined ? null : toIntentWithKitty(row);
    },

    async findActiveLeashForAgent(agentId) {
      const active = state.leashes
        .filter((leash) => leash.agentId === agentId && leash.status === "active")
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      return active[0] === undefined ? null : cloneLeash(active[0]);
    },

    async findAncestorChain(leashId) {
      const chain: LeashRow[] = [];
      let current = state.leashes.find((leash) => leash.id === leashId);

      for (let depth = 0; depth < 8 && current?.parentId != null; depth += 1) {
        const parent = state.leashes.find((leash) => leash.id === current?.parentId);

        if (parent === undefined) {
          break;
        }

        chain.push(cloneLeash(parent));
        current = parent;
      }

      return chain;
    },

    async lockLeashes(leashIds) {
      return state.leashes.filter((leash) => leashIds.includes(leash.id)).map(cloneLeash);
    },

    async listLeashesForKitty(kittyId) {
      const rows: LeashIdentity[] = state.leashes
        .filter((leash) => leash.kittyId === kittyId)
        .map((leash) => ({ id: leash.id, parentId: leash.parentId }));

      return rows;
    },

    async listIntentUsageRows(kittyId, since) {
      const rows: IntentUsageRow[] = [];

      for (const intent of state.intents) {
        const leash = state.leashes.find((candidate) => candidate.id === intent.leashId);

        if (leash === undefined || leash.kittyId !== kittyId) {
          continue;
        }
        if (intent.createdAt.getTime() < since.getTime()) {
          continue;
        }

        rows.push({
          intentId: intent.id,
          leashId: intent.leashId,
          payee: intent.payee,
          amountCents: intent.amountCents,
          decision: intent.decision,
          status: intent.status,
          createdAt: intent.createdAt,
        });
      }

      return rows;
    },

    async listLeashBalances(kittyId) {
      const result = new Map<string, LeashBalance>();
      const lines = ledgerLines();

      for (const leash of state.leashes) {
        if (leash.kittyId !== kittyId) {
          continue;
        }

        result.set(leash.id, {
          availableCents: balanceOf(lines, `leash:${leash.id}:available`),
          heldCents: balanceOf(lines, `leash:${leash.id}:held`),
        });
      }

      return result;
    },

    async insertIntent(row: NewSpendIntent) {
      if (findIntent(row.id) !== undefined) {
        return false;
      }

      const created = now();

      state.intents.push({
        id: row.id,
        leashId: row.leashId,
        agentId: row.agentId,
        action: row.action,
        amountCents: row.amountCents,
        currency: row.currency,
        payee: row.payee ?? null,
        category: row.category ?? null,
        memo: row.memo,
        taskId: row.taskId ?? null,
        justification: row.justification ?? null,
        requestHash: row.requestHash,
        payloadHash: row.payloadHash ?? null,
        decision: row.decision,
        reasons: row.reasons ?? [],
        status: row.status,
        paypalRef: row.paypalRef ?? null,
        error: row.error ?? null,
        executeAttempts: row.executeAttempts ?? 0,
        lastExecuteError: row.lastExecuteError ?? null,
        createdAt: row.createdAt ?? created,
        updatedAt: row.updatedAt ?? created,
      });

      return true;
    },

    async insertLedgerEntry(entry: LedgerEntryInsert) {
      state.ledgerTxns.push({ kittyId: entry.kittyId, txn: entry.txn });
    },

    async insertApproval(row) {
      state.approvals.push(row);
    },

    async insertAuditEvent(row) {
      state.auditEvents.push(row);
    },

    async insertOutboxEvent(row) {
      state.outboxEvents.push(row);
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

    async kittyIdOfLeash(leashId) {
      return state.leashes.find((leash) => leash.id === leashId)?.kittyId ?? null;
    },

    async lockReservedIntent(intentId) {
      const row = findIntent(intentId);

      return row !== undefined && row.status === "reserved" ? { ...row } : null;
    },

    async incrementExecuteAttempts(intentId) {
      const row = findIntent(intentId);

      if (row !== undefined) {
        row.executeAttempts += 1;
        row.updatedAt = now();
      }
    },

    async setLastExecuteError(intentId, error) {
      const row = findIntent(intentId);

      if (row !== undefined) {
        row.lastExecuteError = error;
        row.updatedAt = now();
      }
    },

    async updateIntentAfterExecute(intentId, patch) {
      const row = findIntent(intentId);

      if (row === undefined || row.status !== "reserved") {
        return false;
      }

      row.status = patch.status;
      if (patch.paypalRef !== undefined) {
        row.paypalRef = patch.paypalRef;
      }
      if (patch.error !== undefined) {
        row.error = patch.error;
      }
      row.updatedAt = now();

      return true;
    },
  };

  return {
    state,
    transaction: async (fn) => fn(tx),
  };
}
