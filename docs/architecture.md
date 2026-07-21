# Architecture

The Firefox MV3 event page owns runtime permissions, per-session context, relay networking, cancellation, menu commands, bridge injection, and lifecycle invalidation. Sidebar/options/onboarding are extension pages. Content scripts run in Firefox's isolated world and expose a small validated command surface: bounded extraction, saved-selection edit, undo, and citation location. They never receive arbitrary code or selectors.

Shared packages own Zod wire schemas, extraction, editor adapters, prompt security, and local agent policy. The relay validates the same request objects, authenticates users, applies quotas, keeps developer instructions server-side, serializes sources as untrusted data, and calls the OpenAI Responses API. Mock mode implements the same versioned surface without credentials. The optional Rust native host uses length-framed messages, a fixed extension allowlist, OS keychain storage, and a fixed OpenAI endpoint.

State is deliberately split: preferences and local messages use `storage.local`; approved extracted chunks, active streams, agent leases, and private-window data are memory/session-only; credentials are relay-side or keychain-only. Event-page restart reconstructs only safe metadata and forces stale context to be re-read.

Builds are local-code-only ES modules with no remote scripts, styles, fonts, WebAssembly, eval, or model-executed code. Development and production relay origins are injected into manifest CSP at build time.
