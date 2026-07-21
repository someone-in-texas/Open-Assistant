import {
  agentActionSchema,
  agentLeaseSchema,
  type AgentAction,
  type AgentLease,
} from "@open-assistant/protocol";
import { isSafeExternalUrl } from "@open-assistant/prompt-security";

export type ObservedElement = {
  id: string;
  role: string;
  label: string;
  inputType?: string;
  autocomplete?: string;
  href?: string;
};

export type PolicyDecision =
  | { outcome: "allow" }
  | { outcome: "confirm"; reason: string }
  | { outcome: "block"; reason: string };

const SENSITIVE =
  /(?:password|passcode|one.?time|otp|credit|debit|card|cvv|cvc|bank|routing|ssn|social.?security|health|medical)/iu;
const CONSEQUENTIAL =
  /(?:send|submit|post|publish|delete|remove|buy|purchase|pay|book|donate|transfer|upload|download|agree|accept|sign.?in|log.?in|create.?account)/iu;

export function createLease(input: {
  tabId: number;
  windowId: number;
  origin: string;
  mode?: "read" | "interact";
  now?: Date;
}): AgentLease {
  const now = input.now ?? new Date();
  const lease = {
    leaseId: crypto.randomUUID(),
    tabId: input.tabId,
    windowId: input.windowId,
    origin: new URL(input.origin).origin,
    issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 15 * 60_000).toISOString(),
    mode: input.mode ?? "read",
    allowedActionClasses:
      input.mode === "interact"
        ? (["observe", "navigate", "interact"] as const)
        : (["observe"] as const),
    maxActions: 50,
  };
  return agentLeaseSchema.parse(lease);
}

export function validateLease(
  lease: AgentLease,
  state: { tabId: number; origin: string; now?: Date; actions: number },
): PolicyDecision {
  if (lease.tabId !== state.tabId)
    return { outcome: "block", reason: "The action targets a different tab." };
  if (new URL(lease.origin).origin !== new URL(state.origin).origin)
    return { outcome: "block", reason: "Navigation changed the authorized origin." };
  if (new Date(lease.expiresAt).getTime() <= (state.now ?? new Date()).getTime())
    return { outcome: "block", reason: "The agent lease expired." };
  if (state.actions >= lease.maxActions)
    return { outcome: "block", reason: "The action limit was reached." };
  return { outcome: "allow" };
}

export function isSensitiveField(element: ObservedElement): boolean {
  return (
    element.inputType === "password" ||
    SENSITIVE.test(
      [element.role, element.label, element.inputType, element.autocomplete]
        .filter(Boolean)
        .join(" "),
    )
  );
}

export function decideAction(
  lease: AgentLease,
  unknownAction: unknown,
  elements: readonly ObservedElement[],
): PolicyDecision {
  const parsed = agentActionSchema.safeParse(unknownAction);
  if (!parsed.success)
    return { outcome: "block", reason: "The proposed action has an invalid schema." };
  const action = parsed.data;
  if (action.type === "done" || action.type === "wait" || action.type === "scroll")
    return { outcome: "allow" };
  if (lease.mode === "read") return { outcome: "block", reason: "This lease is read-only." };
  if (action.type === "navigate") {
    if (!isSafeExternalUrl(action.url))
      return { outcome: "block", reason: "The navigation URL is unsafe." };
    return new URL(action.url).origin === new URL(lease.origin).origin
      ? { outcome: "allow" }
      : {
          outcome: "confirm",
          reason: "Navigation leaves the authorized origin and will suspend the lease.",
        };
  }
  if (action.type === "go_back" || action.type === "press_key")
    return {
      outcome: "confirm",
      reason: "The effect cannot be determined from the current observation.",
    };
  const element = elements.find((candidate) => candidate.id === action.elementId);
  if (!element)
    return { outcome: "block", reason: "The element is absent from the latest observation." };
  if (isSensitiveField(element))
    return { outcome: "block", reason: "Sensitive fields cannot be read or modified." };
  if (CONSEQUENTIAL.test(`${element.role} ${element.label}`))
    return { outcome: "confirm", reason: "This action may have a consequential external effect." };
  if (action.type === "type" && SENSITIVE.test(action.text))
    return { outcome: "confirm", reason: "The text may contain sensitive information." };
  return { outcome: "allow" };
}

export class RepetitionGuard {
  readonly #history: string[] = [];
  readonly #failures: number[] = [];

  record(action: AgentAction): PolicyDecision {
    const signature = JSON.stringify(action);
    this.#history.push(signature);
    if (this.#history.length > 5) this.#history.shift();
    return this.#history.length === 5 && this.#history.every((item) => item === signature)
      ? { outcome: "block", reason: "The same action was proposed five times." }
      : { outcome: "allow" };
  }

  validationFailure(now = Date.now()): PolicyDecision {
    this.#failures.push(now);
    while ((this.#failures[0] ?? now) < now - 60_000) this.#failures.shift();
    return this.#failures.length >= 3
      ? { outcome: "block", reason: "Three action validation failures occurred." }
      : { outcome: "allow" };
  }
}
