import type { ContextSource, SourceChunk } from "@open-assistant/protocol";

export const EXTRACTION_LIMITS = Object.freeze({
  selection: 20_000,
  surroundingContext: 5_000,
  readablePage: 100_000,
  aggregate: 300_000,
  maximumTabs: 10,
});

const BLOCKED_PROTOCOLS = new Set(["about:", "view-source:", "moz-extension:", "chrome:"]);
const SENSITIVE_AUTOCOMPLETE = /(?:current-password|new-password|one-time-code|cc-|transaction-)/iu;
const SENSITIVE_HINT =
  /(?:password|passcode|otp|one.?time|credit.?card|card.?number|cvv|cvc|bank.?account|routing.?number)/iu;

export function classifyPageUrl(url: string): { eligible: boolean; reason?: string } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { eligible: false, reason: "The page URL is invalid." };
  }
  if (BLOCKED_PROTOCOLS.has(parsed.protocol)) {
    return { eligible: false, reason: `Firefox protects ${parsed.protocol} pages.` };
  }
  if (parsed.protocol === "file:") {
    return { eligible: false, reason: "File access must be enabled and granted explicitly." };
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    return { eligible: false, reason: "Only ordinary HTTP and HTTPS pages are supported." };
  }
  if (parsed.hostname === "addons.mozilla.org") {
    return { eligible: false, reason: "Firefox restricts extensions on Add-ons pages." };
  }
  return { eligible: true };
}

export function isSensitiveElement(element: Element): boolean {
  if (!(element instanceof HTMLElement)) return false;
  const input = element instanceof HTMLInputElement ? element : undefined;
  if (input && ["password", "hidden"].includes(input.type.toLowerCase())) return true;
  const autocomplete = element.getAttribute("autocomplete") ?? "";
  const hints = [
    element.getAttribute("name"),
    element.getAttribute("id"),
    element.getAttribute("aria-label"),
    element.getAttribute("placeholder"),
    element.closest("label")?.textContent,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ");
  return SENSITIVE_AUTOCOMPLETE.test(autocomplete) || SENSITIVE_HINT.test(hints);
}

function isVisible(element: HTMLElement): boolean {
  if (element.hidden || element.getAttribute("aria-hidden") === "true") return false;
  const style = getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) !== 0;
}

function normalizeWhitespace(text: string): string {
  return text
    .replace(/[\t\f\v ]+/gu, " ")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

function elementText(element: Element): string {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || !isVisible(parent) || isSensitiveElement(parent))
        return NodeFilter.FILTER_REJECT;
      if (["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "SVG"].includes(parent.tagName)) {
        return NodeFilter.FILTER_REJECT;
      }
      return node.textContent?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  const values: string[] = [];
  while (walker.nextNode()) values.push(walker.currentNode.textContent ?? "");
  return normalizeWhitespace(values.join(" "));
}

function cssPath(element: Element): string {
  const parts: string[] = [];
  let current: Element | null = element;
  while (current && current !== document.documentElement && parts.length < 8) {
    let part = current.tagName.toLowerCase();
    if (current.id && /^[A-Za-z][\w-]{0,80}$/u.test(current.id)) {
      const escaped = globalThis.CSS?.escape
        ? globalThis.CSS.escape(current.id)
        : current.id.replace(/[^A-Za-z0-9_-]/gu, (character) => `\\${character}`);
      part += `#${escaped}`;
      parts.unshift(part);
      break;
    }
    const parent: Element | null = current.parentElement;
    if (parent) {
      const siblings = [...parent.children].filter((item) => item.tagName === current?.tagName);
      if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
    }
    parts.unshift(part);
    current = parent;
  }
  return parts.join(" > ");
}

export function chunkText(
  text: string,
  headingPath: string[] = [],
  maximum = 2_000,
): SourceChunk[] {
  const normalized = normalizeWhitespace(text);
  if (!normalized) return [];
  const paragraphs = normalized.split(/\n{2,}/u);
  const chunks: string[] = [];
  let current = "";
  for (const paragraph of paragraphs) {
    const pieces = paragraph.match(new RegExp(`.{1,${maximum}}(?:\\s+|$)`, "gsu")) ?? [paragraph];
    for (const piece of pieces) {
      const candidate = current ? `${current}\n\n${piece.trim()}` : piece.trim();
      if (candidate.length > maximum && current) {
        chunks.push(current);
        current = piece.trim();
      } else {
        current = candidate;
      }
    }
  }
  if (current) chunks.push(current);
  return chunks.map((value, order) => ({
    chunkId: `chunk-${order + 1}`,
    order,
    headingPath,
    text: value,
  }));
}

export async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function mainContainer(root: Document): Element {
  const preferred = root.querySelector("main, article, [role='main']");
  return preferred ?? root.body;
}

export async function extractReadablePage(
  root: Document = document,
  metadata: { tabId?: number; frameId?: number } = {},
): Promise<ContextSource> {
  const eligibility = classifyPageUrl(root.location.href);
  if (!eligibility.eligible) throw new Error(eligibility.reason);
  const container = mainContainer(root);
  const limitedText = elementText(container).slice(0, EXTRACTION_LIMITS.readablePage);
  const chunks = chunkText(limitedText).map((chunk) => ({
    ...chunk,
    locator: { cssPath: cssPath(container), textQuote: { exact: chunk.text.slice(0, 2_000) } },
  }));
  const contentHash = await sha256(limitedText);
  const source: ContextSource = {
    sourceId: `source-${contentHash.slice(0, 16)}`,
    title: root.title || new URL(root.location.href).hostname,
    url: root.location.href,
    origin: root.location.origin,
    contentHash,
    extractionMode: "readable-page",
    trust: "untrusted-web-content",
    chunks,
    ...(limitedText.length >= EXTRACTION_LIMITS.readablePage ? { truncated: true } : {}),
    ...(metadata.tabId === undefined ? {} : { tabId: metadata.tabId }),
    ...(metadata.frameId === undefined ? {} : { frameId: metadata.frameId }),
  };
  return source;
}

export async function extractSelection(root: Document = document): Promise<ContextSource> {
  const selection = root.getSelection();
  const exact = normalizeWhitespace(selection?.toString() ?? "").slice(
    0,
    EXTRACTION_LIMITS.selection,
  );
  if (!exact) throw new Error("Select some page text first.");
  const node = selection?.anchorNode?.parentElement ?? root.body;
  if (isSensitiveElement(node)) throw new Error("Sensitive fields cannot be shared.");
  const surrounding = elementText(node).slice(0, EXTRACTION_LIMITS.surroundingContext);
  const text = surrounding.includes(exact) ? surrounding : exact;
  const contentHash = await sha256(text);
  return {
    sourceId: `selection-${contentHash.slice(0, 16)}`,
    title: root.title || new URL(root.location.href).hostname,
    url: root.location.href,
    origin: root.location.origin,
    contentHash,
    extractionMode: "selection-with-context",
    trust: "untrusted-web-content",
    chunks: [
      {
        chunkId: "selection-1",
        order: 0,
        headingPath: [],
        text,
        locator: { cssPath: cssPath(node), textQuote: { exact } },
      },
    ],
  };
}
