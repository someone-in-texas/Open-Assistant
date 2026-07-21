# AMO reviewer notes

## Feature and affiliation

Open Assistant for Firefox provides user-triggered page Q&A, reviewed multi-tab/selection context, safe text-edit proposals, and optional reviewed insertion into a visible ChatGPT composer. It is independent and not endorsed by OpenAI. Interactive agent actions are disabled.

## Reproducible build

Use Node.js 22.22.x, pnpm 11.5.1, `zip`, and Firefox 140+. From the source archive:

```bash
pnpm install --frozen-lockfile
pnpm release:verify
```

`pnpm build:extension` maps `apps/extension/src` plus shared package source to readable ESM bundles in `apps/extension/dist`. `pnpm package:extension` normalizes timestamps, sorts entries, and creates `artifacts/open-assistant-firefox-0.1.0-unsigned.zip`. Source maps and `bundle-meta.json` map outputs to inputs. No remote code, eval, remote font/style, or obfuscation is used.

## Login-free testing

Run `pnpm smoke`. The deterministic mock relay listens only on `127.0.0.1:8787`; fixtures use `127.0.0.1:4173`. Load the temporary extension, open the fixture article, add current page, review it, enter a prompt, and verify streamed mock text/citation. Use `editor.html` for apply/undo/stale tests and `injection.html` for hidden content. No paid account is required.

## Permissions and data

`activeTab`, `contextMenus`, `storage`, `tabs`, and `scripting` implement the reviewed workflows. HTTP/HTTPS/file origins plus clipboard/native/notifications are optional and requested only on invocation. Full rationale is in `docs/permissions.md`. Data categories map line-by-line in `docs/data-inventory.md`; website activity and telemetry remain optional/off.

Page excerpts, titles, URLs, prompt, and source locators are transmitted only after explicit context approval and Send. Mock mode stays local. Hosted/self-host details are in `PRIVACY.md`. Credentials are absent from extension storage/bundles.

## Native host and bridge

Native source is optional and not included in the XPI. It exists only for BYOK and uses a fixed extension ID/keychain/API endpoint; install details are in `docs/native-host.md`. The ChatGPT bridge asks for exact host access on invocation, writes only the reviewed bundle into a known visible composer, never presses Send, never reads chats/cookies/storage/network, and falls back to copy/focus.

Known limitations: privileged/AMO/restricted PDF/cross-origin frames and complex editors fail closed. File access requires Firefox user enablement. Security reports use the repository's private vulnerability-reporting form; ordinary support uses the public issue tracker without private data.
