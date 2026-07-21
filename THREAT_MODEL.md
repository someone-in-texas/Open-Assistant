# Threat model

## Assets and trust boundaries

Protected assets are user-approved page context, prompts/responses, origin permissions, relay tokens, OpenAI credentials, native-host keys, editor integrity, agent capabilities, audit records, and release artifacts. Trust descends from extension/relay policy, to the explicit user request, approved context scope, model output, and finally hostile page content. Lower layers cannot redefine higher ones.

## STRIDE analysis

| Threat                 | Example                                                                     | Controls                                                                                                                  | Residual risk                                  |
| ---------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Spoofing               | Page or extension forges a runtime message                                  | Sender ID/URL checks, strict schemas, fixed native extension allowlist, OIDC audience/issuer validation                   | Browser or signed-extension compromise         |
| Tampering              | DOM changes between edit preview and apply                                  | Exact selection, surrounding hash, expiry, editor instance check, ambiguous-range rejection, one-step undo                | Complex editor mutation                        |
| Repudiation            | Agent claims an action was approved                                         | Local policy/confirmation owner and redacted audit categories                                                             | Audit is local and bounded                     |
| Information disclosure | Page requests cookies, extra tabs, hidden fields, secrets                   | Explicit source selection, hidden/sensitive filtering, no cookie/storage API, structured context, redacted logs           | User may intentionally paste sensitive content |
| Denial of service      | Huge DOM, repeated actions, streaming stalls                                | Byte/chunk limits, body limits, cancellation, lease/action/repetition/failure caps, rate limits                           | Resource exhaustion below thresholds           |
| Elevation of privilege | Prompt injection asks for click, arbitrary JS, selector, URL, or new origin | Chat has no tools, strict action union, ephemeral IDs, no JS/CSS/XPath, origin-bound lease, confirmations, agent disabled | Future action-engine defects                   |

## Scenario review

- Malicious pages and iframes are untrusted; cross-origin frames require separate permission and are excluded in MVP.
- Model output is inert Markdown or strict structured data. Sanitization, URL allowlisting, exact-target edits, and local action policy contain malicious output.
- A compromised relay can see submitted content and responses; users may self-host or use the native companion, TLS is mandatory outside loopback, tokens are audience-bound, and secrets stay server-side.
- A stolen extension token is limited by short lifetime, audience, relay quotas, and rotation; it does not grant browser capabilities.
- A compromised native host can access its key. The host is single-purpose, schema/size bounded, has no shell or plugin loading, and requires signed distribution.
- DOM clobbering and prototype pollution are limited by isolated-world content scripts, schema `.strict()`, bounded primitives, no page globals for security decisions, and no exported `window` objects.
- SSRF is limited by HTTPS/loopback origin validation, origin-only configuration, fixed relay/OpenAI paths, and redirect rejection.
- Release compromise is mitigated by pinned actions, protected tags/environments, lockfiles, checksums, SBOM, provenance, AMO signing, and independent artifact verification.

## Security review triggers

Manifest/data permissions, content injection, runtime routing, auth/token storage, Markdown, edit application, agent actions/confirmations, native messaging, relay URLs, remote configuration, and release/signing changes require focused review.
