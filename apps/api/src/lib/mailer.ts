import { logger as baseLogger } from "./logger";

/**
 * Transactional email for the auth flows (ADR-029).
 *
 * `ResendMailer` is used when `RESEND_API_KEY` + `MAIL_FROM` are set;
 * `ConsoleMailer` is the development/test fallback: it logs the action link and
 * keeps it in memory so the dev-only capture endpoint and the integration tests
 * can read it. Neither mailer ever receives a password — Better Auth sends
 * single-use links, not credentials.
 */
export interface MailMessage {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html?: string | undefined;
}

export interface CapturedEmail extends MailMessage {
  readonly sentAt: string;
}

export interface Mailer {
  readonly kind: "console" | "resend";
  send(message: MailMessage): Promise<void>;
}

/** Minimal logger surface so tests can pass a silent fake. */
export interface MailerLogger {
  info(fields: Record<string, unknown>, message: string): void;
  warn(fields: Record<string, unknown>, message: string): void;
}

const ACTION_URL = /https?:\/\/[^\s<>"']+/;

function firstLink(text: string): string | null {
  return ACTION_URL.exec(text)?.[0] ?? null;
}

/**
 * `jane@example.com` → `j***@example.com`. Used when a message has to be logged
 * outside development: enough to correlate a support report, not enough to leak
 * an address (AGENTS.md invariant #11).
 */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");

  if (at <= 0 || at === email.length - 1) {
    return "***";
  }

  return `${email.slice(0, 1)}***@${email.slice(at + 1)}`;
}

export interface ConsoleMailerOptions {
  /**
   * Log the action link (single-use token). Development only — the token is a
   * credential and must never reach a production log (invariant #11).
   */
  readonly logLinks?: boolean;
}

export class ConsoleMailer implements Mailer {
  readonly kind = "console" as const;
  readonly #logger: MailerLogger;
  readonly #captured: CapturedEmail[] = [];
  #logLinks: boolean;

  constructor(logger: MailerLogger, options: ConsoleMailerOptions = {}) {
    this.#logger = logger;
    this.#logLinks = options.logLinks ?? false;
  }

  /** Whether the action link is printed. Set from `NODE_ENV` by `selectMailer`. */
  get logLinks(): boolean {
    return this.#logLinks;
  }

  setLogLinks(enabled: boolean): void {
    this.#logLinks = enabled;
  }

  async send(message: MailMessage): Promise<void> {
    const captured: CapturedEmail = { ...message, sentAt: new Date().toISOString() };
    this.#captured.push(captured);

    // The link carries a single-use token: log it in development only.
    if (this.#logLinks) {
      this.#logger.info(
        { to: maskEmail(message.to), subject: message.subject, link: firstLink(message.text) },
        "auth email (console mailer)",
      );

      return;
    }

    this.#logger.info(
      { to: maskEmail(message.to), subject: message.subject },
      "auth email (console mailer)",
    );
  }

  /** Latest captured email for an address, for the dev endpoint and tests. */
  lastFor(to: string): CapturedEmail | undefined {
    const normalized = to.trim().toLowerCase();

    return [...this.#captured].reverse().find((email) => email.to.toLowerCase() === normalized);
  }

  all(): readonly CapturedEmail[] {
    return this.#captured;
  }

  clear(): void {
    this.#captured.length = 0;
  }
}

/** Sends through Resend's official SDK. */
export class ResendMailer implements Mailer {
  readonly kind = "resend" as const;
  readonly #apiKey: string;
  readonly #from: string;
  readonly #logger: MailerLogger;
  #client: import("resend").Resend | undefined;

  constructor(apiKey: string, from: string, logger: MailerLogger) {
    this.#apiKey = apiKey;
    this.#from = from;
    this.#logger = logger;
  }

  async #getClient(): Promise<import("resend").Resend> {
    if (this.#client === undefined) {
      const { Resend } = await import("resend");
      this.#client = new Resend(this.#apiKey);
    }

    return this.#client;
  }

  async send(message: MailMessage): Promise<void> {
    const client = await this.#getClient();
    const { error } = await client.emails.send({
      from: this.#from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      ...(message.html === undefined ? {} : { html: message.html }),
    });

    if (error !== null) {
      this.#logger.warn({ to: message.to, reason: error.message }, "auth email failed to send");
      throw new Error("AUTH_EMAIL_SEND_FAILED");
    }
  }
}

export interface MailerEnv {
  readonly NODE_ENV: "development" | "test" | "production";
  readonly RESEND_API_KEY?: string | undefined;
  readonly MAIL_FROM?: string | undefined;
}

export interface SelectedMailer {
  readonly mailer: Mailer;
  /** True when mail actually leaves the machine (verification can be required). */
  readonly transactional: boolean;
}

/**
 * Picks the mailer for an env. Resend requires both the key and a sender; a
 * half-configured Resend is an env-schema error, not a silent fallback.
 */
export function selectMailer(
  env: MailerEnv,
  logger: MailerLogger = baseLogger,
  consoleMailer: ConsoleMailer = consoleMailerSingleton(),
): SelectedMailer {
  if (env.RESEND_API_KEY !== undefined && env.MAIL_FROM !== undefined) {
    return {
      mailer: new ResendMailer(env.RESEND_API_KEY, env.MAIL_FROM, logger),
      transactional: true,
    };
  }

  if (env.NODE_ENV === "production") {
    logger.warn(
      { mailer: "console" },
      "no transactional mailer configured: auth emails go to the server log, email verification stays off and password reset is unavailable",
    );
  }

  // Never log action links (single-use tokens) outside development.
  consoleMailer.setLogLinks(env.NODE_ENV === "development");

  return { mailer: consoleMailer, transactional: false };
}

const CONSOLE_MAILER_KEY = Symbol.for("kitty.api.console-mailer");

interface ConsoleMailerRegistry {
  [CONSOLE_MAILER_KEY]?: ConsoleMailer;
}

/**
 * The process-wide console mailer. Cached on `globalThis` so `bun --hot`
 * reloads do not lose the captured links the dev endpoint and e2e read.
 */
export function consoleMailerSingleton(): ConsoleMailer {
  const registry = globalThis as ConsoleMailerRegistry;
  registry[CONSOLE_MAILER_KEY] ??= new ConsoleMailer(baseLogger, {
    logLinks: process.env.NODE_ENV === "development",
  });

  return registry[CONSOLE_MAILER_KEY];
}
