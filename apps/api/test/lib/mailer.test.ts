import { describe, expect, test } from "bun:test";
import { buildPasswordResetEmail, buildVerificationEmail } from "../../src/lib/auth-emails";
import {
  ConsoleMailer,
  ResendMailer,
  type MailerLogger,
  maskEmail,
  selectMailer,
} from "../../src/lib/mailer";

const silentLogger: MailerLogger = { info: () => {}, warn: () => {} };

/** Captures the structured fields of every log call (to assert what is logged). */
function fieldRecorder(): { logger: MailerLogger; entries: Record<string, unknown>[] } {
  const entries: Record<string, unknown>[] = [];

  return {
    entries,
    logger: {
      info: (fields) => entries.push(fields),
      warn: () => {},
    },
  };
}

function recordingLogger(): { logger: MailerLogger; lines: string[] } {
  const lines: string[] = [];

  return {
    lines,
    logger: {
      info: (_fields, message) => lines.push(message),
      warn: (_fields, message) => lines.push(message),
    },
  };
}

describe("selectMailer", () => {
  test("falls back to the console mailer when Resend is not configured", () => {
    const selected = selectMailer({ NODE_ENV: "development" }, silentLogger);

    expect(selected.mailer.kind).toBe("console");
    expect(selected.transactional).toBe(false);
  });

  test("uses Resend when the key and sender are both set", () => {
    const selected = selectMailer(
      { NODE_ENV: "production", RESEND_API_KEY: "re_test", MAIL_FROM: "Kitty <hi@kitty.test>" },
      silentLogger,
    );

    expect(selected.mailer).toBeInstanceOf(ResendMailer);
    expect(selected.transactional).toBe(true);
  });

  test("warns when production has no real mailer", () => {
    const recorder = recordingLogger();

    selectMailer({ NODE_ENV: "production" }, recorder.logger);

    expect(recorder.lines.join(" ")).toContain("no transactional mailer");
  });

  test("returns the injected console mailer so the dev endpoint sees the same links", () => {
    const consoleMailer = new ConsoleMailer(silentLogger);
    const selected = selectMailer({ NODE_ENV: "development" }, silentLogger, consoleMailer);

    expect(selected.mailer).toBe(consoleMailer);
  });

  test("enables link logging in development only", () => {
    const devMailer = new ConsoleMailer(silentLogger);
    const prodMailer = new ConsoleMailer(silentLogger);

    selectMailer({ NODE_ENV: "development" }, silentLogger, devMailer);
    selectMailer({ NODE_ENV: "production" }, silentLogger, prodMailer);

    expect(devMailer.logLinks).toBe(true);
    expect(prodMailer.logLinks).toBe(false);
  });

  test("production without Resend never logs an action link", async () => {
    const recorder = fieldRecorder();
    const consoleMailer = new ConsoleMailer(recorder.logger);
    const selected = selectMailer({ NODE_ENV: "production" }, recorder.logger, consoleMailer);

    await selected.mailer.send({
      to: "jane@example.com",
      ...buildPasswordResetEmail({
        name: "Jane",
        url: "http://localhost:3000/reset-password?token=secret-token",
      }),
    });

    const entry = recorder.entries.at(-1) ?? {};

    expect(entry.link).toBeUndefined();
    expect(entry.to).toBe("j***@example.com");
    expect(JSON.stringify(recorder.entries)).not.toContain("secret-token");
    expect(JSON.stringify(recorder.entries)).not.toContain("jane@example.com");
  });
});

describe("maskEmail", () => {
  test("keeps the first character and the domain", () => {
    expect(maskEmail("jane@example.com")).toBe("j***@example.com");
    expect(maskEmail("a@b.c")).toBe("a***@b.c");
  });

  test("hides malformed addresses entirely", () => {
    expect(maskEmail("no-at-sign")).toBe("***");
    expect(maskEmail("@example.com")).toBe("***");
    expect(maskEmail("jane@")).toBe("***");
  });
});

describe("ConsoleMailer", () => {
  test("captures messages and logs the action link in development, never a password", async () => {
    const recorder = recordingLogger();
    const mailer = new ConsoleMailer(recorder.logger, { logLinks: true });
    const content = buildVerificationEmail({
      name: "Mai",
      url: "http://localhost:3000/verify-email?token=abc123",
    });

    await mailer.send({ to: "Mai@Example.com", ...content });

    expect(mailer.lastFor("mai@example.com")?.subject).toBe("Verify your Kitty email");
    expect(mailer.all()).toHaveLength(1);
    expect(recorder.lines[0]).toBe("auth email (console mailer)");

    mailer.clear();
    expect(mailer.all()).toHaveLength(0);
  });

  test("lastFor returns undefined for an unknown address", () => {
    const mailer = new ConsoleMailer(silentLogger);

    expect(mailer.lastFor("nobody@example.com")).toBeUndefined();
  });

  test("defaults to not logging links and masks the recipient", async () => {
    const recorder = fieldRecorder();
    const mailer = new ConsoleMailer(recorder.logger);

    await mailer.send({
      to: "organizer@demo.kitty",
      ...buildVerificationEmail({ name: "Organizer", url: "http://x/verify-email?token=tok" }),
    });

    const entry = recorder.entries.at(-1) ?? {};

    expect(mailer.logLinks).toBe(false);
    expect(entry.link).toBeUndefined();
    expect(entry.to).toBe("o***@demo.kitty");
    // The capture still holds the real message for the dev endpoint.
    expect(mailer.lastFor("organizer@demo.kitty")?.text).toContain("token=tok");
  });
});

describe("auth email copy", () => {
  test("verification email carries the link and never a password", () => {
    const email = buildVerificationEmail({
      name: "Mai",
      url: "http://localhost:3000/verify-email?token=tok",
    });

    expect(email.subject).toContain("Verify");
    expect(email.text).toContain("http://localhost:3000/verify-email?token=tok");
    expect(email.text).toContain("24 hours");
    expect(email.text.toLowerCase()).not.toContain("password");
  });

  test("reset email carries the link and the 1-hour expiry", () => {
    const email = buildPasswordResetEmail({
      name: "Mai",
      url: "http://localhost:3000/reset-password?token=tok",
    });

    expect(email.subject).toContain("Reset");
    expect(email.text).toContain("http://localhost:3000/reset-password?token=tok");
    expect(email.text).toContain("1 hour");
  });
});
