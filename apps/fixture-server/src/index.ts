import Fastify from "fastify";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../../../packages/test-fixtures/pages");
const allowed = new Set([
  "article.html",
  "editor.html",
  "sensitive.html",
  "injection.html",
  "chatgpt.html",
]);
const app = Fastify({ logger: false });
app.get("/", async (_request, reply) =>
  reply.type("text/html").send(await readFile(path.join(root, "article.html"), "utf8")),
);
app.get("/:file", async (request, reply) => {
  const file = String((request.params as { file?: unknown }).file);
  if (!allowed.has(file)) return reply.code(404).send("Not found");
  return reply.type("text/html").send(await readFile(path.join(root, file), "utf8"));
});
await app.listen({
  host: "127.0.0.1",
  port: Number(process.env.OPEN_ASSISTANT_FIXTURE_PORT ?? 4173),
});
