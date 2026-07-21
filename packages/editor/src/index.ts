import { isSensitiveElement, sha256 } from "@open-assistant/extraction";
import type { EditProposal } from "@open-assistant/protocol";

export type EditorSnapshot = {
  kind: "text-control" | "contenteditable";
  element: HTMLElement;
  originalValue: string;
  selectedText: string;
  start: number;
  end: number;
  surroundingHash: string;
  timestamp: number;
};

export type UndoToken = {
  element: HTMLElement;
  before: string;
  after: string;
  start: number;
  replacementLength: number;
  kind: EditorSnapshot["kind"];
};

export type ApplyResult = { ok: true; undoToken: UndoToken } | { ok: false; reason: string };

export type ValidationResult = { valid: true } | { valid: false; reason: string };

export interface EditorAdapter {
  canHandle(element: Element): boolean;
  snapshot(element: Element): Promise<EditorSnapshot>;
  validate(snapshot: EditorSnapshot): Promise<ValidationResult>;
  apply(snapshot: EditorSnapshot, replacement: string): Promise<ApplyResult>;
  undo(token: UndoToken): ApplyResult;
}

const ALLOWED_INPUT_TYPES = new Set(["text", "search", "email"]);
function hasInvalidControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return (
      (code >= 0 && code <= 8) ||
      code === 11 ||
      code === 12 ||
      (code >= 14 && code <= 31) ||
      code === 127
    );
  });
}

function safeReplacement(snapshot: EditorSnapshot, replacement: string): ValidationResult {
  if (hasInvalidControlCharacter(replacement))
    return { valid: false, reason: "Control characters are not allowed." };
  const limit = snapshot.selectedText.length * 4 + 2_000;
  if (replacement.length > limit)
    return { valid: false, reason: "The replacement is unexpectedly long." };
  return { valid: true };
}

async function hashSelection(value: string, start: number, end: number): Promise<string> {
  return sha256(
    `${start}:${end}:${value.slice(Math.max(0, start - 256), Math.min(value.length, end + 256))}`,
  );
}

function dispatchInput(element: HTMLElement, replacement: string): void {
  element.dispatchEvent(
    new InputEvent("input", {
      bubbles: true,
      composed: true,
      inputType: "insertReplacementText",
      data: replacement,
    }),
  );
}

export class TextControlAdapter implements EditorAdapter {
  canHandle(element: Element): boolean {
    return (
      element instanceof HTMLTextAreaElement ||
      (element instanceof HTMLInputElement && ALLOWED_INPUT_TYPES.has(element.type.toLowerCase()))
    );
  }

  async snapshot(element: Element): Promise<EditorSnapshot> {
    if (!this.canHandle(element) || isSensitiveElement(element))
      throw new Error("This field is not safe to edit.");
    const control = element as HTMLInputElement | HTMLTextAreaElement;
    const start = control.selectionStart ?? 0;
    const end = control.selectionEnd ?? start;
    if (start === end) throw new Error("Select text to edit first.");
    return {
      kind: "text-control",
      element: control,
      originalValue: control.value,
      selectedText: control.value.slice(start, end),
      start,
      end,
      surroundingHash: await hashSelection(control.value, start, end),
      timestamp: Date.now(),
    };
  }

  async validate(snapshot: EditorSnapshot): Promise<ValidationResult> {
    if (Date.now() - snapshot.timestamp > 10 * 60_000)
      return { valid: false, reason: "The selection expired." };
    if (!snapshot.element.isConnected) return { valid: false, reason: "The editor was replaced." };
    const control = snapshot.element as HTMLInputElement | HTMLTextAreaElement;
    if (isSensitiveElement(control)) return { valid: false, reason: "The field is sensitive." };
    if (control.value.slice(snapshot.start, snapshot.end) !== snapshot.selectedText) {
      return { valid: false, reason: "The selected text changed." };
    }
    const currentHash = await hashSelection(control.value, snapshot.start, snapshot.end);
    return currentHash === snapshot.surroundingHash
      ? { valid: true }
      : { valid: false, reason: "The surrounding text changed." };
  }

  async apply(snapshot: EditorSnapshot, replacement: string): Promise<ApplyResult> {
    const current = await this.validate(snapshot);
    if (!current.valid) return { ok: false, reason: current.reason };
    const replacementValidation = safeReplacement(snapshot, replacement);
    if (!replacementValidation.valid) return { ok: false, reason: replacementValidation.reason };
    const control = snapshot.element as HTMLInputElement | HTMLTextAreaElement;
    const before = control.value;
    const scrollTop = control.scrollTop;
    control.focus({ preventScroll: true });
    control.setRangeText(replacement, snapshot.start, snapshot.end, "select");
    control.scrollTop = scrollTop;
    dispatchInput(control, replacement);
    return {
      ok: true,
      undoToken: {
        element: control,
        before,
        after: control.value,
        start: snapshot.start,
        replacementLength: replacement.length,
        kind: "text-control",
      },
    };
  }

  undo(token: UndoToken): ApplyResult {
    if (
      token.kind !== "text-control" ||
      !(token.element instanceof HTMLInputElement || token.element instanceof HTMLTextAreaElement)
    ) {
      return { ok: false, reason: "The undo target is invalid." };
    }
    if (!token.element.isConnected || token.element.value !== token.after) {
      return { ok: false, reason: "The editor changed after the assistant edit." };
    }
    token.element.value = token.before;
    token.element.setSelectionRange(
      token.start,
      token.start + (token.before.length - token.after.length + token.replacementLength),
    );
    dispatchInput(token.element, "");
    return { ok: true, undoToken: token };
  }
}

