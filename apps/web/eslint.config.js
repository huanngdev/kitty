import { nextConfig, shadcnConfig, tailwindConfig } from "@kitty/eslint-config";

const config = [
  ...nextConfig,
  ...tailwindConfig({ entryPoint: "src/app/globals.css" }),
  ...shadcnConfig({ uiDir: "src/components/ui" }),
];

export default config;
