import type {
  BudgetLineRow,
  EventRow,
  MemberRow,
  NewBudgetLine,
  NewEvent,
  NewMember,
  NewVendor,
  VendorRow,
} from "@kitty/db";
import type { KittyDetail, VerifiedPayee } from "@kitty/shared/leash-admin";
import type { GatewayAdminClient } from "../../lib/gateway-client";
import type { BudgetLinesRepository } from "../budget-lines/budget-lines.repository";
import type { EventsRepository } from "../events/events.repository";
import type { MembersRepository } from "../members/members.repository";
import type { VendorsRepository } from "../vendors/vendors.repository";

/**
 * In-memory repository + gateway fakes for the `apps/api` unit tests
 * (CODE_RULES.md §D: services depend on repository interfaces, so they are
 * testable without a database).
 */

export const EVENT_ID = "evt_01JZ0000000000000000000000";
export const ORG_USER_ID = "user_organizer_1";

export function makeEventRow(overrides: Partial<EventRow> = {}): EventRow {
  const base: EventRow = {
    id: EVENT_ID,
    organizerId: ORG_USER_ID,
    title: "Team offsite",
    description: null,
    location: null,
    timezone: "Asia/Ho_Chi_Minh",
    startsOn: "2026-12-01",
    endsOn: "2026-12-05",
    currency: "USD",
    budgetCents: 100000n,
    perMemberCents: null,
    status: "planning",
    kittyId: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  };

  return { ...base, ...overrides };
}

function applyEventPatch(existing: EventRow, patch: Partial<NewEvent>): EventRow {
  return {
    id: existing.id,
    organizerId: patch.organizerId ?? existing.organizerId,
    title: patch.title ?? existing.title,
    description: patch.description !== undefined ? patch.description : existing.description,
    location: patch.location !== undefined ? patch.location : existing.location,
    timezone: patch.timezone ?? existing.timezone,
    startsOn: patch.startsOn ?? existing.startsOn,
    endsOn: patch.endsOn ?? existing.endsOn,
    currency: patch.currency ?? existing.currency,
    budgetCents: patch.budgetCents ?? existing.budgetCents,
    perMemberCents:
      patch.perMemberCents !== undefined ? patch.perMemberCents : existing.perMemberCents,
    status: patch.status ?? existing.status,
    kittyId: patch.kittyId !== undefined ? patch.kittyId : existing.kittyId,
    createdAt: existing.createdAt,
  };
}

export interface FakeEvents {
  readonly repo: EventsRepository;
  readonly rows: Map<string, EventRow>;
}

export function createFakeEventsRepository(seed: readonly EventRow[] = []): FakeEvents {
  const rows = new Map(seed.map((row) => [row.id, row]));

  const repo: EventsRepository = {
    async insert(row: NewEvent) {
      const event = applyEventPatch(makeEventRow({ id: row.id, createdAt: new Date() }), row);

      rows.set(event.id, event);
      return event;
    },
    async findById(id) {
      return rows.get(id);
    },
    async listByOrganizer(organizerId) {
      return [...rows.values()].filter((row) => row.organizerId === organizerId);
    },
    async update(id, patch) {
      const existing = rows.get(id);

      if (existing === undefined) {
        return undefined;
      }

      const updated = applyEventPatch(existing, patch);
      rows.set(id, updated);
      return updated;
    },
    async setKittyId(id, kittyId) {
      const existing = rows.get(id);

      if (existing === undefined) {
        return undefined;
      }

      const updated = { ...existing, kittyId };
      rows.set(id, updated);
      return updated;
    },
    async deleteById(id) {
      rows.delete(id);
    },
  };

  return { repo, rows };
}

export function makeMemberRow(overrides: Partial<MemberRow> = {}): MemberRow {
  const base: MemberRow = {
    id: "mem_01JZ0000000000000000000000",
    eventId: EVENT_ID,
    name: "Mai",
    email: "mai@example.com",
    shareWeight: 1,
    memberToken: "token-abc",
    slackHandle: null,
  };

  return { ...base, ...overrides };
}

export interface FakeMembers {
  readonly repo: MembersRepository;
  readonly rows: Map<string, MemberRow>;
}

export function createFakeMembersRepository(seed: readonly MemberRow[] = []): FakeMembers {
  const rows = new Map(seed.map((row) => [row.id, row]));

  const repo: MembersRepository = {
    async insert(row: NewMember) {
      const member: MemberRow = {
        id: row.id,
        eventId: row.eventId,
        name: row.name,
        email: row.email,
        shareWeight: row.shareWeight ?? 1,
        memberToken: row.memberToken,
        slackHandle: row.slackHandle ?? null,
      };

      rows.set(member.id, member);
      return member;
    },
    async listByEvent(eventId) {
      return [...rows.values()].filter((row) => row.eventId === eventId);
    },
    async findById(id) {
      return rows.get(id);
    },
    async findByEventAndEmail(eventId, email) {
      return [...rows.values()].find((row) => row.eventId === eventId && row.email === email);
    },
    async deleteByIdForEvent(eventId, memberId) {
      const existing = rows.get(memberId);

      if (existing === undefined || existing.eventId !== eventId) {
        return 0;
      }

      rows.delete(memberId);
      return 1;
    },
  };

  return { repo, rows };
}

