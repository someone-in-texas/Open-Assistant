import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ContentEditableAdapter,
  TextControlAdapter,
  detectEditRisks,
  validateProposal,
} from "@open-assistant/editor";

beforeEach(() => {
  document.body.innerHTML = "";
  document.getSelection()?.removeAllRanges();
  vi.useRealTimers();
});

describe("text control adapter", () => {
  it("applies only the saved range and supports one-step undo", async () => {
    document.body.innerHTML = `<textarea id="editor">Hello awkward world</textarea>`;
    const editor = document.querySelector("#editor") as HTMLTextAreaElement;
    editor.setSelectionRange(6, 13);
    const input = vi.fn();
    editor.addEventListener("input", input);
    const adapter = new TextControlAdapter();
    const snapshot = await adapter.snapshot(editor);
    const result = await adapter.apply(snapshot, "wonderful");
    expect(result.ok).toBe(true);
    expect(editor.value).toBe("Hello wonderful world");
    expect(input).toHaveBeenCalledOnce();
    if (!result.ok) throw new Error("Expected edit success");
    expect(adapter.undo(result.undoToken).ok).toBe(true);
    expect(editor.value).toBe("Hello awkward world");
  });

  it("rejects stale, expired, sensitive, empty, and oversized edits", async () => {
    document.body.innerHTML = `<textarea id="editor">Hello world</textarea><input id="password" type="password" value="secret">`;
    const editor = document.querySelector("#editor") as HTMLTextAreaElement;
    editor.setSelectionRange(0, 5);
    const adapter = new TextControlAdapter();
    const snapshot = await adapter.snapshot(editor);
    editor.value = "Changed world";
    expect((await adapter.validate(snapshot)).valid).toBe(false);
    editor.value = snapshot.originalValue;
    expect((await adapter.apply(snapshot, "x".repeat(2_100))).ok).toBe(false);
    expect((await adapter.apply(snapshot, "bad\u0000value")).ok).toBe(false);
    editor.setSelectionRange(0, 0);
    await expect(adapter.snapshot(editor)).rejects.toThrow(/Select text/u);
    await expect(adapter.snapshot(document.querySelector("#password") as Element)).rejects.toThrow(
      /safe/u,
    );
    snapshot.timestamp = Date.now() - 11 * 60_000;
    expect((await adapter.validate(snapshot)).valid).toBe(false);
  });

  it("invalidates undo after another edit", async () => {
    document.body.innerHTML = `<input id="editor" type="text" value="old value">`;
    const editor = document.querySelector("#editor") as HTMLInputElement;
    editor.setSelectionRange(0, 3);
    const adapter = new TextControlAdapter();
    const result = await adapter.apply(await adapter.snapshot(editor), "new");
    if (!result.ok) throw new Error("Expected edit success");
    editor.value += "!";
    expect(adapter.undo(result.undoToken)).toMatchObject({ ok: false });
    expect(adapter.undo({ ...result.undoToken, kind: "contenteditable" })).toMatchObject({
      ok: false,
    });
  });

  it("detects disconnection and fields that become sensitive", async () => {
    document.body.innerHTML = `<textarea id="editor">hello world</textarea>`;
    const editor = document.querySelector("#editor") as HTMLTextAreaElement;
    editor.setSelectionRange(0, 5);
    const adapter = new TextControlAdapter();
    const snapshot = await adapter.snapshot(editor);
    editor.setAttribute("aria-label", "Password");
    expect((await adapter.validate(snapshot)).valid).toBe(false);
    editor.removeAttribute("aria-label");
    editor.remove();
    expect((await adapter.validate(snapshot)).valid).toBe(false);
    expect((await adapter.apply(snapshot, "new")).ok).toBe(false);
  });
});

