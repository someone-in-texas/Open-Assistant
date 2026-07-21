import rateLimit from "@fastify/rate-limit";
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

export const fixtureRateLimit = {
  config: {
    rateLimit: {
      max: 60,
      timeWindow: "1 minute",
    },
  },
};

export async function buildFixtureServer() {
  const app = Fastify({ logger: false });
  await app.register(rateLimit, { global: false });
  app.get("/", fixtureRateLimit, async (_request, reply) =>
    reply.type("text/html").send(await readFile(path.join(root, "article.html"), "utf8")),
  );
  app.get("/:file", fixtureRateLimit, async (request, reply) => {
    const file = String((request.params as { file?: unknown }).file);
    if (!allowed.has(file)) return reply.code(404).send("Not found");
    return reply.type("text/html").send(await readFile(path.join(root, file), "utf8"));
  });
  return app;
}
