import type { z } from "zod";
import type {
  authSessionInfoSchema,
  authSessionSchema,
  authUserSchema,
  demoLoginStatusSchema,
  signInSchema,
  signUpSchema,
} from "./auth.schema";

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
export type AuthUser = z.infer<typeof authUserSchema>;
export type AuthSessionInfo = z.infer<typeof authSessionInfoSchema>;
export type AuthSessionPayload = z.infer<typeof authSessionSchema>;
export type DemoLoginStatus = z.infer<typeof demoLoginStatusSchema>;
