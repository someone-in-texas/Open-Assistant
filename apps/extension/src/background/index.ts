import { classifyPageUrl } from "@open-assistant/extraction";
import {
  contextSourceSchema,
  parseRuntimeRequest,
  type ContextSource,
  type RuntimeRequest,
} from "@open-assistant/protocol";
import { streamResponse } from "./relay-client.js";
import { authStatus, signIn, signOut } from "./auth.js";
import { getSettings } from "../shared/config.js";

const activeStreams = new Map<string, AbortController>();
const sources = new Map<number, ContextSource>();

type RuntimeReply = { ok: true; data?: unknown } | { ok: false; error: string };

function originPattern(urlValue: string): string {
  const url = new URL(urlValue);
  return `${url.protocol}//${url.host}/*`;
}

function eligibleTab(tab: browser.tabs.Tab) {
  const url = tab.url ?? "";
  const check = classifyPageUrl(url);
  return {
    id: tab.id,
    windowId: tab.windowId,
    title: tab.title ?? "Untitled",
    url,
    domain: check.eligible ? new URL(url).hostname : "",
    favicon: tab.favIconUrl,
    eligible: check.eligible,
    reason: check.reason,
  };
}

async function ensureContentScript(tabId: number): Promise<void> {
  try {
    await browser.tabs.sendMessage(tabId, { type: "PING" });
  } catch {
    await browser.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
  }
}

async function extractTab(
  tabId: number,
  mode: "selection" | "selection-with-context" | "readable-page" | "viewport",
) {
  const tab = await browser.tabs.get(tabId);
  const check = classifyPageUrl(tab.url ?? "");
  if (!check.eligible) throw new Error(check.reason);
  const settings = await getSettings();
  if (settings.blockedOrigins.includes(new URL(tab.url ?? "").origin)) {
    throw new Error("This origin is on your never-include list.");
  }
  const pattern = originPattern(tab.url ?? "");
  const hasPermission = await browser.permissions.contains({ origins: [pattern] });
  if (!hasPermission) {
    const granted = await browser.permissions.request({ origins: [pattern] });
    if (!granted) throw new Error("Site access was denied. Copy and paste the content instead.");
  }
  await ensureContentScript(tabId);
  const raw = (await browser.tabs.sendMessage(tabId, { type: "EXTRACT", mode })) as unknown;
  const source = contextSourceSchema.parse({ ...(raw as object), tabId });
  sources.set(tabId, source);
  return source;
}

async function handleRequest(message: RuntimeRequest): Promise<RuntimeReply> {
  switch (message.type) {
    case "GET_ACTIVE_CONTEXT": {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (tab?.id === undefined) throw new Error("No active tab is available.");
      return { ok: true, data: await extractTab(tab.id, "readable-page") };
    }
    case "EXTRACT_TAB":
      return { ok: true, data: await extractTab(message.tabId, message.mode) };
    case "EXTRACT_TABS": {
      if (message.tabIds.length > 5) {
        throw new Error(
          "Select at most five tabs at once, or add remaining tabs in a second review step.",
        );
      }
      const extracted: ContextSource[] = [];
      for (const tabId of message.tabIds) extracted.push(await extractTab(tabId, "readable-page"));
      return { ok: true, data: extracted };
    }
    case "LIST_TABS": {
      const tabs = await browser.tabs.query({});
      const choices = await Promise.all(
        tabs.map(async (tab) => {
          const choice = eligibleTab(tab);
          const needsPermission = choice.eligible
            ? !(await browser.permissions.contains({ origins: [originPattern(choice.url)] }))
            : false;
          return { ...choice, needsPermission };
        }),
      );
      return { ok: true, data: choices };
    }
    case "GET_STATE": {
      const pending = await browser.storage.session.get("pendingSelectionAction");
      const pendingAction = pending.pendingSelectionAction as unknown;
      const currentTabs = await browser.tabs.query({ currentWindow: true });
      const currentIds = new Set(
        currentTabs.flatMap((tab) => (tab.id === undefined ? [] : [tab.id])),
      );
      return {
        ok: true,
        data: {
          sources: [...sources.entries()]
            .filter(([tabId]) => currentIds.has(tabId))
            .map(([, source]) => source),
          pending: pendingAction,
        },
      };
    }
    case "SIGN_IN":
      return { ok: true, data: await signIn() };
    case "SIGN_OUT":
      signOut();
      return { ok: true };
    case "AUTH_STATUS":
      return { ok: true, data: authStatus() };
    case "APPLY_EDIT": {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (tab?.id === undefined) throw new Error("No active tab is available.");
      await ensureContentScript(tab.id);
      return {
        ok: true,
        data: await browser.tabs.sendMessage(tab.id, {
          type: "APPLY_EDIT",
          proposal: message.proposal,
        }),
      };
    }
    case "UNDO_EDIT": {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (tab?.id === undefined) throw new Error("No active tab is available.");
      return { ok: true, data: await browser.tabs.sendMessage(tab.id, { type: "UNDO_EDIT" }) };
    }
    case "STOP_REQUEST": {
      activeStreams.get(message.targetRequestId)?.abort();
      activeStreams.delete(message.targetRequestId);
      return { ok: true };
    }
    case "STOP_AGENT": {
      await browser.storage.session.remove("agentLease");
      return { ok: true };
    }
    case "SEND_TO_CHATGPT": {
      const settings = await getSettings();
      if (!settings.chatGptBridgeEnabled)
        throw new Error("The ChatGPT tab bridge is disabled in settings.");
      const permission = await browser.permissions.request({ origins: ["https://chatgpt.com/*"] });
      if (!permission) {
        const clipboard = await browser.permissions.request({ permissions: ["clipboardWrite"] });
        if (!clipboard)
          throw new Error(
            "Site and clipboard access were denied. Copy the reviewed bundle manually.",
          );
        await navigator.clipboard.writeText(message.text);
        await browser.tabs.create({ url: "https://chatgpt.com/" });
        return { ok: true, data: { inserted: false, copied: true } };
      }
      const candidates = await browser.tabs.query({ url: "https://chatgpt.com/*" });
      const target =
        candidates.find((tab) => tab.id !== undefined) ??
        (await browser.tabs.create({ url: "https://chatgpt.com/" }));
      if (target.id === undefined) throw new Error("No ChatGPT tab is available.");
      await browser.tabs.update(target.id, { active: true });
      try {
        await browser.scripting.executeScript({
          target: { tabId: target.id },
          files: ["chatgpt-bridge.js"],
        });
        const result = (await browser.tabs.sendMessage(target.id, {
          type: "CHATGPT_INSERT",
          text: message.text,
        })) as { inserted?: boolean };
        if (!result.inserted) throw new Error("Composer adapter unavailable.");
      } catch {
        const clipboard = await browser.permissions.request({ permissions: ["clipboardWrite"] });
        if (!clipboard)
          throw new Error("Composer insertion failed and clipboard access was denied.");
        await navigator.clipboard.writeText(message.text);
        return { ok: true, data: { inserted: false, copied: true } };
      }
      return { ok: true, data: { inserted: true, copied: false } };
    }
    case "SEND_CHAT":
      throw new Error("Streaming requests must use the chat runtime port.");
  }
}

