import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  MAX_ACTIVITY_LIMIT,
  leashActivityInputSchema,
  leashActivityOutputSchema,
  leashCheckInputSchema,
  leashCheckOutputSchema,
  leashIntentStatusInputSchema,
  leashIntentStatusOutputSchema,
  leashRequestPayoutInputSchema,
  leashRequestPayoutOutputSchema,
  leashStatusOutputSchema,
  type LeashActivityOutput,
  type LeashCheckOutput,
  type LeashIntentStatusOutput,
  type LeashRequestPayoutOutput,
  type LeashStatusOutput,
} from "@kitty/shared/leash-agent";
import { z } from "zod";
import { AppError } from "../../lib/errors";
import { logger } from "../../lib/logger";
import type { AgentLeashService } from "./agent-leash.service";

/**
 * MCP tool surface for agents (docs/05 §13, docs/10 §2).
 *
 * Only the five in-scope tools are registered: `create_invoice`, reminders,
 * refunds and `delegate` arrive in later tasks and an unregistered tool is
 * simply absent from `tools/list`, so an agent cannot even ask for it. Every
 * handler receives the authenticated `agentId` by closure — no tool accepts a
 * `leashId` or `agentId` argument (docs/10 §2).
 *
 * Results are returned as structured content plus a short text summary.
 * `justification` is echoed as `<untrusted_content>` when it appears in a
 * summary: it is agent-supplied text for display only, never an instruction
 * (AGENTS.md invariant #10).
 */

/** The clause docs/05 §13 requires on every money tool description. */
const DENIAL_CLAUSE =
  "Denials are final for this request. Do not retry with modified payees or amounts to work around a denial; report the denial to the organizer.";

export interface LeashToolContext {
  readonly agentId: string;
  readonly service: AgentLeashService;
}

/** Wraps untrusted text so a model treats it as data, never instructions. */
export function wrapUntrusted(text: string): string {
  return `<untrusted_content>${text}</untrusted_content>`;
}

/**
 * Maps a thrown error to an MCP tool error result, always in the shared Kitty
 * error shape so an agent sees a stable machine `code` (for example
 * `INTENT_ID_REUSED`). Unexpected errors are logged and collapsed to `INTERNAL`
 * — no stack trace or secret leaks out (CODE_RULES.md §D).
 */
export function toolErrorResult(error: unknown): CallToolResult {
  if (error instanceof AppError) {
    return errorContent(error.code, error.details);
  }

  logger.error({ err: error }, "mcp tool failed");

  return errorContent("INTERNAL", undefined);
}

function errorContent(code: string, details: unknown): CallToolResult {
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: JSON.stringify({ error: { code, message: code, details: details ?? null } }),
      },
    ],
  };
}

function reasonText(reasons: ReadonlyArray<{ code: string; details: string }>): string {
  if (reasons.length === 0) {
    return "";
  }

  return reasons.map((reason) => `${reason.code}: ${reason.details}`).join("; ");
}

function statusSummary(output: LeashStatusOutput): string {
  const limits = output.limits;
  const parts = [
    `Leash ${output.leashId} is ${output.status}.`,
    `Available ${output.available} ${output.currency} of ${output.allocation} allocated`,
    `(held ${output.held}, spent in the last 24h ${output.spent24h}).`,
    `Limits: per-transaction ${limits.perTxMax}, daily ${limits.dailyMax}, ${limits.maxTxPerHour}/hour.`,
    `Expires ${output.expiresAt}.`,
    `Allowed actions: ${output.allowedActions.join(", ") || "none"}.`,
    `Allowed payees: ${output.allowedPayees.join(", ") || "none"}.`,
    output.stepUpAbove === null
      ? "No step-up threshold."
      : `Step-up approval required above ${output.stepUpAbove}.`,
  ];

  return parts.join(" ");
}

function checkSummary(output: LeashCheckOutput): string {
  if (output.decision === "ALLOW") {
    return "Decision ALLOW: the leash would accept this intent (nothing was reserved).";
  }

  return `Decision ${output.decision}: ${reasonText(output.reasons)}`;
}

function payoutSummary(output: LeashRequestPayoutOutput): string {
  const parts = [`Decision ${output.decision}; intent ${output.intentId} is ${output.status}.`];

  if (output.reasons.length > 0) {
    parts.push(`Reasons: ${reasonText(output.reasons)}.`);
  }

  if (output.approvalId !== null) {
    parts.push(`Waiting for organizer approval ${output.approvalId}.`);
  }

  parts.push(`Available ${output.available}.`);
  parts.push(DENIAL_CLAUSE);

  return parts.join(" ");
}

