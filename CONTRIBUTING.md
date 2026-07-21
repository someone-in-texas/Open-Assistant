# Contributing

## Prerequisites and setup

Use Node.js 22.22.x, pnpm 11.5.1, Firefox 140+, and Rust stable for native-host changes. Fork the repository, create a focused branch, run `pnpm install --frozen-lockfile`, and use conventional commit subjects such as `fix(editor): reject stale range`.

## Required checks

Run `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm lint:webext`, and `pnpm smoke`. Behavior changes require unit or integration coverage. Browser behavior changes require an installed-Firefox smoke result. Agent changes require adversarial cases.

## Permissions, dependencies, and data flows

Permission changes require matching edits to `docs/permissions.md`, `docs/data-inventory.md`, `PRIVACY.md`, the manifest-consistency test, and an explicit security review. New dependencies must provide clear value, have pinned lockfile entries, compatible licenses, and no unreviewed install scripts. A new network destination requires architecture, privacy, CSP, CORS, and SSRF review.

## Editor adapters

Add adapters through the `EditorAdapter` interface in `packages/editor`. An adapter must use a user-owned saved range, fail closed on ambiguity, avoid `innerHTML`, emit input events without submitting forms, provide one-step undo, and include fixture and stale-state tests. Document it in `docs/editor-adapters.md`.

## Pull request checklist

- [ ] Behavior matches `SPEC.md` and tests cover it.
- [ ] Permissions and privacy inventory remain accurate.
- [ ] No remote executable code or embedded credentials were added.
- [ ] Dependency and accessibility impact was reviewed.
- [ ] Windows, macOS, Firefox Release, and ESR behavior was considered.
- [ ] User-visible changes are recorded in `CHANGELOG.md`.
- [ ] Agent changes include adversarial tests and do not bypass the release gate.

Contributions are accepted under MPL-2.0. A Developer Certificate of Origin sign-off is required: add `Signed-off-by:` to commits.
