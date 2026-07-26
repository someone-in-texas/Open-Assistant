# Data flow

1. The user opens the sidebar or selection menu; no network request occurs.
2. The user adds a page/tab. Firefox grants that exact origin, the isolated content script filters/normalizes/chunks it, and the sidebar displays a review.
3. On Send, the background routes the same strict request to the configured relay or optional native companion.
4. A relay validates auth/schema/limits and calls its configured model. Private BYOK passes the request over native messaging and calls the fixed OpenAI Responses endpoint with the OS-stored key. Experimental Codex mode sends it to a locked-down app-server child over stdio; Codex owns ChatGPT credentials and subscription limits.
5. Text deltas and source IDs stream back. Sanitized inert Markdown is rendered; source IDs map only to already-approved chunks.
6. Stop aborts the relay request or native task. Disconnecting the native port terminates remaining work; Codex child processes are killed on drop. Removing/revoking/navigating or changing providers invalidates context and the active conversation.

The ChatGPT bridge is a separate reviewed copy/insert path and never auto-submits. It does not share authentication with Codex subscription mode. Telemetry has no active network path by default.
