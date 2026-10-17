import js from "@eslint/js";
import prettier from "eslint-config-prettier/flat";
import turboPlugin from "eslint-plugin-turbo";
import tseslint from "typescript-eslint";

/**
 * `@kitty/paypal` is gateway-only: only `apps/gateway` may hold PayPal
 * credentials and call the PayPal REST API (AGENTS.md invariant #1). Apps and
 * packages that define their own `no-restricted-imports` must spread these
 * patterns in, because a later rule config replaces the earlier value.
 */
export const paypalClientImportRule = {
  patterns: [
    {
      group: ["@kitty/paypal", "@kitty/paypal/*"],
      message:
        "`@kitty/paypal` is gateway-only — only apps/gateway may import it (AGENTS.md invariant #1).",
    },
  ],
};

/** @type {import("eslint").Linter.Config[]} */
export const baseConfig = [
  {
    ignores: [
      "**/dist/**",
      "**/.next/**",
      "**/.turbo/**",
      "**/node_modules/**",
      "**/coverage/**",
      // Vendored agent skills — not our code, never linted.
      ".agents/**",
      ".claude/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { turbo: turboPlugin },
    rules: {
      "turbo/no-undeclared-env-vars": "warn",
    },
  },
  {
    rules: {
      "no-restricted-imports": ["error", paypalClientImportRule],
    },
  },
  prettier,
];

export default baseConfig;
