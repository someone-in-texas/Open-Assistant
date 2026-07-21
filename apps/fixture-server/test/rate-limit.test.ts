// @vitest-environment node

import { describe, expect, it } from "vitest";
import { buildFixtureServer } from "../src/app.js";

describe("fixture server rate limits", () => {
  it("limits repeated file-system-backed requests", async () => {
    const app = await buildFixtureServer();
    for (let index = 0; index < 60; index += 1) {
      expect((await app.inject({ method: "GET", url: "/article.html" })).statusCode).toBe(200);
    }
    expect((await app.inject({ method: "GET", url: "/article.html" })).statusCode).toBe(429);
    await app.close();
  });
});
