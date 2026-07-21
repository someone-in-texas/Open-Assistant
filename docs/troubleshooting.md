# Troubleshooting

- Unsupported page: `about:`, `view-source:`, AMO, protected PDF internals, restricted frames, and ungranted files cannot be read. Use selection/copy fallback.
- Permission denied: add the page again and accept the exact-origin prompt, or keep using copy/paste.
- Relay unreachable: verify origin-only URL, HTTPS/loopback rule, CSP build origin, health endpoint, firewall, and OIDC configuration.
- Authentication expired: sign in again; never paste cookies or tokens into issue reports.
- Edit stale/unsupported: keep the proposal, copy it, reselect exact text, and retry. Complex rich editors are intentionally unsupported.
- Native host missing: verify manifest location, absolute binary path, extension ID, platform signature, and OS credential entry.
- ChatGPT insertion unavailable: the bundle is copied and the tab focused; paste manually. Nothing is submitted automatically.
- Agent policy block: interactive agent mode is intentionally disabled until its separate release gate passes.
