import { pino } from "pino";

/**
 * Structured JSON logger (CODE_RULES.md §D). Secret, token and PII-ish fields
 * are redacted so they can never reach the logs.
 */
export const logger = pino({
  level: process.env.NODE_ENV === "test" ? "silent" : "info",
  redact: {
    paths: [
      "authorization",
      "cookie",
      "password",
      "secret",
      "token",
      "apiKey",
      "clientSecret",
      "accessToken",
      "refreshToken",
      "headers.authorization",
      "headers.cookie",
      "req.headers.authorization",
      "req.headers.cookie",
      "res.headers.set-cookie",
    ],
    censor: "[redacted]",
  },
});
