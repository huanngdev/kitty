import { formatMoney, parseMoney } from "@kitty/ledger";
import type { z } from "zod";
import { findLink, type PayPalTransport } from "./http";
import { orderCaptureSchema, orderRequestSchema, orderSchema } from "./schemas";
import type {
  CreateOrderInput,
  Order,
  OrderCapture,
  OrderCaptureEntry,
  OrdersNamespace,
} from "./types";

type OrderLink = z.infer<typeof orderSchema>["links"];

function approveUrlFrom(links: OrderLink): string | undefined {
  return findLink(links, ["approve", "payer-action"]);
}

/** Orders v2 endpoints (docs/11-paypal-integration.md §2.2). */
export function createOrdersNamespace(transport: PayPalTransport): OrdersNamespace {
  return {
    async create(input: CreateOrderInput): Promise<Order> {
      const body = orderRequestSchema.parse({
        intent: "CAPTURE",
        purchase_units: [
          {
            custom_id: input.kittyId,
            invoice_id: input.invoiceId,
            description: input.description,
            amount: { currency_code: input.currency, value: formatMoney(input.amountCents) },
          },
        ],
      });

      return transport.request<Order>({
        method: "POST",
        path: "/v2/checkout/orders",
        requestId: input.requestId,
        body,
        parse: (data): Order => {
          const order = orderSchema.parse(data);

          return {
            orderId: order.id,
            status: order.status,
            approveUrl: approveUrlFrom(order.links),
          };
        },
      });
    },

    async get(input): Promise<Order> {
      return transport.request<Order>({
        method: "GET",
        path: `/v2/checkout/orders/${encodeURIComponent(input.orderId)}`,
        parse: (data): Order => {
          const order = orderSchema.parse(data);

          return {
            orderId: order.id,
            status: order.status,
            approveUrl: approveUrlFrom(order.links),
          };
        },
      });
    },

    async capture(input): Promise<OrderCapture> {
      return transport.request<OrderCapture>({
        method: "POST",
        path: `/v2/checkout/orders/${encodeURIComponent(input.orderId)}/capture`,
        requestId: input.requestId,
        body: {},
        parse: (data): OrderCapture => {
          const parsed = orderCaptureSchema.parse(data);
          const captures: OrderCaptureEntry[] = (parsed.purchase_units ?? []).flatMap((unit) =>
            (unit.payments?.captures ?? []).map((capture) => ({
              captureId: capture.id,
              status: capture.status,
              amountCents:
                capture.amount !== undefined ? parseMoney(capture.amount.value) : undefined,
              currency: capture.amount?.currency_code,
            })),
          );

          return { orderId: parsed.id, status: parsed.status, captures };
        },
      });
    },
  };
}