describe("contenteditable adapter", () => {
  it("applies a uniquely anchored selection and undoes it", async () => {
    document.body.innerHTML = `<div id="editor" contenteditable="true">Hello <strong>awkward</strong> world</div>`;
    const editor = document.querySelector("#editor") as HTMLElement;
    Object.defineProperty(editor, "isContentEditable", { value: true });
    const text = editor.querySelector("strong")?.firstChild as Text;
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, 7);
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    const adapter = new ContentEditableAdapter();
    const snapshot = await adapter.snapshot(editor);
    const result = await adapter.apply(snapshot, "clear");
    expect(result.ok).toBe(true);
    expect(editor.textContent).toBe("Hello clear world");
    if (!result.ok) throw new Error("Expected edit success");
    expect(adapter.undo(result.undoToken).ok).toBe(true);
    expect(editor.textContent).toBe("Hello awkward world");
  });

  it("fails closed when an anchor is ambiguous", async () => {
    document.body.innerHTML = `<div id="editor" contenteditable="true">same and same</div>`;
    const editor = document.querySelector("#editor") as HTMLElement;
    Object.defineProperty(editor, "isContentEditable", { value: true });
    const text = editor.firstChild as Text;
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, 4);
    document.getSelection()?.addRange(range);
    const adapter = new ContentEditableAdapter();
    expect((await adapter.validate(await adapter.snapshot(editor))).valid).toBe(false);
  });

  it("rejects unsupported and stale contenteditable targets", async () => {
    const adapter = new ContentEditableAdapter();
    await expect(adapter.snapshot(document.createElement("div"))).rejects.toThrow(/supported/u);
    document.body.innerHTML = `<div id="editor" contenteditable="true">unique phrase</div>`;
    const editor = document.querySelector("#editor") as HTMLElement;
    Object.defineProperty(editor, "isContentEditable", { value: true });
    await expect(adapter.snapshot(editor)).rejects.toThrow(/Select text/u);
    const text = editor.firstChild as Text;
    const range = document.createRange();
    range.selectNodeContents(text);
    document.getSelection()?.addRange(range);
    const snapshot = await adapter.snapshot(editor);
    snapshot.timestamp = Date.now() - 11 * 60_000;
    expect((await adapter.validate(snapshot)).valid).toBe(false);
    snapshot.timestamp = Date.now();
    editor.remove();
    expect((await adapter.validate(snapshot)).valid).toBe(false);
    expect((await adapter.apply(snapshot, "replacement")).ok).toBe(false);
  });

  it("rejects invalid contenteditable replacement and invalid undo", async () => {
    document.body.innerHTML = `<div id="editor" contenteditable="true">unique phrase</div>`;
    const editor = document.querySelector("#editor") as HTMLElement;
    Object.defineProperty(editor, "isContentEditable", { value: true });
    const range = document.createRange();
    range.selectNodeContents(editor.firstChild as Text);
    document.getSelection()?.addRange(range);
    const adapter = new ContentEditableAdapter();
    const snapshot = await adapter.snapshot(editor);
    expect((await adapter.apply(snapshot, "bad\u0000text")).ok).toBe(false);
    expect(
      adapter.undo({
        element: editor,
        before: "before",
        after: "different",
        start: 0,
        replacementLength: 3,
        kind: "contenteditable",
      }),
    ).toMatchObject({ ok: false });
  });
});

describe("proposal and risk validation", () => {
  it("requires the exact original text", async () => {
    document.body.innerHTML = `<textarea id="editor">hello</textarea>`;
    const editor = document.querySelector("#editor") as HTMLTextAreaElement;
    editor.setSelectionRange(0, 5);
    const snapshot = await new TextControlAdapter().snapshot(editor);
    expect(
      validateProposal(
        {
          schemaVersion: 1,
          proposalId: crypto.randomUUID(),
          originalText: "other",
          replacementText: "new",
          warnings: [],
        },
        snapshot,
      ).valid,
    ).toBe(false);
    expect(
      validateProposal(
        {
          schemaVersion: 1,
          proposalId: crypto.randomUUID(),
          originalText: "hello",
          replacementText: "hi",
          warnings: [],
        },
        snapshot,
      ).valid,
    ).toBe(true);
  });

  it("detects semantic-risk token changes", () => {
    expect(
      detectEditRisks(
        "Do not pay $50 on 01/02/2026 to a@example.com at https://example.com",
        "Pay $60 on 02/02/2026 to b@example.com at https://other.test",
      ),
    ).toEqual(expect.arrayContaining(["email", "url", "number", "date", "negation"]));
    expect(detectEditRisks("Keep the facts", "Keep the facts")).toEqual([]);
  });
});
