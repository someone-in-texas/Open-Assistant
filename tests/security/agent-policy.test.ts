import { describe, expect, it } from "vitest";
import {
  RepetitionGuard,
  createLease,
  decideAction,
  isSensitiveField,
  validateLease,
} from "@open-assistant/agent-policy";

const now = new Date("2026-07-20T12:00:00.000Z");
const elements = [
  { id: "safe", role: "button", label: "Open details" },
  { id: "send", role: "button", label: "Send message" },
  { id: "password", role: "textbox", label: "Password", inputType: "password" },
];

describe("agent leases", () => {
  it("defaults to one read-only tab and a 15-minute lease", () => {
    const lease = createLease({ tabId: 4, windowId: 2, origin: "https://example.com/path", now });
    expect(lease).toMatchObject({
      tabId: 4,
      windowId: 2,
      origin: "https://example.com",
      mode: "read",
      maxActions: 50,
      allowedActionClasses: ["observe"],
    });
    expect(new Date(lease.expiresAt).getTime() - now.getTime()).toBe(15 * 60_000);
    expect(
      createLease({ tabId: 1, windowId: 1, origin: "https://example.com" }).issuedAt,
    ).toBeTruthy();
  });

  it("invalidates tab, origin, timeout, and action-limit mismatches", () => {
    const lease = createLease({ tabId: 4, windowId: 2, origin: "https://example.com", now });
    expect(
      validateLease(lease, { tabId: 4, origin: "https://example.com/next", now, actions: 0 })
        .outcome,
    ).toBe("allow");
    expect(
      validateLease(lease, { tabId: 5, origin: "https://example.com", now, actions: 0 }).outcome,
    ).toBe("block");
    expect(
      validateLease(lease, { tabId: 4, origin: "https://other.test", now, actions: 0 }).outcome,
    ).toBe("block");
    expect(
      validateLease(lease, {
        tabId: 4,
        origin: "https://example.com",
        now: new Date(lease.expiresAt),
        actions: 0,
      }).outcome,
    ).toBe("block");
    expect(
      validateLease(lease, { tabId: 4, origin: "https://example.com", now, actions: 50 }).outcome,
    ).toBe("block");
  });
});

describe("local action policy", () => {
  it("blocks every write in a read-only lease", () => {
    const lease = createLease({ tabId: 1, windowId: 1, origin: "https://example.com", now });
    expect(decideAction(lease, { type: "click", elementId: "safe" }, elements).outcome).toBe(
      "block",
    );
    expect(
      decideAction(lease, { type: "scroll", direction: "down", amount: "small" }, elements).outcome,
    ).toBe("allow");
  });

  it("allows bounded safe actions but confirms consequential effects", () => {
    const lease = createLease({
      tabId: 1,
      windowId: 1,
      origin: "https://example.com",
      mode: "interact",
      now,
    });
    expect(decideAction(lease, { type: "click", elementId: "safe" }, elements).outcome).toBe(
      "allow",
    );
    expect(decideAction(lease, { type: "click", elementId: "send" }, elements).outcome).toBe(
      "confirm",
    );
    expect(
      decideAction(lease, { type: "navigate", url: "https://example.com/next" }, elements).outcome,
    ).toBe("allow");
    expect(
      decideAction(lease, { type: "navigate", url: "https://other.test" }, elements).outcome,
    ).toBe("confirm");
    expect(decideAction(lease, { type: "go_back" }, elements).outcome).toBe("confirm");
  });

  it("blocks sensitive, stale, malformed, and unsafe targets", () => {
    const lease = createLease({
      tabId: 1,
      windowId: 1,
      origin: "https://example.com",
      mode: "interact",
      now,
    });
    expect(
      decideAction(lease, { type: "type", elementId: "password", text: "secret" }, elements)
        .outcome,
    ).toBe("block");
    expect(decideAction(lease, { type: "click", elementId: "missing" }, elements).outcome).toBe(
      "block",
    );
    expect(decideAction(lease, { type: "click", selector: "#pay" }, elements).outcome).toBe(
      "block",
    );
    expect(
      decideAction(lease, { type: "navigate", url: "javascript:alert(1)" }, elements).outcome,
    ).toBe("block");
    expect(
      decideAction(lease, { type: "navigate", url: "https://user:pass@example.com" }, elements)
        .outcome,
    ).toBe("block");
    expect(
      decideAction(
        lease,
        { type: "type", elementId: "safe", text: "My password is secret" },
        elements,
      ).outcome,
    ).toBe("confirm");
  });

  it("classifies sensitive fields from multiple hints", () => {
    expect(
      isSensitiveField({
        id: "x",
        role: "textbox",
        label: "normal",
        autocomplete: "one-time-code",
      }),
    ).toBe(true);
    expect(isSensitiveField({ id: "x", role: "textbox", label: "normal" })).toBe(false);
  });
});

describe("loop safeguards", () => {
  it("stops after five equivalent actions", () => {
    const guard = new RepetitionGuard();
    for (let index = 0; index < 4; index += 1)
      expect(guard.record({ type: "click", elementId: "safe" }).outcome).toBe("allow");
    expect(guard.record({ type: "click", elementId: "safe" }).outcome).toBe("block");
    expect(guard.record({ type: "focus", elementId: "safe" }).outcome).toBe("allow");
  });

  it("stops after three recent validation failures", () => {
    const guard = new RepetitionGuard();
    expect(guard.validationFailure(1_000).outcome).toBe("allow");
    expect(guard.validationFailure(2_000).outcome).toBe("allow");
    expect(guard.validationFailure(3_000).outcome).toBe("block");
    expect(guard.validationFailure(70_000).outcome).toBe("allow");
    expect(new RepetitionGuard().validationFailure().outcome).toBe("allow");
  });
});
