# Self-hosting

Configure `OPENAI_API_KEY`, chat/agent model allowlists, allowed extension origins, OIDC issuer/audience, host, and port from `.env.example`. Use a separate OpenAI project from staging, strict spend/rate limits, TLS termination, a non-root read-only container, secret manager injection, and egress limited to OpenAI plus the identity provider.

```bash
pnpm install --frozen-lockfile
pnpm build:relay
NODE_ENV=production OPEN_ASSISTANT_AUTH_MODE=oidc node apps/relay/dist/index.js
```

For Docker, build from repository root with `docker build -f apps/relay/Dockerfile .`. Compile the exact relay origin into the extension CSP using `OPEN_ASSISTANT_RELAY_ORIGIN=https://assistant.example.org pnpm build:extension`, then request that exact origin in settings. Never use plaintext HTTP outside loopback. Health is `/v1/health`; content is excluded from logs and backups.
