# Privacy notice

Effective date: 2026-07-20

Open Assistant for Firefox has no advertising, sells no data, includes no third-party analytics SDK, and does not monitor browsing in the background.

## What is processed

When you explicitly add page or selection context and submit a prompt, the extension sends that prompt, the reviewed excerpts, page title and URL, source locators, and short-lived session identifiers to your configured relay. Hosted mode may forward the request to the OpenAI API. Self-hosted mode sends it to the operator you chose. Native BYOK mode sends it through the local companion to OpenAI. Do not include secrets or sensitive personal data.

Authentication identifiers and coarse usage totals may be processed by a hosted relay for access control, abuse prevention, quotas, and billing. Application logs exclude raw prompts, page content, selections, screenshots, and model responses by default. Security metadata defaults to 30 days. Feedback is retained only when a feedback UI shows exactly what will be included.

## Local storage and controls

Preferences and conversation messages are local by default. Extracted context is held in memory/session storage and cleared when removed or Firefox restarts. Private-window conversations and context remain memory-only and are isolated from ordinary windows. You can review/remove context, revoke each origin, export conversations, delete local data, or call the hosted account-deletion endpoint.

Telemetry is disabled. If enabled in a future release, Firefox's optional `technicalAndInteraction` permission is requested first; permitted events contain only version, OS family, Firefox major, coarse timing, feature success/failure counts, and content-free error codes. They never contain URLs, titles, prompts, responses, selections, screenshots, authentication identifiers, or user-entered text.

Agent interaction is disabled until the published safety gate passes. If later enabled, it will separately request optional website-activity consent and display an active lease/audit indicator. Audit logs omit screenshots and full page content.

The optional ChatGPT bridge requests access to `https://chatgpt.com/*` only when invoked, inserts the reviewed bundle into the visible composer, and never presses Send or reads cookies, account data, prior chats, memories, projects, files, storage, or network traffic.

For deletion or privacy questions, contact the monitored address listed in the published AMO listing. Material notice changes are recorded in `CHANGELOG.md`.