export function makeVendorRow(overrides: Partial<VendorRow> = {}): VendorRow {
  const base: VendorRow = {
    id: "ven_01JZ0000000000000000000000",
    eventId: EVENT_ID,
    name: "Homestay",
    paypalEmail: "homestay@vendor.example",
    category: "lodging",
    quoteCents: null,
    notes: null,
    verified: false,
  };

  return { ...base, ...overrides };
}

export interface FakeVendors {
  readonly repo: VendorsRepository;
  readonly rows: Map<string, VendorRow>;
}

export function createFakeVendorsRepository(seed: readonly VendorRow[] = []): FakeVendors {
  const rows = new Map(seed.map((row) => [row.id, row]));

  const repo: VendorsRepository = {
    async insert(row: NewVendor) {
      const vendor: VendorRow = {
        id: row.id,
        eventId: row.eventId,
        name: row.name,
        paypalEmail: row.paypalEmail,
        category: row.category,
        quoteCents: row.quoteCents ?? null,
        notes: row.notes ?? null,
        verified: row.verified ?? false,
      };

      rows.set(vendor.id, vendor);
      return vendor;
    },
    async listByEvent(eventId) {
      return [...rows.values()].filter((row) => row.eventId === eventId);
    },
    async findByIdForEvent(eventId, vendorId) {
      const row = rows.get(vendorId);
      return row !== undefined && row.eventId === eventId ? row : undefined;
    },
    async update(eventId, vendorId, patch) {
      const existing = rows.get(vendorId);

      if (existing === undefined || existing.eventId !== eventId) {
        return undefined;
      }

      const updated: VendorRow = {
        id: existing.id,
        eventId: existing.eventId,
        name: patch.name ?? existing.name,
        paypalEmail: patch.paypalEmail ?? existing.paypalEmail,
        category: patch.category ?? existing.category,
        quoteCents: patch.quoteCents !== undefined ? patch.quoteCents : existing.quoteCents,
        notes: patch.notes !== undefined ? patch.notes : existing.notes,
        verified: patch.verified ?? existing.verified,
      };

      rows.set(vendorId, updated);
      return updated;
    },
    async setVerified(eventId, vendorId, verified) {
      const existing = rows.get(vendorId);

      if (existing === undefined || existing.eventId !== eventId) {
        return undefined;
      }

      const updated = { ...existing, verified };
      rows.set(vendorId, updated);
      return updated;
    },
  };

  return { repo, rows };
}

export function makeBudgetLineRow(overrides: Partial<BudgetLineRow> = {}): BudgetLineRow {
  const base: BudgetLineRow = {
    id: "bdl_01JZ0000000000000000000000",
    eventId: EVENT_ID,
    category: "lodging",
    plannedCents: 50000n,
  };

  return { ...base, ...overrides };
}

export interface FakeBudgetLines {
  readonly repo: BudgetLinesRepository;
  readonly rows: BudgetLineRow[];
}

export function createFakeBudgetLinesRepository(
  seed: readonly BudgetLineRow[] = [],
): FakeBudgetLines {
  const state: BudgetLineRow[] = [...seed];

  const repo: BudgetLinesRepository = {
    async listByEvent(eventId) {
      return state.filter((row) => row.eventId === eventId);
    },
    async replaceForEvent(eventId, rows: NewBudgetLine[]) {
      const kept = state.filter((row) => row.eventId !== eventId);
      const inserted = rows.map((row) => ({
        id: row.id,
        eventId: row.eventId,
        category: row.category,
        plannedCents: row.plannedCents,
      }));

      state.length = 0;
      state.push(...kept, ...inserted);

      return inserted;
    },
  };

  return { repo, rows: state };
}

export interface FakeGateway extends GatewayAdminClient {
  readonly createdKitties: ReadonlyArray<{ userId: string; eventId: string }>;
  readonly verifiedPayees: ReadonlyArray<{ kittyId: string; email: string }>;
}

export interface FakeGatewayOptions {
  readonly kittyId?: string;
  readonly failCreateKitty?: boolean;
  readonly failVerifyPayee?: boolean;
}

export function createFakeGateway(options: FakeGatewayOptions = {}): FakeGateway {
  const createdKitties: Array<{ userId: string; eventId: string }> = [];
  const verifiedPayees: Array<{ kittyId: string; email: string }> = [];

  return {
    createdKitties,
    verifiedPayees,
    async createKitty({ userId, eventId }) {
      if (options.failCreateKitty === true) {
        throw new Error("gateway unavailable");
      }

      createdKitties.push({ userId, eventId });

      const kitty: KittyDetail = {
        id: options.kittyId ?? "kty_01JZ0000000000000000000000",
        eventId,
        ownerUserId: userId,
        currency: "USD",
        status: "open",
        createdAt: new Date().toISOString(),
        balances: {
          available: "0.00",
          allocated: "0.00",
          held: "0.00",
          spent: "0.00",
          contributed: "0.00",
          refunded: "0.00",
        },
      };

      return kitty;
    },
    async verifyPayee({ kittyId, email }) {
      if (options.failVerifyPayee === true) {
        throw new Error("gateway unavailable");
      }

      verifiedPayees.push({ kittyId, email });

      const payee: VerifiedPayee = {
        kittyId,
        email,
        verifiedBy: "user_organizer_1",
        verifiedAt: new Date().toISOString(),
      };

      return payee;
    },
    async listPayees() {
      return verifiedPayees.map((payee) => ({
        kittyId: payee.kittyId,
        email: payee.email,
        verifiedBy: "user_organizer_1",
        verifiedAt: new Date().toISOString(),
      }));
    },
  };
}
