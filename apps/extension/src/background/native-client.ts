import {
  nativeMessageSchema,
  nativeStatusSchema,
  type NativeMessage,
  type NativeStatus,
  type ResponseRequest,
  type StreamEvent,
} from "@open-assistant/protocol";

const NATIVE_HOST = "org.mozilla.open_assistant";
const CONTROL_TIMEOUT_MS = 90_000;
const LOGIN_TIMEOUT_MS = 5 * 60_000;

type NativeControlRequest =
  | { type: "status"; requestId: string }
  | { type: "store_key"; requestId: string; apiKey: string }
  | { type: "delete_key"; requestId: string }
  | { type: "codex_login"; requestId: string }
  | { type: "codex_logout"; requestId: string };

function requireNativePermission(): Promise<void> {
  return browser.permissions.contains({ permissions: ["nativeMessaging"] }).then((granted) => {
    if (!granted) {
      throw new Error("Enable native companion access in Settings before using this provider.");
    }
  });
}

function connectNative(): browser.runtime.Port {
  return browser.runtime.connectNative(NATIVE_HOST);
}

function cleanAuthUrl(value: string): string {
  const url = new URL(value);
  const trustedHost =
    url.hostname === "openai.com" ||
    url.hostname === "chatgpt.com" ||
    url.hostname.endsWith(".openai.com") ||
    url.hostname.endsWith(".chatgpt.com");
  if (url.protocol !== "https:" || !trustedHost || url.username || url.password) {
    throw new Error("Codex returned an invalid sign-in URL.");
  }
  return url.toString();
}

async function controlRequest<T = unknown>(
  request: NativeControlRequest,
  timeoutMs = CONTROL_TIMEOUT_MS,
): Promise<T> {
  await requireNativePermission();
  const port = connectNative();
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      port.onMessage.removeListener(onMessage);
      port.onDisconnect.removeListener(onDisconnect);
      port.disconnect();
      callback();
    };
    const onMessage = (raw: unknown) => {
      let message: NativeMessage;
      try {
        message = nativeMessageSchema.parse(raw);
      } catch {
        finish(() => reject(new Error("The native companion returned an invalid message.")));
        return;
      }
      if (message.requestId !== request.requestId || message.kind !== "response") return;
      if (!message.ok) {
        finish(() => reject(new Error(nativeErrorMessage(message.error))));
        return;
      }
      finish(() => resolve(message.data as T));
    };
    const onDisconnect = () =>
      finish(() => reject(new Error("The native companion disconnected unexpectedly.")));
    const timeout = setTimeout(
      () => finish(() => reject(new Error("The native companion did not respond in time."))),
      timeoutMs,
    );
    port.onMessage.addListener(onMessage);
    port.onDisconnect.addListener(onDisconnect);
    port.postMessage(request);
  });
}

export async function getNativeStatus(): Promise<NativeStatus> {
  const data = await controlRequest({
    type: "status",
    requestId: crypto.randomUUID(),
  });
  return nativeStatusSchema.parse(data);
}

export async function storeNativeKey(apiKey: string): Promise<void> {
  await controlRequest({
    type: "store_key",
    requestId: crypto.randomUUID(),
    apiKey,
  });
}

export async function deleteNativeKey(): Promise<void> {
  await controlRequest({
    type: "delete_key",
    requestId: crypto.randomUUID(),
  });
}

export async function logoutCodex(): Promise<void> {
  await controlRequest({
    type: "codex_logout",
    requestId: crypto.randomUUID(),
  });
}

export async function loginWithCodex(): Promise<void> {
  await requireNativePermission();
  const requestId = crypto.randomUUID();
  const port = connectNative();
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    let opened = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      port.onMessage.removeListener(onMessage);
      port.onDisconnect.removeListener(onDisconnect);
      port.disconnect();
      callback();
    };
    const onMessage = (raw: unknown) => {
      let message: NativeMessage;
      try {
        message = nativeMessageSchema.parse(raw);
      } catch {
        finish(() => reject(new Error("The native companion returned an invalid login message.")));
        return;
      }
      if (message.requestId !== requestId) return;
      if (message.kind === "response" && !message.ok) {
        finish(() => reject(new Error(nativeErrorMessage(message.error))));
        return;
      }
      if (message.kind !== "codex_login") return;
      if (message.state === "open") {
        if (!message.authUrl || opened) return;
        let authUrl: string;
        try {
          authUrl = cleanAuthUrl(message.authUrl);
        } catch (error) {
          finish(() =>
            reject(error instanceof Error ? error : new Error("Codex returned an invalid URL.")),
          );
          return;
        }
        opened = true;
        void browser.tabs.create({ url: authUrl }).catch(() => {
          finish(() => reject(new Error("Could not open the Codex sign-in page.")));
        });
        return;
      }
      if (message.state === "complete") {
        if (message.success) finish(resolve);
        else finish(() => reject(new Error(message.error ?? "Codex sign-in failed.")));
      }
    };
    const onDisconnect = () =>
      finish(() => reject(new Error("The native companion disconnected during sign-in.")));
    const timeout = setTimeout(
      () => finish(() => reject(new Error("Codex sign-in timed out."))),
      LOGIN_TIMEOUT_MS,
    );
    port.onMessage.addListener(onMessage);
    port.onDisconnect.addListener(onDisconnect);
    port.postMessage({ type: "codex_login", requestId });
  });
}

