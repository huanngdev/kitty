import { describe, expect, test } from "bun:test";
import { extractInvoiceId, InvoiceIdNotFoundError } from "./invoice-id";

describe("extractInvoiceId", () => {
  test("prefers the id in the response body", () => {
    expect(extractInvoiceId({ body: { id: "INV2-BODY" } })).toBe("INV2-BODY");
  });

  test("reads the id from the body href (the real Invoicing v2 shape)", () => {
    const body = {
      rel: "self",
      href: "https://api-m.sandbox.paypal.com:8443/v2/invoicing/invoices/INV2-HREF",
      method: "GET",
    };

    expect(extractInvoiceId({ body })).toBe("INV2-HREF");
  });

  test("falls back to the Location header when the body carries no id", () => {
    const location = "https://api-m.sandbox.paypal.com:8443/v2/invoicing/invoices/INV2-LOCATION";

    expect(extractInvoiceId({ body: { message: "Created" }, location })).toBe("INV2-LOCATION");
  });

  test("accepts a bare path in the Location header", () => {
    expect(
      extractInvoiceId({ body: undefined, location: "/v2/invoicing/invoices/INV2-PATH" }),
    ).toBe("INV2-PATH");
  });

  test("falls back to the last href path segment when there is no invoice path", () => {
    expect(extractInvoiceId({ body: { href: "INV2-BARE" } })).toBe("INV2-BARE");
  });

  test("falls back to the last Location segment when there is no invoice path", () => {
    expect(extractInvoiceId({ body: {}, location: "INV2-LOCBARE" })).toBe("INV2-LOCBARE");
  });

  test("throws when the href yields an empty segment", () => {
    expect(() => extractInvoiceId({ body: { href: "?x" } })).toThrow(InvoiceIdNotFoundError);
  });

  test("throws when no id can be found anywhere", () => {
    expect(() => extractInvoiceId({ body: { rel: "self" }, location: null })).toThrow(
      InvoiceIdNotFoundError,
    );
  });

  test("throws when the body is not an object at all", () => {
    expect(() => extractInvoiceId({ body: "" })).toThrow(InvoiceIdNotFoundError);
  });
});
