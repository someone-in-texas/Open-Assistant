import {
  ContentEditableAdapter,
  TextControlAdapter,
  validateProposal,
  type EditorAdapter,
  type EditorSnapshot,
  type UndoToken,
} from "@open-assistant/editor";
import { extractReadablePage, extractSelection } from "@open-assistant/extraction";
import { contentCommandSchema } from "@open-assistant/protocol";

const adapters: EditorAdapter[] = [new TextControlAdapter(), new ContentEditableAdapter()];
let snapshot: EditorSnapshot | undefined;
let undoToken: UndoToken | undefined;

function activeEditor(): Element | undefined {
  const active = document.activeElement;
  return active && adapters.some((adapter) => adapter.canHandle(active)) ? active : undefined;
}

async function captureEditorSelection(): Promise<void> {
  const element = activeEditor();
  if (!element) return;
  const adapter = adapters.find((candidate) => candidate.canHandle(element));
  if (!adapter) return;
  try {
    snapshot = await adapter.snapshot(element);
  } catch {
    snapshot = undefined;
  }
}

document.addEventListener("selectionchange", () => void captureEditorSelection(), {
  passive: true,
});
document.addEventListener("select", () => void captureEditorSelection(), {
  passive: true,
  capture: true,
});

function highlightQuote(chunkId: string): { highlighted: boolean } {
  const marker = document.querySelector(`[data-open-assistant-chunk="${CSS.escape(chunkId)}"]`);
  if (marker instanceof HTMLElement) {
    marker.scrollIntoView({ behavior: "smooth", block: "center" });
    marker.focus({ preventScroll: true });
    return { highlighted: true };
  }
  return { highlighted: false };
}

browser.runtime.onMessage.addListener(async (raw: unknown) => {
  if ((raw as { type?: string }).type === "PING") return Promise.resolve({ ok: true });
  const command = contentCommandSchema.parse(raw);
  switch (command.type) {
    case "EXTRACT":
      return command.mode.startsWith("selection") ? extractSelection() : extractReadablePage();
    case "APPLY_EDIT": {
      if (!snapshot)
        return Promise.resolve({
          ok: false,
          reason: "The saved selection is unavailable or expired.",
        });
      const adapter = adapters.find((candidate) =>
        candidate.canHandle(snapshot?.element as Element),
      );
      if (!adapter) return Promise.resolve({ ok: false, reason: "The editor is unsupported." });
      const proposalCheck = validateProposal(command.proposal, snapshot);
      if (!proposalCheck.valid) return Promise.resolve({ ok: false, reason: proposalCheck.reason });
      return adapter.apply(snapshot, command.proposal.replacementText).then((result) => {
        if (result.ok) undoToken = result.undoToken;
        return result;
      });
    }
    case "UNDO_EDIT": {
      if (!undoToken)
        return Promise.resolve({ ok: false, reason: "There is no valid assistant edit to undo." });
      const adapter = adapters.find((candidate) =>
        candidate.canHandle(undoToken?.element as Element),
      );
      if (!adapter)
        return Promise.resolve({ ok: false, reason: "The editor is no longer supported." });
      const result = adapter.undo(undoToken);
      if (result.ok) undoToken = undefined;
      return Promise.resolve(result);
    }
    case "HIGHLIGHT_CHUNK":
      return highlightQuote(command.chunkId);
    case "CHATGPT_INSERT":
      return Promise.resolve({ inserted: false });
  }
});
