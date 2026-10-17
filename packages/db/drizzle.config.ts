import { defineConfig } from "drizzle-kit";
import { z } from "zod";

/**
 * drizzle-kit config. Migrations and `db:studio` connect with the **direct**
 * (unpooled) Neon connection string; the pooled `DATABASE_URL` is only for the
 * apps (docs/08-infrastructure.md §2.1). `db:generate` is offline and only needs
 * the variable to be present.
 */
const envSchema = z.object({
  DATABASE_URL_UNPOOLED: z.url(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(
    "DATABASE_URL_UNPOOLED is not set. drizzle-kit needs the Neon direct (unpooled) " +
      "connection string — see packages/db/.env.example (docs/08-infrastructure.md §3).",
  );
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./migrations",
  schemaFilter: ["app", "leash"],
  dbCredentials: {
    url: parsed.data.DATABASE_URL_UNPOOLED,
  },
});
