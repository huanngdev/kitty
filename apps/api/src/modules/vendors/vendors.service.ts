import type { NewVendor, VendorRow } from "@kitty/db";
import { formatMoney, parseMoney } from "@kitty/ledger";
import { errorCodes, idPrefixes, newId } from "@kitty/shared";
import { type CreateVendorInput, type UpdateVendorInput, type Vendor } from "@kitty/shared/vendors";
import { categorySchema } from "@kitty/shared/events";
import { getDb } from "../../lib/db";
import { AppError } from "../../lib/errors";
import { gatewayAdminClient, type GatewayAdminClient } from "../../lib/gateway-client";
import { narrowEnum } from "../../lib/narrow";
import { requireOwnedEvent } from "../events/events.ownership";
import { type EventsRepository, createEventsRepository } from "../events/events.repository";
import { type VendorsRepository, createVendorsRepository } from "./vendors.repository";

/**
 * Vendor service (docs/10-api-spec.md §4, AGENTS.md invariant #12).
 *
 * Vendors are created with `verified=false`. Only the event organizer may
 * `verify` one, and that call is the only path that registers the vendor's
 * PayPal email as a gateway verified payee — agents can propose and read
 * vendors but never verify.
 */

/** Maps a DB row to the wire contract (money: bigint cents → `"12.34"`). */
export function toVendor(row: VendorRow): Vendor {
  return {
    id: row.id,
    eventId: row.eventId,
    name: row.name,
    paypalEmail: row.paypalEmail,
    category: narrowEnum(row.category, categorySchema.options, "vendor.category"),
    quote: row.quoteCents === null ? null : formatMoney(row.quoteCents),
    notes: row.notes,
    verified: row.verified,
  };
}

function patchFromInput(existing: VendorRow, input: UpdateVendorInput): Partial<NewVendor> {
  const patch: Partial<NewVendor> = {};

  if (input.name !== undefined) patch.name = input.name;
  if (input.category !== undefined) patch.category = input.category;
  if (input.quote !== undefined) {
    patch.quoteCents = input.quote === null ? null : parseMoney(input.quote);
  }
  if (input.notes !== undefined) patch.notes = input.notes;
  if (input.paypalEmail !== undefined) {
    patch.paypalEmail = input.paypalEmail;
    // A new PayPal email invalidates the previous verification (invariant #12):
    // the organizer must verify the new payee.
    if (input.paypalEmail !== existing.paypalEmail) patch.verified = false;
  }

  return patch;
}

export interface VendorsService {
  create(eventId: string, input: CreateVendorInput, actorUserId: string): Promise<Vendor>;
  list(eventId: string, actorUserId: string): Promise<Vendor[]>;
  update(
    eventId: string,
    vendorId: string,
    input: UpdateVendorInput,
    actorUserId: string,
  ): Promise<Vendor>;
  verify(eventId: string, vendorId: string, actorUserId: string): Promise<Vendor>;
}

export interface VendorsServiceDeps {
  readonly events: EventsRepository;
  readonly vendors: VendorsRepository;
  readonly gateway: GatewayAdminClient;
}

export function createVendorsService(deps: VendorsServiceDeps): VendorsService {
  return {
    async create(eventId, input, actorUserId) {
      await requireOwnedEvent(deps.events, eventId, actorUserId);

      const row = await deps.vendors.insert({
        id: newId(idPrefixes.vendor),
        eventId,
        name: input.name,
        paypalEmail: input.paypalEmail,
        category: input.category,
        quoteCents: input.quote === null ? null : parseMoney(input.quote),
        notes: input.notes,
        // Never verifiable on create — only the explicit verify route flips it.
        verified: false,
      });

      return toVendor(row);
    },

    async list(eventId, actorUserId) {
      await requireOwnedEvent(deps.events, eventId, actorUserId);

      const rows = await deps.vendors.listByEvent(eventId);

      return rows.map(toVendor);
    },

    async update(eventId, vendorId, input, actorUserId) {
      await requireOwnedEvent(deps.events, eventId, actorUserId);

      const existing = await deps.vendors.findByIdForEvent(eventId, vendorId);

      if (existing === undefined) {
        throw new AppError(errorCodes.vendorNotFound, 404, { vendorId });
      }

      const updated = await deps.vendors.update(eventId, vendorId, patchFromInput(existing, input));

      if (updated === undefined) {
        throw new AppError(errorCodes.internal, 500, { context: "vendor update" });
      }

      return toVendor(updated);
    },

    /**
     * Organizer confirmation (invariant #12). The gateway payee is registered
     * first: if it fails, the vendor stays unverified and the organizer can
     * retry, which is the safe direction (a payee is never verified without the
     * organizer, and a leash can only name payees the gateway already knows).
     */
    async verify(eventId, vendorId, actorUserId) {
      const event = await requireOwnedEvent(deps.events, eventId, actorUserId);
      const vendor = await deps.vendors.findByIdForEvent(eventId, vendorId);

      if (vendor === undefined) {
        throw new AppError(errorCodes.vendorNotFound, 404, { vendorId });
      }

      if (event.kittyId === null) {
        throw new AppError(errorCodes.eventHasNoKitty, 409, { eventId });
      }

      await deps.gateway.verifyPayee({
        userId: actorUserId,
        kittyId: event.kittyId,
        email: vendor.paypalEmail,
      });

      const updated = await deps.vendors.setVerified(eventId, vendorId, true);

      if (updated === undefined) {
        throw new AppError(errorCodes.internal, 500, { context: "vendor verify" });
      }

      return toVendor(updated);
    },
  };
}

let defaultService: VendorsService | undefined;

/** The singleton service wired to the pooled DB and the gateway client. */
export function getVendorsService(): VendorsService {
  defaultService ??= createVendorsService({
    events: createEventsRepository(getDb()),
    vendors: createVendorsRepository(getDb()),
    gateway: gatewayAdminClient,
  });

  return defaultService;
}
