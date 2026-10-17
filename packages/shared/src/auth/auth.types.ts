import type { z } from "zod";
import type {
  authConfigSchema,
  authSessionInfoSchema,
  authSessionSchema,
  authUserSchema,
  changePasswordSchema,
  deleteAccountSchema,
  demoLoginStatusSchema,
  signInSchema,
  signUpFormSchema,
  signUpSchema,
  updateProfileSchema,
} from "./auth.schema";

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignUpFormInput = z.infer<typeof signUpFormSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;
export type AuthUser = z.infer<typeof authUserSchema>;
export type AuthSessionInfo = z.infer<typeof authSessionInfoSchema>;
export type AuthSessionPayload = z.infer<typeof authSessionSchema>;
export type AuthConfigPayload = z.infer<typeof authConfigSchema>;
export type DemoLoginStatus = z.infer<typeof demoLoginStatusSchema>;