function textOffset(root: Node, target: Node, offset: number): number {
  const range = document.createRange();
  range.selectNodeContents(root);
  range.setEnd(target, offset);
  return range.toString().length;
}

function rangeAtOffsets(root: Node, start: number, end: number): Range | undefined {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let consumed = 0;
  let startNode: Node | undefined;
  let endNode: Node | undefined;
  let startOffset = 0;
  let endOffset = 0;
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const length = node.textContent?.length ?? 0;
    if (!startNode && start >= consumed && start <= consumed + length) {
      startNode = node;
      startOffset = start - consumed;
    }
    if (end >= consumed && end <= consumed + length) {
      endNode = node;
      endOffset = end - consumed;
      break;
    }
    consumed += length;
  }
  if (!startNode || !endNode) return undefined;
  const range = document.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  return range;
}

export class ContentEditableAdapter implements EditorAdapter {
  canHandle(element: Element): boolean {
    return (
      element instanceof HTMLElement && element.isContentEditable && !isSensitiveElement(element)
    );
  }

  async snapshot(element: Element): Promise<EditorSnapshot> {
    if (!this.canHandle(element)) throw new Error("This editor is not supported.");
    const selection = document.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : undefined;
    if (!range || range.collapsed || !element.contains(range.commonAncestorContainer)) {
      throw new Error("Select text inside the editor first.");
    }
    const originalValue = element.textContent ?? "";
    const start = textOffset(element, range.startContainer, range.startOffset);
    const end = textOffset(element, range.endContainer, range.endOffset);
    return {
      kind: "contenteditable",
      element: element as HTMLElement,
      originalValue,
      selectedText: range.toString(),
      start,
      end,
      surroundingHash: await hashSelection(originalValue, start, end),
      timestamp: Date.now(),
    };
  }

  async validate(snapshot: EditorSnapshot): Promise<ValidationResult> {
    if (Date.now() - snapshot.timestamp > 10 * 60_000)
      return { valid: false, reason: "The selection expired." };
    if (!snapshot.element.isConnected || !snapshot.element.isContentEditable)
      return { valid: false, reason: "The editor was replaced." };
    const current = snapshot.element.textContent ?? "";
    const matches = current.split(snapshot.selectedText).length - 1;
    if (matches !== 1 || current.slice(snapshot.start, snapshot.end) !== snapshot.selectedText) {
      return { valid: false, reason: "The selected range is stale or ambiguous." };
    }
    return (await hashSelection(current, snapshot.start, snapshot.end)) === snapshot.surroundingHash
      ? { valid: true }
      : { valid: false, reason: "The surrounding text changed." };
  }

  async apply(snapshot: EditorSnapshot, replacement: string): Promise<ApplyResult> {
    const current = await this.validate(snapshot);
    if (!current.valid) return { ok: false, reason: current.reason };
    const replacementValidation = safeReplacement(snapshot, replacement);
    if (!replacementValidation.valid) return { ok: false, reason: replacementValidation.reason };
    const range = rangeAtOffsets(snapshot.element, snapshot.start, snapshot.end);
    if (!range) return { ok: false, reason: "The selected range could not be restored." };
    const before = snapshot.element.textContent ?? "";
    range.deleteContents();
    range.insertNode(document.createTextNode(replacement));
    dispatchInput(snapshot.element, replacement);
    return {
      ok: true,
      undoToken: {
        element: snapshot.element,
        before,
        after: snapshot.element.textContent ?? "",
        start: snapshot.start,
        replacementLength: replacement.length,
        kind: "contenteditable",
      },
    };
  }

  undo(token: UndoToken): ApplyResult {
    if (
      token.kind !== "contenteditable" ||
      !token.element.isConnected ||
      token.element.textContent !== token.after
    ) {
      return { ok: false, reason: "The editor changed after the assistant edit." };
    }
    const range = rangeAtOffsets(token.element, token.start, token.start + token.replacementLength);
    if (!range) return { ok: false, reason: "The edited range is unavailable." };
    const originalLength = token.before.length - token.after.length + token.replacementLength;
    range.deleteContents();
    range.insertNode(
      document.createTextNode(token.before.slice(token.start, token.start + originalLength)),
    );
    dispatchInput(token.element, "");
    return { ok: true, undoToken: token };
  }
}

export function validateProposal(
  proposal: EditProposal,
  snapshot: EditorSnapshot,
): ValidationResult {
  if (proposal.originalText !== snapshot.selectedText)
    return { valid: false, reason: "The proposal targets different text." };
  return safeReplacement(snapshot, proposal.replacementText);
}

export type EditRisk = "email" | "url" | "number" | "date" | "negation";

function values(text: string, pattern: RegExp): string[] {
  return [...text.matchAll(pattern)].map((match) => match[0].toLowerCase()).sort();
}

export function detectEditRisks(original: string, replacement: string): EditRisk[] {
  const patterns: ReadonlyArray<[EditRisk, RegExp]> = [
    ["email", /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/gu],
    ["url", /https?:\/\/[^\s)]+/gu],
    ["number", /\b\d+(?:[.,]\d+)*\b/gu],
    ["date", /\b(?:\d{1,2}[/-]){2}\d{2,4}\b/gu],
    ["negation", /\b(?:not|never|no|without|cannot|can't|won't|isn't|don't)\b/giu],
  ];
  return patterns
    .filter(
      ([, pattern]) =>
        JSON.stringify(values(original, pattern)) !== JSON.stringify(values(replacement, pattern)),
    )
    .map(([risk]) => risk);
}
