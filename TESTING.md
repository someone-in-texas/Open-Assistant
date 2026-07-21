# Testing

## Local commands

| Command                 | Purpose                                                                |
| ----------------------- | ---------------------------------------------------------------------- |
| `pnpm test:unit`        | Shared schema, extraction, editor, and utility tests                   |
| `pnpm test:integration` | Cross-component and mock-boundary tests                                |
| `pnpm test:security`    | Prompt-injection and agent-policy adversarial tests                    |
| `pnpm test`             | Coverage-gated suite                                                   |
| `pnpm test:e2e`         | Temporary installed-extension Firefox launch check                     |
| `pnpm smoke`            | Build, lint, fixtures/mock, integration, and temporary Firefox install |

`pnpm smoke` always launches Firefox, confirms the temporary add-on installation, terminates only that disposable-profile process, and removes the profile. `FIREFOX_BINARY` may identify a Release, Beta, or ESR executable.

## Fixtures and debugging

`apps/fixture-server` serves deterministic pages from `packages/test-fixtures/pages`; the mock relay returns scripted SSE without a paid account. Prompt-injection corpus files live under `packages/test-fixtures/prompt-injection`. Failures write content-free service logs under `test-results/`, which CI uploads only on failure.

## Release matrix

PR CI covers Linux Firefox plus Windows/macOS build and core tests. Nightly covers current Release, Beta, and ESR. Before release, maintainers record manual smoke results for Windows 11 Release, Windows 10 ESR, Apple-silicon macOS Release, and Intel/oldest-supported macOS ESR when feasible. Check keyboard operation, light/dark/forced colors, 100–200% scaling, permission denial/revocation, private isolation, stream cancellation, edit/undo/staleness, bridge non-submission, and agent-disabled state.

Coverage gates are 90% statements/functions/lines and 85% branches overall, with 95% branch coverage expected for protocol, prompt-security, editor, and agent-policy changes.
