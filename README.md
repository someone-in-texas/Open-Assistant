# Open Assistant for Firefox

Open Assistant for Firefox is an independent, open-source Firefox desktop extension for asking questions about user-approved pages, comparing selected tabs, reviewing writing changes, and handing a reviewed context bundle to a visible ChatGPT composer without pressing Send.

> This project is not affiliated with or endorsed by OpenAI. It does not use ChatGPT cookies, scrape private ChatGPT APIs, or imply official integration.

## Status

Version 0.1.0 implements the reviewable Milestone 1–3 foundation: strict shared protocols, current-page and multi-tab extraction, selection actions, streaming chat, citations, safe textarea/input/basic-contenteditable editing with undo, a copy-safe ChatGPT bridge, a deterministic mock relay, a production relay reference, and a local agent policy package. Interactive agent execution is compiled off until the independent safety gate in [docs/agent-safety.md](docs/agent-safety.md) is complete.

The repository is release-capable, but Mozilla signing, native binary signing/notarization, external security review, and cross-platform signed-beta smoke evidence are maintainer-controlled release gates rather than artifacts that can be created from a clean local checkout.

## Privacy and security summary

- Page content is extracted only after a user action and sent only when the user submits a request.
- Context chips and a full review view show what will be shared.
- Site access is optional, runtime-requested, and revocable.
- Page text is serialized as untrusted data, never as policy.
- Model output cannot call extension APIs and rendered Markdown is sanitized.
- Password, payment, one-time-code, hidden, and suspiciously labeled controls are excluded.
- Conversation messages are local by default; extracted context is memory/session only.
- Telemetry and agent interaction are off by default.
- API credentials remain in the relay secret store or optional OS keychain companion.

See [PRIVACY.md](PRIVACY.md) and [THREAT_MODEL.md](THREAT_MODEL.md).

## Supported platforms

- Firefox 140 or newer, including current Release and ESR
- Windows 10/11 x64
- macOS 10.15 or newer on supported Intel and Apple silicon Firefox builds

Firefox for Android and arbitrary desktop control are out of scope for version 1.

## Development quick start

Prerequisites: Node.js 22.22.x, pnpm 11.5.1, Firefox 140+, `zip`, and Rust stable only when building the optional native host.

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm test
pnpm lint:webext
pnpm smoke
```

Mock mode runs on loopback and needs no API key. Start its services separately when developing the sidebar:

```bash
pnpm build:relay
pnpm --filter @open-assistant/mock-relay start
pnpm --filter @open-assistant/fixture-server start
pnpm dev:extension
```

Then load `apps/extension/dist/manifest.json` as a temporary add-on or run:

```bash
pnpm exec web-ext run --source-dir apps/extension/dist --start-url http://127.0.0.1:4173/
```

## Architecture

The Firefox sidebar and options UI communicate with a non-persistent MV3 background event page. The background owns permissions, context session state, relay calls, and cancellation. Content scripts expose only bounded extraction and editor operations. Shared Zod schemas validate extension/relay boundaries. The hosted reference relay keeps model instructions and OpenAI credentials server-side. See [docs/architecture.md](docs/architecture.md).

## Documentation

- [Contributor guide](CONTRIBUTING.md)
- [Testing](TESTING.md)
- [Release process](RELEASE.md)
- [Self-hosting](docs/self-hosting.md)
- [Authentication](docs/authentication.md)
- [Firefox permissions](docs/permissions.md)
- [AMO reviewer notes](docs/amo-review-notes.md)
- [Native companion](docs/native-host.md)
- [Support](SUPPORT.md)

## License

Mozilla Public License 2.0. See [LICENSE](LICENSE).
