// @vitest-environment node

import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { expensiveRateLimit, mutationRateLimit, standardRateLimit } from "../src/rate-limits.js";

async function expectLimit(
  options: typeof standardRateLimit,
  allowedRequests: number,
): Promise<void> {
  const app = Fastify({ logger: false });
  await app.register(rateLimit, { global: false });
  app.get("/guarded", options, async () => ({ ok: true }));

  for (let index = 0; index < allowedRequests; index += 1) {
    expect((await app.inject({ method: "GET", url: "/guarded" })).statusCode).toBe(200);
  }
  expect((await app.inject({ method: "GET", url: "/guarded" })).statusCode).toBe(429);
  await app.close();
}

describe("relay route rate limits", () => {
  it("enforces the standard authenticated-route budget", async () => {
    await expectLimit(standardRateLimit, 60);
  });

  it("enforces the mutation-route budget", async () => {
    await expectLimit(mutationRateLimit, 30);
  });

  it("enforces the expensive model and destructive-route budget", async () => {
    await expectLimit(expensiveRateLimit, 10);
  });
});
