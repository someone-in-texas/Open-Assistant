import { responseRequestSchema, type StreamEvent } from "@open-assistant/protocol";
import Fastify, { type FastifyReply } from "fastify";

const app = Fastify({ logger: false, bodyLimit: 1_048_576 });
app.get("/v1/health", async () => ({ status: "ok", mode: "mock" }));
app.get("/v1/me", async () => ({ subject: "mock-user", service: "mock-relay" }));
app.post("/v1/sessions", async () => ({
  sessionId: crypto.randomUUID(),
  createdAt: new Date().toISOString(),
}));
app.delete("/v1/sessions/:id", async (_request, reply) => reply.code(204).send());

function event(reply: FastifyReply, payload: StreamEvent): void {
  reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
}

app.post("/v1/responses/stream", async (request, reply) => {
  const body = responseRequestSchema.parse(request.body);
  reply.hijack();
  reply.raw.writeHead(200, {
    "content-type": "text/event-stream",
    "access-control-allow-origin": "*",
    "cache-control": "no-store",
  });
  event(reply, { type: "start", requestId: request.id });
  const first = body.context.sources[0];
  const title = first?.title ?? "approved context";
  for (const delta of [
    `Mock response about `,
    `${title}. `,
    `This deterministic local model received ${body.context.sources.length} approved source(s).`,
  ]) {
    event(reply, { type: "delta", text: delta });
  }
  const chunk = first?.chunks[0];
  if (first && chunk)
    event(reply, { type: "citation", sourceId: first.sourceId, chunkId: chunk.chunkId });
  event(reply, { type: "done" });
  reply.raw.end();
});

app.post("/v1/responses", async (request) => {
  const body = responseRequestSchema.parse(request.body);
  return { requestId: request.id, text: `Mock response for ${body.prompt}`, citations: [] };
});
app.post("/v1/agent/turn", async (_request, reply) =>
  reply.code(403).send({ error: "Agent disabled in mock release mode." }),
);
app.post("/v1/feedback", async (_request, reply) =>
  reply.code(202).send({ accepted: true, retained: false }),
);
app.delete("/v1/account/data", async (_request, reply) => reply.code(204).send());

await app.listen({ host: "127.0.0.1", port: Number(process.env.OPEN_ASSISTANT_MOCK_PORT ?? 8787) });
