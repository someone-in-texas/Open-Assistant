import { z } from "zod";

const boundedText = (maximum: number) => z.string().max(maximum);
const isoDate = z.iso.datetime({ offset: true });
const webUrl = z.url().refine((value) => ["http:", "https:"].includes(new URL(value).protocol));

export const sourceChunkSchema = z
  .object({
    chunkId: z.string().min(1).max(128),
    order: z.number().int().nonnegative(),
    headingPath: z.array(boundedText(500)).max(16),
    text: boundedText(25_000),
    locator: z
      .object({
        cssPath: boundedText(2_000).optional(),
        textQuote: z
          .object({
            exact: boundedText(2_000),
            prefix: boundedText(500).optional(),
            suffix: boundedText(500).optional(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const contextSourceSchema = z
  .object({
    sourceId: z.string().min(1).max(128),
    tabId: z.number().int().nonnegative().optional(),
    frameId: z.number().int().nonnegative().optional(),
    title: boundedText(1_000),
    url: webUrl,
    origin: webUrl,
    contentHash: z.string().regex(/^[a-f0-9]{64}$/u),
    extractionMode: z.enum([
      "selection",
      "selection-with-context",
      "readable-page",
      "viewport",
      "accessible-dom",
      "screenshot",
    ]),
    trust: z.literal("untrusted-web-content"),
    chunks: z.array(sourceChunkSchema).max(500),
    truncated: z.boolean().optional(),
  })
  .strict();

export const contextBundleSchema = z
  .object({
    schemaVersion: z.literal(1),
    conversationId: z.uuid(),
    createdAt: isoDate,
    userIntent: boundedText(20_000),
    sources: z.array(contextSourceSchema).min(1).max(10),
  })
  .strict();

export type SourceChunk = z.infer<typeof sourceChunkSchema>;
export type ContextSource = z.infer<typeof contextSourceSchema>;
export type ContextBundle = z.infer<typeof contextBundleSchema>;

export const editProposalSchema = z
  .object({
    schemaVersion: z.literal(1),
    proposalId: z.uuid(),
    originalText: boundedText(20_000),
    replacementText: boundedText(82_000),
    explanation: boundedText(4_000).optional(),
    warnings: z.array(boundedText(500)).max(20),
  })
  .strict();
export type EditProposal = z.infer<typeof editProposalSchema>;

export const allowedKeySchema = z.enum([
  "Enter",
  "Escape",
  "Tab",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  "Backspace",
  "Delete",
]);

export const agentActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("click"), elementId: z.string().min(1).max(128) }).strict(),
  z.object({ type: z.literal("focus"), elementId: z.string().min(1).max(128) }).strict(),
  z
    .object({
      type: z.literal("type"),
      elementId: z.string().min(1).max(128),
      text: boundedText(10_000),
      replace: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("select"),
      elementId: z.string().min(1).max(128),
      optionValue: boundedText(1_000),
    })
    .strict(),
  z
    .object({
      type: z.literal("scroll"),
      direction: z.enum(["up", "down"]),
      amount: z.enum(["small", "page"]),
    })
    .strict(),
  z.object({ type: z.literal("press_key"), key: allowedKeySchema }).strict(),
  z.object({ type: z.literal("navigate"), url: webUrl }).strict(),
  z.object({ type: z.literal("go_back") }).strict(),
  z.object({ type: z.literal("wait"), milliseconds: z.number().int().min(0).max(5_000) }).strict(),
  z.object({ type: z.literal("done"), summary: boundedText(4_000) }).strict(),
]);
export type AgentAction = z.infer<typeof agentActionSchema>;

export const agentLeaseSchema = z
  .object({
    leaseId: z.uuid(),
    tabId: z.number().int().nonnegative(),
    windowId: z.number().int().nonnegative(),
    origin: webUrl,
    issuedAt: isoDate,
    expiresAt: isoDate,
    mode: z.enum(["read", "interact"]),
    allowedActionClasses: z.array(z.enum(["observe", "navigate", "interact"])).max(3),
    maxActions: z.number().int().min(1).max(50),
  })
  .strict();
export type AgentLease = z.infer<typeof agentLeaseSchema>;

export const auditEventSchema = z
  .object({
    eventId: z.uuid(),
    timestamp: isoDate,
    leaseId: z.uuid(),
    tabId: z.number().int().nonnegative(),
    origin: webUrl,
    category: z.enum([
      "observation",
      "proposal",
      "confirmation",
      "execution",
      "navigation",
      "policy-block",
      "error",
      "stop",
    ]),
    summary: boundedText(2_000),
    redactedDetails: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
export type AgentAuditEvent = z.infer<typeof auditEventSchema>;

export const responseRequestSchema = z
  .object({
    sessionId: z.uuid(),
    prompt: boundedText(20_000),
    context: contextBundleSchema,
    mode: z.enum(["chat", "edit"]),
  })
  .strict();
export type ResponseRequest = z.infer<typeof responseRequestSchema>;

export const streamEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("start"), requestId: z.string().min(1).max(128) }).strict(),
  z.object({ type: z.literal("delta"), text: boundedText(50_000) }).strict(),
  z
    .object({
      type: z.literal("citation"),
      sourceId: z.string().min(1).max(128),
      chunkId: z.string().min(1).max(128),
    })
    .strict(),
  z.object({ type: z.literal("edit"), proposal: editProposalSchema }).strict(),
  z.object({ type: z.literal("done") }).strict(),
  z
    .object({
      type: z.literal("error"),
      code: z.enum(["auth", "quota", "policy", "network", "model", "validation"]),
      message: boundedText(2_000),
      retryable: z.boolean(),
    })
    .strict(),
]);
export type StreamEvent = z.infer<typeof streamEventSchema>;

export const runtimeRequestSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("GET_ACTIVE_CONTEXT"), requestId: z.uuid() }).strict(),
  z
    .object({
      type: z.literal("EXTRACT_TAB"),
      requestId: z.uuid(),
      tabId: z.number().int().nonnegative(),
      mode: z.enum(["selection", "selection-with-context", "readable-page", "viewport"]),
    })
    .strict(),
  z
    .object({ type: z.literal("SEND_CHAT"), requestId: z.uuid(), request: responseRequestSchema })
    .strict(),
  z
    .object({ type: z.literal("STOP_REQUEST"), requestId: z.uuid(), targetRequestId: z.uuid() })
    .strict(),
  z.object({ type: z.literal("GET_STATE"), requestId: z.uuid() }).strict(),
  z.object({ type: z.literal("SIGN_IN"), requestId: z.uuid() }).strict(),
  z.object({ type: z.literal("SIGN_OUT"), requestId: z.uuid() }).strict(),
  z.object({ type: z.literal("AUTH_STATUS"), requestId: z.uuid() }).strict(),
  z.object({ type: z.literal("LIST_TABS"), requestId: z.uuid() }).strict(),
  z
    .object({
      type: z.literal("EXTRACT_TABS"),
      requestId: z.uuid(),
      tabIds: z.array(z.number().int().nonnegative()).min(1).max(10),
    })
    .strict(),
  z
    .object({
      type: z.literal("SEND_TO_CHATGPT"),
      requestId: z.uuid(),
      text: boundedText(300_000),
    })
    .strict(),
  z
    .object({ type: z.literal("APPLY_EDIT"), requestId: z.uuid(), proposal: editProposalSchema })
    .strict(),
  z.object({ type: z.literal("UNDO_EDIT"), requestId: z.uuid() }).strict(),
  z.object({ type: z.literal("STOP_AGENT"), requestId: z.uuid() }).strict(),
]);
export type RuntimeRequest = z.infer<typeof runtimeRequestSchema>;

