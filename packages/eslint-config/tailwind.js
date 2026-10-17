import betterTailwindcss from "eslint-plugin-better-tailwindcss";

const files = ["**/*.{js,jsx,cjs,mjs,ts,tsx,cts,mts}"];

/**
 * Tailwind class order + correctness rules for this repo.
 * ESLint owns Tailwind class order (prettier-plugin-tailwindcss was removed).
 *
 * @param {{ entryPoint: string }} options Path to the Tailwind v4 CSS entry, relative to the app cwd.
 * @returns {import("eslint").Linter.Config[]}
 */
export const tailwindConfig = ({ entryPoint }) => [
  {
    files,
    plugins: { "better-tailwindcss": betterTailwindcss },
    settings: {
      "better-tailwindcss": {
        entryPoint,
      },
    },
    rules: {
      "better-tailwindcss/enforce-consistent-class-order": "error",
      "better-tailwindcss/no-duplicate-classes": "error",
      "better-tailwindcss/no-unnecessary-whitespace": "error",
      "better-tailwindcss/no-conflicting-classes": "error",
      // Owns "unknown class" detection repo-wide; @shadcn/lint does not enable its own copy
      // so a class is never reported twice.
      "better-tailwindcss/no-unknown-classes": "error",
    },
  },
];

export default tailwindConfig;
