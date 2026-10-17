import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";
import globals from "globals";

import { baseConfig } from "./base.js";

/** @type {import("eslint").Linter.Config[]} */
export const nextConfig = [
  ...baseConfig,
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },
  // Prettier must stay last so it can disable conflicting formatting rules.
  prettier,
];

export default nextConfig;
