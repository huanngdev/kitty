import type { PayPalEnvironment } from "./types";

/** PayPal REST base URLs. The hackathon only ever runs against sandbox. */
export const PAYPAL_BASE_URLS = {
  sandbox: "https://api-m.sandbox.paypal.com",
  live: "https://api-m.paypal.com",
} as const satisfies Record<PayPalEnvironment, string>;

/** Maps an environment to its PayPal REST base URL. */
export function paypalBaseUrl(environment: PayPalEnvironment): string {
  return PAYPAL_BASE_URLS[environment];
}