export async function streamNativeResponse(
  provider: "byok" | "codex",
  model: string,
  request: ResponseRequest,
  signal: AbortSignal,
  onEvent: (event: StreamEvent) => void,
): Promise<void> {
  await requireNativePermission();
  if (signal.aborted) return;
  const requestId = crypto.randomUUID();
  const port = connectNative();
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      port.onMessage.removeListener(onMessage);
      port.onDisconnect.removeListener(onDisconnect);
      port.disconnect();
      callback();
    };
    const onAbort = () => {
      try {
        port.postMessage({
          type: "cancel",
          requestId: crypto.randomUUID(),
          targetRequestId: requestId,
        });
      } finally {
        finish(resolve);
      }
    };
    const onMessage = (raw: unknown) => {
      let message: NativeMessage;
      try {
        message = nativeMessageSchema.parse(raw);
      } catch {
        finish(() => reject(new Error("The native companion returned an invalid stream event.")));
        return;
      }
      if (message.requestId !== requestId) return;
      if (message.kind === "response" && !message.ok) {
        try {
          onEvent(nativeStreamError(message.error));
          finish(resolve);
        } catch {
          finish(() => reject(new Error("The native stream consumer disconnected.")));
        }
        return;
      }
      if (message.kind !== "stream") return;
      try {
        onEvent(message.event);
      } catch {
        finish(() => reject(new Error("The native stream consumer disconnected.")));
        return;
      }
      if (message.event.type === "done" || message.event.type === "error") finish(resolve);
    };
    const onDisconnect = () => {
      if (signal.aborted) finish(resolve);
      else finish(() => reject(new Error("The native companion disconnected unexpectedly.")));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    port.onMessage.addListener(onMessage);
    port.onDisconnect.addListener(onDisconnect);
    port.postMessage({
      type: "request",
      requestId,
      provider,
      ...(model ? { model } : {}),
      payload: request,
    });
  });
}

function nativeStreamError(code?: string): StreamEvent {
  const category = (() => {
    switch (code) {
      case "key_missing":
      case "auth":
      case "codex_not_authenticated":
      case "codex_wrong_auth_mode":
        return "auth";
      case "quota":
        return "quota";
      case "validation":
        return "validation";
      case "codex_incompatible":
        return "model";
      default:
        return "network";
    }
  })();
  return {
    type: "error",
    code: category,
    message: nativeErrorMessage(code),
    retryable: category === "network" || category === "quota",
  };
}

export function nativeErrorMessage(code?: string): string {
  switch (code) {
    case "key_missing":
      return "Store an OpenAI API key in the native companion before using private BYOK.";
    case "key_storage_failed":
      return "The API key could not be stored in the OS credential manager.";
    case "key_deletion_failed":
      return "The API key could not be removed from the OS credential manager.";
    case "codex_unavailable":
      return "Install a compatible Codex CLI before using Codex subscription mode.";
    case "codex_not_authenticated":
      return "Sign in with ChatGPT through Codex before using this provider.";
    case "codex_wrong_auth_mode":
      return "Codex is signed in with an API key. Use ChatGPT sign-in for subscription mode.";
    case "codex_incompatible":
      return "The installed Codex CLI is not compatible with this integration.";
    case "quota":
      return "The selected provider has reached its usage limit.";
    case "auth":
      return "The selected provider rejected its credentials.";
    case "validation":
      return "The request was rejected by the native companion.";
    case "busy":
      return "The native companion is already handling the maximum number of requests.";
    default:
      return "The native provider request could not be completed.";
  }
}
