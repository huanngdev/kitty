import { nextConfig, shadcnConfig, tailwindConfig } from "@kitty/eslint-config";

const config = [
  ...nextConfig,
  ...tailwindConfig({ entryPoint: "src/styles/globals.css" }),
  ...shadcnConfig({ uiImportPrefix: "@kitty/ui", uiDir: "src/components" }),
];

export default config;
