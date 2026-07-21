import { contentCommandSchema } from "@open-assistant/protocol";

const ADAPTER_VERSION = 1;

function visible(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  return (
    rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden"
  );
}

function composer(): HTMLElement | undefined {
  const candidates = document.querySelectorAll<HTMLElement>(
    "textarea[data-testid='prompt-textarea'], #prompt-textarea[contenteditable='true'], textarea[placeholder*='Message']",
  );
  return [...candidates].find(visible);
}

function insertText(target: HTMLElement, text: string): boolean {
  target.focus({ preventScroll: false });
  if (target instanceof HTMLTextAreaElement) {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
    descriptor?.set?.call(target, text);
    target.dispatchEvent(
      new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }),
    );
    return target.value === text;
  }
  if (target.contentEditable === "true") {
    target.replaceChildren(document.createTextNode(text));
    target.dispatchEvent(
      new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }),
    );
    return target.textContent === text;
  }
  return false;
}

browser.runtime.onMessage.addListener((raw: unknown) => {
  const command = contentCommandSchema.parse(raw);
  if (command.type !== "CHATGPT_INSERT")
    return Promise.resolve({ inserted: false, adapterVersion: ADAPTER_VERSION });
  const target = composer();
  return Promise.resolve({
    inserted: target ? insertText(target, command.text) : false,
    adapterVersion: ADAPTER_VERSION,
  });
});
