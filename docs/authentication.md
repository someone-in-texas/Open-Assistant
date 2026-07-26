# Authentication and connection modes

Hosted relay deployments use OAuth 2.1/OIDC authorization code with PKCE through Firefox's identity flow. Access tokens are short-lived, issuer/audience bound, and kept in extension background memory; event-page suspension requires a new sign-in rather than persisting a bearer or refresh token. The reference relay validates JWT issuer, audience, expiry, and a fixed algorithm allowlist through remote JWKS.

Self-hosting uses the same `/v1` protocol and exact-origin optional Firefox permission. HTTPS is mandatory except `localhost`, `127.0.0.1`, or `[::1]`. A production build must compile its relay origin into CSP; arbitrary runtime CSP expansion is intentionally impossible.

Private BYOK uses `org.mozilla.open_assistant`. The native host stores `openai-api-key` under OS credential service `org.mozilla.open-assistant`, accepts messages only from `open-assistant@example.org`, rejects messages over 1 MiB, and calls only `https://api.openai.com/v1/responses`. The extension receives only redacted key presence. Keys never appear in extension storage, environment variables, command arguments, URLs, or logs.

Experimental Codex subscription mode uses the same native boundary and a dedicated Codex profile. The companion starts compatible Codex CLI app-server versions over stdio, asks app-server to begin ChatGPT browser login, and opens only credential-free HTTPS login URLs under `openai.com` or `chatgpt.com`. Codex owns token storage and refresh; the extension receives only sanitized account email, plan type, rate-limit percentages, and authentication state. API-key-authenticated Codex sessions are rejected in this mode so subscription and BYOK credentials cannot be confused.

Codex subscription mode is not generic OAuth for the OpenAI API. It does not replay ChatGPT web sessions, read browser cookies, or expose Codex tokens. Logging out removes the dedicated Open Assistant Codex session without affecting a user's default Codex CLI profile.
