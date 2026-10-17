import { z } from "zod";

/**
 * Email/password contracts shared by the web forms and the API.
 *
 * Better Auth owns password hashing, sessions and cookies; these schemas only
 * validate what the user typed before it leaves the browser. The same schemas
 * are used by `apps/web` (react-hook-form) and by server-side helpers that need
 * to parse auth payloads (docs/25-code-architecture.md §1).
 */
export const authEmailSchema = z
  .string()
  .trim()
  .min(1, "Enter your email")
  .max(254, "Email is too long")
  .pipe(z.email("Enter a valid email address"));

export const authPasswordSchema = z
  .string()
  .min(8, "Use at least 8 characters")
  .max(128, "Password is too long");

export const signInSchema = z.object({
  email: authEmailSchema,
  password: z.string().min(1, "Enter your password"),
});

export const signUpSchema = z.object({
  name: z.string().trim().min(2, "Enter your name").max(80, "Name is too long"),
  email: authEmailSchema,
  password: authPasswordSchema,
});

/** User object returned by `GET /api/auth/get-session`. */
export const authUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  emailVerified: z.boolean().optional(),
  image: z.string().nullable().optional(),
  /** Set by the demo seed; flagged accounts can use Kitty's demo AI key. */
  isDemo: z.boolean().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

/** Session object returned by `GET /api/auth/get-session`. */
export const authSessionInfoSchema = z.object({
  id: z.string(),
  userId: z.string(),
  expiresAt: z.string(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

/** `GET /api/auth/get-session` returns this object, or `null` when signed out. */
export const authSessionSchema = z.object({
  session: authSessionInfoSchema,
  user: authUserSchema,
});

/**
 * Accepts only same-origin relative paths as a post-auth redirect target.
 * Rejects absolute URLs, scheme-relative URLs and backslash tricks so `?next=`
 * cannot bounce a freshly signed-in user off-site.
 */
export function safeNextPath(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return null;
  }

  return value;
}
