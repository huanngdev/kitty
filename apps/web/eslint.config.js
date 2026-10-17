import {
  nextConfig,
  paypalClientImportRule,
  shadcnConfig,
  tailwindConfig,
} from "@kitty/eslint-config";

const config = [
  ...nextConfig,
  ...tailwindConfig({ entryPoint: "src/app/globals.css" }),
  ...shadcnConfig({ uiImportPrefix: "@/components/ui", uiDir: "src/components/ui" }),
  {
    // CLI-generated vendor code (shadcn preset b4VmS9QxUG). These files are owned
    // by the shadcn CLI and never hand-edited, so the design-system rules its own
    // generated style trips are off for this dir only (ADR-024).
    files: ["src/components/ui/**/*.{ts,tsx}"],
    rules: {
      "shadcn/no-inline-styles": "off",
      "shadcn/require-static-classes": "off",
      "better-tailwindcss/no-unknown-classes": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
  {
    // CLI-generated helpers the vendor components import (ADR-024).
    files: ["src/hooks/use-mobile.ts", "src/lib/highlighter.tsx"],
    rules: {
      "shadcn/no-inline-styles": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
  {
    // apps/web never touches the database directly — it talks to apps/api.
    files: ["**/*.{js,jsx,ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@kitty/db", "@kitty/db/*"],
              message: "apps/web must not access the database directly; go through apps/api.",
            },
            // The base config also restricts @kitty/paypal; spreading the
            // patterns in keeps both rules, since this value replaces the base.
            ...paypalClientImportRule.patterns,
          ],
        },
      ],
    },
  },
];

export default config;