function validSender(sender: browser.runtime.MessageSender): boolean {
  return (
    sender.id === browser.runtime.id &&
    (!sender.url || sender.url.startsWith(browser.runtime.getURL("")))
  );
}

browser.runtime.onMessage.addListener((raw: unknown, sender) => {
  if (!validSender(sender))
    return Promise.resolve({ ok: false, error: "Untrusted message sender." });
  const parsed = parseRuntimeRequest(raw);
  return handleRequest(parsed).catch((error: unknown) => ({
    ok: false as const,
    error: error instanceof Error ? error.message : "Unexpected extension error.",
  }));
});

browser.runtime.onConnect.addListener((port) => {
  if (port.name !== "chat" || port.sender?.id !== browser.runtime.id) {
    port.disconnect();
    return;
  }
  port.onMessage.addListener((raw: unknown) => {
    const parsed = parseRuntimeRequest(raw);
    if (parsed.type !== "SEND_CHAT") return;
    const controller = new AbortController();
    activeStreams.set(parsed.requestId, controller);
    void streamResponse(parsed.request, controller.signal, (event) =>
      port.postMessage({ requestId: parsed.requestId, event }),
    )
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          port.postMessage({
            requestId: parsed.requestId,
            event: {
              type: "error",
              code: "network",
              message: error instanceof Error ? error.message : "Relay error.",
              retryable: true,
            },
          });
        }
      })
      .finally(() => activeStreams.delete(parsed.requestId));
  });
  port.onDisconnect.addListener(() => {
    for (const controller of activeStreams.values()) controller.abort();
    activeStreams.clear();
  });
});

async function createMenus(): Promise<void> {
  await browser.menus.removeAll();
  browser.menus.create({
    id: "assistant",
    title: browser.i18n.getMessage("contextMenuParent"),
    contexts: ["selection", "editable"],
  });
  const entries = [
    ["ask", "askAboutSelection"],
    ["explain", "explainSelection"],
    ["summarize", "summarizeSelection"],
    ["improve", "improveSelection"],
    ["concise", "conciseSelection"],
    ["professional", "professionalSelection"],
    ["custom", "customSelection"],
  ] as const;
  for (const [id, key] of entries) {
    browser.menus.create({
      id: `assistant-${id}`,
      parentId: "assistant",
      title: browser.i18n.getMessage(key),
      contexts: ["selection", "editable"],
    });
  }
}

browser.runtime.onInstalled.addListener((details) => {
  void createMenus();
  if (details.reason === "install")
    void browser.tabs.create({ url: browser.runtime.getURL("onboarding/index.html") });
});

browser.action.onClicked.addListener(() => {
  void browser.sidebarAction.toggle();
});

browser.menus.onClicked.addListener((info, tab) => {
  if (!String(info.menuItemId).startsWith("assistant-") || tab?.id === undefined) return;
  void browser.storage.session.set({
    pendingSelectionAction: {
      action: info.menuItemId,
      selectedText: info.selectionText?.slice(0, 20_000) ?? "",
      tabId: tab.id,
    },
  });
  void browser.sidebarAction.open();
});

browser.commands.onCommand.addListener((command) => {
  if (command === "stop-agent") void browser.storage.session.remove("agentLease");
  if (command === "ask-selection") {
    void browser.storage.session.set({ pendingSelectionAction: { action: "assistant-ask" } });
    void browser.sidebarAction.open();
  }
});

browser.tabs.onRemoved.addListener((tabId) => sources.delete(tabId));
browser.tabs.onUpdated.addListener((tabId, change) => {
  if (change.url) sources.delete(tabId);
});
browser.permissions.onRemoved.addListener((permissions) => {
  for (const [tabId, source] of sources) {
    if (permissions.origins?.includes(originPattern(source.url))) sources.delete(tabId);
  }
});
