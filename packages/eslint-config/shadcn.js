import { plugin as shadcn } from "@shadcn/lint";
import tseslint from "typescript-eslint";

const files = ["**/*.{js,jsx,ts,tsx}"];

/**
 * Design-system rules from @shadcn/lint.
 *
 * NOTE: `shadcn/no-unknown-classes` is intentionally NOT enabled here — the
 * better-tailwindcss plugin owns that rule (see tailwind.js) so a class is
 * only ever reported once.
 *
 * @param {{ uiImportPrefix?: string; uiDir?: string }} [options]
 * @returns {import("eslint").Linter.Config[]}
 */
export const shadcnConfig = ({ uiImportPrefix, uiDir = "src/components/ui" } = {}) => [
  {
    files,
    plugins: { shadcn },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
        sourceType: "module",
      },
    },
    settings: {
      shadcn: uiImportPrefix ? { ui: uiImportPrefix } : {},
    },
    rules: {
      "shadcn/no-raw-colors": "error",
      "shadcn/no-arbitrary-values": "error",
      "shadcn/no-inline-styles": "error",
      "shadcn/require-static-classes": "error",
      "shadcn/no-restyle": "error",
    },
  },
  {
    // shadcn/ui components define the design system: they may restyle themselves
    // and use off-token (arbitrary) values that the rest of the app must not.
    files: [`${uiDir}/**/*.{js,jsx,ts,tsx}`],
    rules: {
      "shadcn/no-restyle": "off",
      "shadcn/no-arbitrary-values": "off",
    },
  },
];

export default shadcnConfig;
