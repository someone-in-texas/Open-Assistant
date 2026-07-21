# Data flow

1. The user opens the sidebar or selection menu; no network request occurs.
2. The user adds a page/tab. Firefox grants that exact origin, the isolated content script filters/normalizes/chunks it, and the sidebar displays a review.
3. On Send, the extension sends the prompt and approved `ContextBundle` over HTTPS/SSE to the configured relay.
4. The relay validates auth/schema/limits, separates developer policy, user intent, and untrusted source objects, then calls the configured OpenAI Responses API model.
5. Text deltas and source IDs stream back. Sanitized inert Markdown is rendered; source IDs map only to already-approved chunks.
6. Stop aborts locally and closes the upstream stream. Removing/revoking/navigating invalidates context.

The ChatGPT bridge is a separate reviewed copy/insert path and never auto-submits. Native BYOK replaces relay processing with a length-framed local host and OS keychain. Telemetry has no active network path by default.
