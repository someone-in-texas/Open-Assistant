# Authentication and connection modes

Hosted relay deployments use OAuth 2.1/OIDC authorization code with PKCE through Firefox's identity flow. Access tokens are short-lived, issuer/audience bound, and kept in extension background memory; event-page suspension requires a new sign-in rather than persisting a bearer or refresh token. The reference relay validates JWT issuer, audience, expiry, and a fixed algorithm allowlist through remote JWKS.

Self-hosting uses the same `/v1` protocol and exact-origin optional Firefox permission. HTTPS is mandatory except `localhost`, `127.0.0.1`, or `[::1]`. A production build must compile its relay origin into CSP; arbitrary runtime CSP expansion is intentionally impossible.

BYOK uses `org.mozilla.open_assistant`. The native host stores `openai-api-key` under OS keychain service `org.mozilla.open-assistant`, accepts messages only from `open-assistant@example.org`, rejects messages over 1 MiB, and calls the fixed OpenAI Responses endpoint. Keys never appear in extension storage, environment variables, command arguments, or logs.
