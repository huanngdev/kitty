import { z } from "zod";

/**
 * Auth contracts shared by the web forms and the API.
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

/** Sign-up form: the API only needs `signUpSchema`, the confirm field is UI-side. */
export const signUpFormSchema = signUpSchema
  .extend({ confirmPassword: z.string().min(1, "Confirm your password") })
  .refine((values) => values.password === values.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords don't match",
  });

/** Social sign-in providers Kitty supports (docs/23 F1, ADR-028). */
export const socialProviderIds = ["github", "paypal"] as const;

export const socialProviderIdSchema = z.enum(socialProviderIds);

export type SocialProviderId = z.infer<typeof socialProviderIdSchema>;

/**
 * `GET /api/auth-config` — which sign-in methods this deployment configured.
 * The UI renders only the buttons listed in `providers`; `emailPassword` is
 * always available. `emailVerification` tells the UI whether to show the
 * "verify your email" banner (verification is off in development).
 */
export const authConfigSchema = z.object({
  emailPassword: z.literal(true),
  providers: z.array(socialProviderIdSchema),
  demo: z.boolean(),
  emailVerification: z.boolean(),
});

export type AuthConfig = z.infer<typeof authConfigSchema>;

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

/** `GET /api/demo-sign-in/status`. Only show the demo button when enabled. */
export const demoLoginStatusSchema = z.object({
  enabled: z.boolean(),
});

/** Settings → Account: change the display name. */
export const updateProfileSchema = z.object({
  name: z.string().trim().min(2, "Enter your name").max(80, "Name is too long"),
});

/** Settings → Account: change the password with the current one. */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    newPassword: authPasswordSchema,
    confirmPassword: z.string().min(1, "Confirm your new password"),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords don't match" as const,
  })
  .refine((values) => values.newPassword !== values.currentPassword, {
    path: ["newPassword"],
    message: "Choose a different password" as const,
  });

/** Settings → Account: delete the account (type the word to confirm). */
export const deleteAccountSchema = z.object({
  confirm: z.literal("DELETE", { error: 'Type "DELETE" to confirm' }),
});

/**
 * Password strength hint for the sign-up form. Purely presentational — the
 * server enforces the length limits above, this only guides the user.
 */
export type PasswordStrength = {
  score: 0 | 1 | 2 | 3 | 4;
  label: "too short" | "weak" | "fair" | "good" | "strong";
};

export function passwordStrength(password: string): PasswordStrength {
  if (password.length < 8) {
    return { score: 0, label: "too short" };
  }

  const classes =
    Number(/[a-z]/.test(password)) +
    Number(/[A-Z]/.test(password)) +
    Number(/[0-9]/.test(password)) +
    Number(/[^A-Za-z0-9]/.test(password));
  const long = password.length >= 12 ? 1 : 0;
  const raw = Math.min(4, Math.max(1, classes + long));

  switch (raw) {
    case 1:
      return { score: 1, label: "weak" };
    case 2:
      return { score: 2, label: "fair" };
    case 3:
      return { score: 3, label: "good" };
    default:
      return { score: 4, label: "strong" };
  }
}
