import type { MailMessage } from "./mailer";

/**
 * Auth email copy (English, docs/23 F1). Each message carries a single-use
 * link and never a password or a session token.
 */
export type AuthEmailContent = Omit<MailMessage, "to">;

function greeting(name: string): string {
  const trimmed = name.trim();

  return trimmed.length === 0 ? "Hi" : `Hi ${trimmed}`;
}

export function buildVerificationEmail(input: { name: string; url: string }): AuthEmailContent {
  return {
    subject: "Verify your Kitty email",
    text: [
      `${greeting(input.name)},`,
      "",
      "Confirm your email to finish setting up your Kitty account:",
      input.url,
      "",
      "The link expires in 24 hours. If you didn't create a Kitty account, you can ignore this email.",
    ].join("\n"),
  };
}

export function buildPasswordResetEmail(input: { name: string; url: string }): AuthEmailContent {
  return {
    subject: "Reset your Kitty password",
    text: [
      `${greeting(input.name)},`,
      "",
      "Someone asked to reset the password for this Kitty account. Choose a new one here:",
      input.url,
      "",
      "The link expires in 1 hour. If this wasn't you, ignore this email — your password stays the same.",
    ].join("\n"),
  };
}
