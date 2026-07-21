import { spawn, execFileSync } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { execPnpmSync } from "./lib/pnpm.mjs";

const results = path.resolve("test-results/smoke");
await rm(results, { recursive: true, force: true });
await mkdir(results, { recursive: true });
execPnpmSync(["build"], { stdio: "inherit" });
execFileSync(process.execPath, ["scripts/webext-lint.mjs"], { stdio: "inherit" });
const mock = spawn(process.execPath, ["apps/mock-relay/dist/index.js"], {
  stdio: ["ignore", "pipe", "pipe"],
});
const fixtures = spawn(process.execPath, ["apps/fixture-server/dist/index.js"], {
  stdio: ["ignore", "pipe", "pipe"],
});
const logs = [];
for (const processHandle of [mock, fixtures]) {
  processHandle.stdout.on("data", (chunk) => logs.push(chunk.toString()));
  processHandle.stderr.on("data", (chunk) => logs.push(chunk.toString()));
}
async function ready(url) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`${url} did not become ready.`);
}
try {
  const health = await ready("http://127.0.0.1:8787/v1/health");
  if ((await health.json()).mode !== "mock")
    throw new Error("Mock relay returned unexpected health data.");
  const article = await ready("http://127.0.0.1:4173/article.html");
  if (!(await article.text()).includes("explicit context"))
    throw new Error("Fixture article was unavailable.");
  execPnpmSync(["test:integration"], { stdio: "inherit" });
  execFileSync("node", ["scripts/e2e.mjs"], { stdio: "inherit" });
  console.log("Smoke checks passed, including temporary-profile Firefox installation.");
} catch (error) {
  await (
    await import("node:fs/promises")
  ).writeFile(path.join(results, "services.log"), logs.join(""));
  throw error;
} finally {
  mock.kill("SIGTERM");
  fixtures.kill("SIGTERM");
}
