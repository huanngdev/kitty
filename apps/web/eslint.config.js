import { nextConfig, shadcnConfig, tailwindConfig } from "@kitty/eslint-config";

const config = [
  ...nextConfig,
  ...tailwindConfig({ entryPoint: "../../packages/ui/src/styles/globals.css" }),
  ...shadcnConfig({ uiImportPrefix: "@kitty/ui" }),
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
          ],
        },
      ],
    },
  },
];

export default config;
