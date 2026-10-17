import { describe, expect, test } from "bun:test";
import { buildPasswordResetEmail, buildVerificationEmail } from "../../src/lib/auth-emails";
import { ConsoleMailer, ResendMailer, type MailerLogger, selectMailer } from "../../src/lib/mailer";

const silentLogger: MailerLogger = { info: () => {}, warn: () => {} };

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
});

describe("ConsoleMailer", () => {
  test("captures messages and logs the action link, never a password", async () => {
    const recorder = recordingLogger();
    const mailer = new ConsoleMailer(recorder.logger);
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
