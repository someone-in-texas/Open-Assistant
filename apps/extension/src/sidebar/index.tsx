import { detectEditRisks } from "@open-assistant/editor";
import { buildChatGptHandoff } from "@open-assistant/prompt-security";
import {
  contextSourceSchema,
  streamEventSchema,
  type ContextBundle,
  type ContextSource,
  type EditProposal,
  type StreamEvent,
} from "@open-assistant/protocol";
import { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { getSettings, saveSettings } from "../shared/config.js";
import { newConversation, type ChatMessage, type ConversationState } from "../shared/state.js";
import { MarkdownView } from "./markdown.js";

type Reply<T = unknown> = { ok: true; data?: T } | { ok: false; error: string };
type TabChoice = {
  id?: number;
  windowId: number;
  title: string;
  url: string;
  domain: string;
  eligible: boolean;
  reason?: string;
  needsPermission?: boolean;
};

async function request<T>(message: Record<string, unknown>): Promise<T> {
  const reply = (await browser.runtime.sendMessage({
    requestId: crypto.randomUUID(),
    ...message,
  })) as Reply<T>;
  if (!reply.ok) throw new Error(reply.error);
  return reply.data as T;
}

function ContextChip({ source, onRemove }: { source: ContextSource; onRemove: () => void }) {
  return (
    <span className="chip" title={`${source.title}\n${source.url}\n${source.extractionMode}`}>
      <span>
        {new URL(source.url).hostname}: {source.title}
      </span>
      <button type="button" aria-label={`Remove ${source.title}`} onClick={onRemove}>
        ×
      </button>
    </span>
  );
}

function Proposal({
  proposal,
  onApply,
  onDiscard,
}: {
  proposal: EditProposal;
  onApply: () => void;
  onDiscard: () => void;
}) {
  const risks = detectEditRisks(proposal.originalText, proposal.replacementText);
  return (
    <section className="proposal" aria-labelledby="proposal-heading">
      <h2 id="proposal-heading">Review proposed edit</h2>
      <div>
        <strong>Original</strong>
        <br />
        <del>{proposal.originalText}</del>
      </div>
      <div>
        <strong>Replacement</strong>
        <br />
        <ins>{proposal.replacementText}</ins>
      </div>
      {proposal.explanation && <p>{proposal.explanation}</p>}
      {(risks.length > 0 || proposal.warnings.length > 0) && (
        <div className="warning">
          <strong>Review carefully:</strong> {[...risks, ...proposal.warnings].join(", ")}
        </div>
      )}
      <div className="actions">
        <button type="button" className="primary" onClick={onApply}>
          Apply
        </button>
        <button
          type="button"
          onClick={() => void navigator.clipboard.writeText(proposal.replacementText)}
        >
          Copy
        </button>
        <button type="button" onClick={onDiscard}>
          Discard
        </button>
      </div>
    </section>
  );
}

function clearProposal(current: ConversationState): ConversationState {
  const copy = { ...current };
  delete copy.proposal;
  return copy;
}

function TabPicker({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (tabs: number[]) => Promise<void>;
}) {
  const [tabs, setTabs] = useState<TabChoice[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    void request<TabChoice[]>({ type: "LIST_TABS" })
      .then(setTabs)
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "Unable to list tabs."),
      );
  }, []);
  const shown = tabs.filter((tab) =>
    `${tab.title} ${tab.domain}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <dialog open aria-labelledby="tab-picker-heading">
      <h2 id="tab-picker-heading">Choose tab context</h2>
      <p className="status">
        Content is read only after you confirm. Up to 10 tabs can remain in context.
      </p>
      <label>
        Search tabs
        <input value={query} onChange={(event) => setQuery(event.target.value)} />
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div>
        {shown.map((tab) => (
          <label key={`${tab.windowId}-${tab.id ?? tab.url}`} className="chip">
            <input
              type="checkbox"
              disabled={!tab.eligible || tab.id === undefined}
              checked={tab.id !== undefined && selected.includes(tab.id)}
              onChange={() =>
                tab.id !== undefined &&
                setSelected((current) =>
                  current.includes(tab.id as number)
                    ? current.filter((id) => id !== tab.id)
                    : [...current, tab.id as number].slice(0, 10),
                )
              }
            />
            <span title={tab.reason}>
              {tab.title} — {tab.domain || "unsupported"}
              {tab.needsPermission ? " · permission needed" : ""}
            </span>
          </label>
        ))}
      </div>
      {selected.length > 5 && (
        <p className="warning">
          Add tabs in groups of five so each permission request stays clear.
        </p>
      )}
      <div className="actions">
        <button
          type="button"
          className="primary"
          disabled={selected.length === 0 || selected.length > 5}
          onClick={() => void onAdd(selected)}
        >
          Add selected
        </button>
        <button type="button" onClick={onClose}>
          Cancel
        </button>
      </div>
    </dialog>
  );
}

function App() {
  const [conversation, setConversation] = useState<ConversationState>(() => newConversation());
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState(
    "Ready. Page content is shared only after you add it and send a request.",
  );
  const [error, setError] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [activeRequest, setActiveRequest] = useState<string>();
  const [showPicker, setShowPicker] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [handoffText, setHandoffText] = useState<string>();
  const port = useRef<browser.runtime.Port | undefined>(undefined);

  useEffect(() => {
    const chatPort = browser.runtime.connect({ name: "chat" });
    port.current = chatPort;
    const listener = (raw: unknown) => {
      const envelope = raw as { requestId: string; event: unknown };
      const event = streamEventSchema.parse(envelope.event);
      setConversation((current) => applyStreamEvent(current, envelope.requestId, event));
      if (event.type === "done" || event.type === "error") {
        setStreaming(false);
        setActiveRequest(undefined);
        setStatus(event.type === "done" ? "Response complete." : event.message);
      }
    };
    chatPort.onMessage.addListener(listener);
    void browser.tabs.query({ active: true, currentWindow: true }).then(async ([activeTab]) => {
      const isPrivate = Boolean(activeTab?.incognito);
      if (isPrivate) {
        setConversation((current) => ({ ...current, private: true }));
        return;
      }
      const stored = await browser.storage.local.get("currentConversation");
      const saved = stored.currentConversation as Partial<ConversationState> | undefined;
      if (saved?.messages && Array.isArray(saved.messages)) {
        setConversation((current) => ({
          ...current,
          title: typeof saved.title === "string" ? saved.title : current.title,
          messages: saved.messages ?? [],
        }));
      }
    });
    void request<{
      sources: ContextSource[];
      pending?: { action?: string; tabId?: number; selectedText?: string };
    }>({ type: "GET_STATE" })
      .then(async ({ sources, pending }) => {
        setConversation((current) => ({ ...current, sources }));
        if (pending?.tabId !== undefined) {
          const source = await request<ContextSource>({
            type: "EXTRACT_TAB",
            tabId: pending.tabId,
            mode: "selection-with-context",
          });
          setConversation((current) => ({
            ...current,
            sources: upsertSource(current.sources, source),
          }));
          const intent = String(pending.action ?? "").replace("assistant-", "");
          setEditMode(["improve", "concise", "professional"].includes(intent));
          setPrompt(
            intent === "ask"
              ? ""
              : `${intent.charAt(0).toUpperCase()}${intent.slice(1)} this selection.`,
          );
          await browser.storage.session.remove("pendingSelectionAction");
        }
      })
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "Unable to restore state."),
      );
    return () => {
      chatPort.onMessage.removeListener(listener);
      chatPort.disconnect();
    };
  }, []);

  useEffect(() => {
    const stored = { ...conversation, sources: [], proposal: undefined };
    if (!conversation.private && conversation.messages.length > 0)
      void browser.storage.local.set({ currentConversation: stored });
  }, [conversation]);

  const approximateSize = useMemo(
    () =>
      conversation.sources.reduce(
        (total, source) => total + source.chunks.reduce((sum, chunk) => sum + chunk.text.length, 0),
        0,
      ),
    [conversation.sources],
  );

  async function addCurrent(): Promise<void> {
    setError("");
    setStatus("Requesting site access and reading the current page…");
    try {
      const source = await request<ContextSource>({ type: "GET_ACTIVE_CONTEXT" });
      setConversation((current) => ({
        ...current,
        sources: upsertSource(current.sources, source),
      }));
      setStatus("Current page added. Review or remove it before sending.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not add this page.");
      setStatus("Page was not added.");
    }
  }

  async function addTabs(tabIds: number[]): Promise<void> {
    try {
      const added = await request<ContextSource[]>({ type: "EXTRACT_TABS", tabIds });
      setConversation((current) => ({
        ...current,
        sources: added.reduce(upsertSource, current.sources),
      }));
      setShowPicker(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not add tabs.");
    }
  }

  async function blockOrigin(source: ContextSource): Promise<void> {
    const settings = await getSettings();
    if (!settings.blockedOrigins.includes(source.origin)) {
      await saveSettings({
        ...settings,
        blockedOrigins: [...settings.blockedOrigins, source.origin].sort(),
      });
    }
    setConversation((current) => ({
      ...current,
      sources: current.sources.filter((item) => item.origin !== source.origin),
    }));
    setStatus(`${source.origin} will never be included unless removed from settings.`);
  }

  function send(): void {
    const text = prompt.trim();
    if (!text || conversation.sources.length === 0 || streaming) return;
    const requestId = crypto.randomUUID();
    const context: ContextBundle = {
      schemaVersion: 1,
      conversationId: conversation.conversationId,
      createdAt: new Date().toISOString(),
      userIntent: text,
      sources: conversation.sources,
    };
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      text,
      createdAt: new Date().toISOString(),
    };
    const assistantMessage: ChatMessage = {
      id: requestId,
      role: "assistant",
      text: "",
      createdAt: new Date().toISOString(),
      citations: [],
    };
    setConversation((current) => ({
      ...current,
      messages: [...current.messages, userMessage, assistantMessage],
    }));
    setPrompt("");
    setStreaming(true);
    setActiveRequest(requestId);
    setStatus("Generating response…");
    setError("");
    port.current?.postMessage({
      type: "SEND_CHAT",
      requestId,
      request: {
        sessionId: conversation.conversationId,
        prompt: text,
        context,
        mode: editMode ? "edit" : "chat",
      },
    });
  }

  async function stop(): Promise<void> {
    if (!activeRequest) return;
    await request({ type: "STOP_REQUEST", targetRequestId: activeRequest });
    setStreaming(false);
    setActiveRequest(undefined);
    setStatus("Stopped.");
  }

  async function applyProposal(): Promise<void> {
    const proposal = conversation.proposal;
    if (!proposal) return;
    try {
      const result = await request<{ ok: boolean; reason?: string }>({
        type: "APPLY_EDIT",
        proposal,
      });
      if (!result.ok) throw new Error(result.reason);
      setStatus("Edit applied. Undo remains available while the field is unchanged.");
      setConversation(clearProposal);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not apply the edit.");
    }
  }

  function prepareHandoff(): void {
    if (!prompt.trim() || conversation.sources.length === 0) return;
    const bundle: ContextBundle = {
      schemaVersion: 1,
      conversationId: conversation.conversationId,
      createdAt: new Date().toISOString(),
      userIntent: prompt.trim(),
      sources: conversation.sources,
    };
    setHandoffText(buildChatGptHandoff(bundle));
  }

  async function handoff(): Promise<void> {
    if (!handoffText) return;
    try {
      const result = await request<{ inserted: boolean; copied: boolean }>({
        type: "SEND_TO_CHATGPT",
        text: handoffText,
      });
      setHandoffText(undefined);
      setStatus(
        result.inserted
          ? "Context inserted for review. Nothing was sent."
          : "Context copied. Paste it into the focused ChatGPT tab.",
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Handoff failed.");
    }
  }

  return (
    <main className="app">
      <header className="app-header">
        <h1>Open Assistant</h1>
        <button
          type="button"
          onClick={() => {
            setConversation(newConversation(conversation.private));
            setEditMode(false);
            setPrompt("");
          }}
        >
          New
        </button>
      </header>
      <section className="content" aria-label="Conversation">
        <div className="context-list" aria-label="Shared context">
          {conversation.sources.map((source) => (
            <ContextChip
              key={source.sourceId}
              source={source}
              onRemove={() =>
                setConversation((current) => ({
                  ...current,
                  sources: current.sources.filter((item) => item.sourceId !== source.sourceId),
                }))
              }
            />
          ))}
        </div>
        <div className="toolbar">
          <button type="button" onClick={() => void addCurrent()}>
            Add current page
          </button>
          <button type="button" onClick={() => setShowPicker(true)}>
            Choose tabs
          </button>
          <button
            type="button"
            disabled={conversation.sources.length === 0}
            onClick={() => setReviewOpen(true)}
          >
            Review shared content ({Math.ceil(approximateSize / 1024)} KB)
          </button>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <p className="status" role="status" aria-live="polite">
          {status}
        </p>
        <div className="messages" aria-live="polite">
          {conversation.messages.map((message) => (
            <article key={message.id} className={`message ${message.role}`}>
              <MarkdownView markdown={message.text || (streaming ? "…" : "No response text.")} />
              {message.citations && message.citations.length > 0 && (
                <p className="status">
                  Sources:{" "}
                  {message.citations
                    .map((citation) => `${citation.sourceId}/${citation.chunkId}`)
                    .join(", ")}
                </p>
              )}
            </article>
          ))}
        </div>
        {conversation.proposal && (
          <Proposal
            proposal={conversation.proposal}
            onApply={() => void applyProposal()}
            onDiscard={() => setConversation(clearProposal)}
          />
        )}
      </section>
      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
      >
        <label htmlFor="prompt">Ask about approved context</label>
        {editMode && (
          <p className="status">Edit mode: the response must be a reviewed structured proposal.</p>
        )}
        <textarea
          id="prompt"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          maxLength={20_000}
          placeholder="What would you like to know?"
        />
        <div className="actions">
          {streaming ? (
            <button type="button" className="danger" onClick={() => void stop()}>
              Stop
            </button>
          ) : (
            <button
              type="submit"
              className="primary"
              disabled={!prompt.trim() || conversation.sources.length === 0}
            >
              Send
            </button>
          )}
          <button
            type="button"
            disabled={!prompt.trim() || conversation.sources.length === 0}
            onClick={prepareHandoff}
          >
            Send to ChatGPT tab
          </button>
          <button
            type="button"
            onClick={() =>
              void request({ type: "UNDO_EDIT" }).then(
                () => setStatus("Undo requested."),
                (reason: unknown) =>
                  setError(reason instanceof Error ? reason.message : "Undo failed."),
              )
            }
          >
            Undo edit
          </button>
        </div>
      </form>
      {showPicker && <TabPicker onClose={() => setShowPicker(false)} onAdd={addTabs} />}
      {reviewOpen && (
        <dialog open aria-labelledby="review-heading">
          <h2 id="review-heading">Content that will be shared</h2>
          {conversation.sources.map((source) => (
            <section key={source.sourceId}>
              <h3>{source.title}</h3>
              <p className="status">
                {source.url} · {source.extractionMode} · {source.trust}
              </p>
              {source.chunks.map((chunk) => (
                <p key={chunk.chunkId}>{chunk.text}</p>
              ))}
              <button type="button" onClick={() => void blockOrigin(source)}>
                Never include this origin
              </button>
            </section>
          ))}
          <button type="button" onClick={() => setReviewOpen(false)}>
            Close
          </button>
        </dialog>
      )}
      {handoffText && (
        <dialog open aria-labelledby="handoff-heading">
          <h2 id="handoff-heading">Review ChatGPT handoff</h2>
          <p>Exactly this text will be inserted or copied. It will not be submitted.</p>
          <pre>{handoffText}</pre>
          <div className="actions">
            <button type="button" className="primary" onClick={() => void handoff()}>
              Insert for review
            </button>
            <button type="button" onClick={() => void navigator.clipboard.writeText(handoffText)}>
              Copy
            </button>
            <button type="button" onClick={() => setHandoffText(undefined)}>
              Cancel
            </button>
          </div>
        </dialog>
      )}
    </main>
  );
}

function upsertSource(current: ContextSource[], source: ContextSource): ContextSource[] {
  const parsed = contextSourceSchema.parse(source);
  return [
    ...current
      .filter((item) => item.tabId !== parsed.tabId || item.sourceId === parsed.sourceId)
      .filter((item) => item.sourceId !== parsed.sourceId),
    parsed,
  ].slice(-10);
}

function applyStreamEvent(
  state: ConversationState,
  requestId: string,
  event: StreamEvent,
): ConversationState {
  if (event.type === "edit") return { ...state, proposal: event.proposal };
  const messages = state.messages.map((message) => {
    if (message.id !== requestId || message.role !== "assistant") return message;
    if (event.type === "delta") return { ...message, text: message.text + event.text };
    if (event.type === "citation")
      return {
        ...message,
        citations: [
          ...(message.citations ?? []),
          { sourceId: event.sourceId, chunkId: event.chunkId },
        ],
      };
    if (event.type === "error")
      return { ...message, text: message.text || `Error: ${event.message}` };
    return message;
  });
  return { ...state, messages };
}

const root = document.getElementById("root");
if (!root) throw new Error("Sidebar root is missing.");
createRoot(root).render(<App />);