function intentStatusSummary(output: LeashIntentStatusOutput): string {
  const parts = [
    `Intent ${output.intentId} (${output.action}) is ${output.status} with decision ${output.decision}.`,
    `Amount ${output.amount} ${output.currency}`,
    output.payee === null ? "no payee" : `to ${output.payee}`,
    output.paypalStatus === null
      ? "not submitted to PayPal yet"
      : `PayPal status ${output.paypalStatus}.`,
  ];

  if (output.reasons.length > 0) {
    parts.push(`Reasons: ${reasonText(output.reasons)}.`);
  }

  if (output.justification !== null) {
    parts.push(`Agent justification (untrusted): ${wrapUntrusted(output.justification)}`);
  }

  return parts.join(" ");
}

function activitySummary(output: LeashActivityOutput): string {
  if (output.items.length === 0) {
    return "No intents recorded on this leash yet.";
  }

  const lines = output.items.map(
    (item) =>
      `- ${item.intentId} ${item.action} ${item.amount} ${item.currency} → ${item.payee ?? "no payee"}: ${item.decision} / ${item.status} at ${item.createdAt}`,
  );

  return [`Last ${output.items.length} intents:`, ...lines].join("\n");
}

/**
 * Registers the five in-scope tools on a per-request server, closing over the
 * authenticated agent (docs/10 §2).
 */
export function registerLeashTools(server: McpServer, ctx: LeashToolContext): void {
  server.registerTool(
    "leash_status",
    {
      title: "Leash status",
      description: `Report this agent's own leash: status, allocation, available and held balance, rolling limits, allowed actions and payees, step-up threshold and expiry. Never name a leash: the gateway resolves the leash of the calling agent.`,
      inputSchema: z.object({}),
      outputSchema: leashStatusOutputSchema,
    },
    async (): Promise<CallToolResult> => {
      try {
        const output = leashStatusOutputSchema.parse(await ctx.service.getStatus(ctx.agentId));

        return {
          structuredContent: output,
          content: [{ type: "text", text: statusSummary(output) }],
        };
      } catch (error) {
        return toolErrorResult(error);
      }
    },
  );

  server.registerTool(
    "leash_check",
    {
      title: "Check a spend intent",
      description: `Dry-run a spend intent against this agent's leash: returns the policy Decision and reason codes without reserving money or writing an intent. ${DENIAL_CLAUSE}`,
      inputSchema: leashCheckInputSchema,
      outputSchema: leashCheckOutputSchema,
    },
    async (input): Promise<CallToolResult> => {
      try {
        const output = leashCheckOutputSchema.parse(await ctx.service.check(ctx.agentId, input));

        return {
          structuredContent: output,
          content: [{ type: "text", text: checkSummary(output) }],
        };
      } catch (error) {
        return toolErrorResult(error);
      }
    },
  );

  server.registerTool(
    "leash_request_payout",
    {
      title: "Request a payout",
      description: `Request a payout from this agent's leash to an allowed payee. The gateway decides with the leash policy, reserves the money and returns the Decision, status and remaining available balance. Reuse the same intentId to retry idempotently; a different body with the same intentId is rejected with INTENT_ID_REUSED. ${DENIAL_CLAUSE}`,
      inputSchema: leashRequestPayoutInputSchema,
      outputSchema: leashRequestPayoutOutputSchema,
    },
    async (input): Promise<CallToolResult> => {
      try {
        const output = leashRequestPayoutOutputSchema.parse(
          await ctx.service.requestPayout(ctx.agentId, input),
        );

        return {
          structuredContent: output,
          content: [{ type: "text", text: payoutSummary(output) }],
        };
      } catch (error) {
        return toolErrorResult(error);
      }
    },
  );

  server.registerTool(
    "leash_intent_status",
    {
      title: "Intent status",
      description: `Read one of this agent's intents: decision, status, reason codes and PayPal status.`,
      inputSchema: leashIntentStatusInputSchema,
      outputSchema: leashIntentStatusOutputSchema,
    },
    async (input): Promise<CallToolResult> => {
      try {
        const output = leashIntentStatusOutputSchema.parse(
          await ctx.service.getIntentStatus(ctx.agentId, input.intentId),
        );

        return {
          structuredContent: output,
          content: [{ type: "text", text: intentStatusSummary(output) }],
        };
      } catch (error) {
        return toolErrorResult(error);
      }
    },
  );

  server.registerTool(
    "leash_activity",
    {
      title: "Recent activity",
      description: `List the most recent intents of this agent's leash (at most ${MAX_ACTIVITY_LIMIT}).`,
      inputSchema: leashActivityInputSchema,
      outputSchema: leashActivityOutputSchema,
    },
    async (input): Promise<CallToolResult> => {
      try {
        const output = leashActivityOutputSchema.parse(
          await ctx.service.listActivity(ctx.agentId, input.limit),
        );

        return {
          structuredContent: output,
          content: [{ type: "text", text: activitySummary(output) }],
        };
      } catch (error) {
        return toolErrorResult(error);
      }
    },
  );
}
