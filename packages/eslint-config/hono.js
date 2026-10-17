import globals from "globals";

import { baseConfig } from "./base.js";

/** @type {import("eslint").Linter.Config[]} */
export const honoConfig = [
  ...baseConfig,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.nodeBuiltin,
        Bun: "readonly",
      },
    },
  },
];

export default honoConfig;
