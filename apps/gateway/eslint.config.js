import { honoConfig } from "@kitty/eslint-config";

export default [
  ...honoConfig,
  {
    // apps/gateway is the one service allowed to hold PayPal credentials and
    // call the PayPal REST API (AGENTS.md invariant #1), so it is the only
    // place that may import @kitty/paypal. The base config restricts the import
    // everywhere else; turn it off here.
    rules: { "no-restricted-imports": "off" },
  },
];
