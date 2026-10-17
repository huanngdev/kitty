import { z } from "zod";

/**
 * Runtime view of an MCP `tools/call` result used by the gateway tests.
 *
 * The SDK client returns a loosely typed result, so tests validate it at this
 * boundary with Zod (CODE_RULES.md §B) rather than casting — the same rule the
 * production code follows for every external boundary.
 */
export const toolResultSchema = z.object({
  content: z.array(z.object({ type: z.string(), text: z.string().optional() }).loose()),
  structuredContent: z.record(z.string(), z.unknown()).optional(),
  isError: z.boolean().optional(),
});

export type ToolResult = z.infer<typeof toolResultSchema>;

/** Validates a raw MCP client result into the shape the tests assert on. */
export function parseToolResult(result: unknown): ToolResult {
  return toolResultSchema.parse(result);
}

/** Joins the text blocks of a tool result into one string. */
export function toolResultText(result: ToolResult): string {
  return result.content.map((block) => block.text ?? "").join("\n");
}
