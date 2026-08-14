import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const executable = resolve(
  "apps/native-host/target/release",
  process.platform === "win32" ? "open-assistant-native-host.exe" : "open-assistant-native-host",
);

if (!existsSync(executable)) {
  throw new Error("Build the native companion with `pnpm build:native` before running this smoke.");
}

const child = spawn(executable, [], {
  stdio: ["pipe", "pipe", "pipe"],
  windowsHide: true,
});
const requestId = crypto.randomUUID();
const request = Buffer.from(JSON.stringify({ type: "status", requestId }), "utf8");
const header = Buffer.alloc(4);
header.writeUInt32LE(request.length);
child.stdin.write(Buffer.concat([header, request]));

let output = Buffer.alloc(0);
let stderr = "";
let timeout;

child.stderr.on("data", (chunk) => {
  stderr += chunk.toString("utf8");
});

const response = await new Promise((resolveResponse, reject) => {
  timeout = setTimeout(() => {
    child.kill();
    reject(new Error("Native companion status smoke timed out."));
  }, 30_000);
  child.on("error", reject);
  child.on("exit", (code) => {
    reject(new Error(`Native companion exited before status (code ${String(code)}): ${stderr}`));
  });
  child.stdout.on("data", (chunk) => {
    output = Buffer.concat([output, chunk]);
    if (output.length < 4) return;
    const length = output.readUInt32LE(0);
    if (length > 1_048_576) {
      reject(new Error("Native companion returned an oversized message."));
      return;
    }
    if (output.length < length + 4) return;
    try {
      resolveResponse(JSON.parse(output.subarray(4, length + 4).toString("utf8")));
    } catch (error) {
      reject(error);
    }
  });
});

clearTimeout(timeout);
child.stdin.end();

if (
  response?.kind !== "response" ||
  response.requestId !== requestId ||
  response.ok !== true ||
  typeof response.data?.version !== "string" ||
  typeof response.data?.byok?.keyStored !== "boolean" ||
  typeof response.data?.codex?.available !== "boolean" ||
  typeof response.data?.codex?.authenticated !== "boolean"
) {
  throw new Error(`Native companion returned an invalid status response: ${stderr}`);
}

const serialized = JSON.stringify(response);
for (const forbidden of ["accessToken", "refreshToken", "apiKey", "authUrl"]) {
  if (serialized.includes(forbidden)) {
    throw new Error(`Native companion status exposed forbidden field: ${forbidden}`);
  }
}

console.log(
  `Native companion smoke passed (BYOK key: ${
    response.data.byok.keyStored ? "stored" : "not stored"
  }; Codex: ${response.data.codex.available ? "available" : "unavailable"}).`,
);
