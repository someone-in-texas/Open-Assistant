import { describe, expect, it } from "vitest";
import {
  agentActionSchema,
  contextBundleSchema,
  editProposalSchema,
  parseRuntimeRequest,
  streamEventSchema,
} from "@open-assistant/protocol";

const source = {
  sourceId: "source-1",
  title: "Example",
  url: "https://example.com/page",
  origin: "https://example.com",
  contentHash: "a".repeat(64),
  extractionMode: "readable-page" as const,
  trust: "untrusted-web-content" as const,
  chunks: [{ chunkId: "chunk-1", order: 0, headingPath: [], text: "Body" }],
};

describe("protocol schemas", () => {
  it("accepts a bounded context bundle", () => {
    expect(
      contextBundleSchema.parse({
        schemaVersion: 1,
        conversationId: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        userIntent: "Summarize",
        sources: [source],
      }).sources,
    ).toHaveLength(1);
  });

  it("rejects unknown context fields and unsafe URL schemes", () => {
    expect(() =>
      contextBundleSchema.parse({
        schemaVersion: 1,
        conversationId: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        userIntent: "x",
        sources: [{ ...source, url: "javascript:alert(1)", extra: true }],
      }),
    ).toThrow();
  });

  it("strictly validates runtime requests", () => {
    const parsed = parseRuntimeRequest({
      type: "EXTRACT_TABS",
      requestId: crypto.randomUUID(),
      tabIds: [1, 2],
    });
    expect(parsed.type).toBe("EXTRACT_TABS");
    expect(() =>
      parseRuntimeRequest({
        type: "EXTRACT_TABS",
        requestId: crypto.randomUUID(),
        tabIds: Array.from({ length: 11 }, (_, index) => index),
      }),
    ).toThrow();
    expect(() =>
      parseRuntimeRequest({ type: "UNKNOWN", requestId: crypto.randomUUID() }),
    ).toThrow();
  });

  it("rejects arbitrary selectors and unknown agent fields", () => {
    expect(agentActionSchema.safeParse({ type: "click", elementId: "e1" }).success).toBe(true);
    expect(
      agentActionSchema.safeParse({ type: "click", selector: "#pay", elementId: "e1" }).success,
    ).toBe(false);
    expect(agentActionSchema.safeParse({ type: "wait", milliseconds: 5001 }).success).toBe(false);
    expect(agentActionSchema.safeParse({ type: "press_key", key: "Meta+L" }).success).toBe(false);
  });

  it("bounds edit proposals and stream events", () => {
    const proposal = {
      schemaVersion: 1 as const,
      proposalId: crypto.randomUUID(),
      originalText: "old",
      replacementText: "new",
      warnings: [],
    };
    expect(editProposalSchema.parse(proposal).replacementText).toBe("new");
    expect(streamEventSchema.parse({ type: "edit", proposal }).type).toBe("edit");
    expect(
      streamEventSchema.safeParse({ type: "error", code: "secret", message: "x", retryable: false })
        .success,
    ).toBe(false);
  });
});
