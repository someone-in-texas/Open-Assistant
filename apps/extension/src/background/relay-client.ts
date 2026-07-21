import {
  streamEventSchema,
  type ResponseRequest,
  type StreamEvent,
} from "@open-assistant/protocol";
import { getSettings } from "../shared/config.js";
import { getAccessToken } from "./auth.js";

function safeRelayOrigin(value: string): string {
  const url = new URL(value);
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    throw new Error("Relay URLs must use HTTPS except on loopback development hosts.");
  }
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Relay URL must be an origin without credentials, path, query, or fragment.");
  }
  return url.origin;
}

export async function streamResponse(
  request: ResponseRequest,
  signal: AbortSignal,
  onEvent: (event: StreamEvent) => void,
): Promise<void> {
  const settings = await getSettings();
  const origin = safeRelayOrigin(settings.relayOrigin);
  const token = getAccessToken();
  if (settings.connectionMode !== "mock" && !token) {
    throw new Error("Sign in before using this relay connection.");
  }
  const response = await fetch(`${origin}/v1/responses/stream`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "text/event-stream",
      "x-request-id": crypto.randomUUID(),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(request),
    signal,
    credentials: "omit",
    redirect: "error",
  });
  if (!response.ok || !response.body) throw new Error(`Relay returned HTTP ${response.status}.`);

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  while (true) {
    const result = await reader.read();
    if (result.done) break;
    buffer += result.value;
    let boundary = buffer.indexOf("\n\n");
    while (boundary >= 0) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const data = frame
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      if (data) onEvent(streamEventSchema.parse(JSON.parse(data)));
      boundary = buffer.indexOf("\n\n");
    }
  }
}