export const contentCommandSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("EXTRACT"),
      mode: z.enum(["selection", "selection-with-context", "readable-page", "viewport"]),
    })
    .strict(),
  z.object({ type: z.literal("APPLY_EDIT"), proposal: editProposalSchema }).strict(),
  z.object({ type: z.literal("UNDO_EDIT") }).strict(),
  z.object({ type: z.literal("HIGHLIGHT_CHUNK"), chunkId: z.string().min(1).max(128) }).strict(),
  z.object({ type: z.literal("CHATGPT_INSERT"), text: boundedText(300_000) }).strict(),
]);
export type ContentCommand = z.infer<typeof contentCommandSchema>;

export const nativeRequestSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("status"), requestId: z.uuid() }).strict(),
  z
    .object({ type: z.literal("store_key"), requestId: z.uuid(), apiKey: boundedText(512) })
    .strict(),
  z.object({ type: z.literal("delete_key"), requestId: z.uuid() }).strict(),
  z
    .object({ type: z.literal("request"), requestId: z.uuid(), payload: responseRequestSchema })
    .strict(),
]);
export type NativeRequest = z.infer<typeof nativeRequestSchema>;

export function parseRuntimeRequest(input: unknown): RuntimeRequest {
  return runtimeRequestSchema.parse(input);
}
