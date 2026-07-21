# Protocol

All public relay endpoints are under `/v1`: health, identity, session create/delete, response, response stream, agent turn, feedback, and account-data deletion. Schemas are generated from `@open-assistant/protocol` and reject unknown fields. Requests have bounded sizes and UUID session/request IDs. SSE frames contain one strict `start`, `delta`, `citation`, `edit`, `done`, or redacted `error` object plus heartbeat comments.

Non-streaming mutations require an idempotency key. Responses include request IDs. Error taxonomy is auth, quota, policy, network, model, or validation. Default logs redact authorization and bodies. Page sources always carry `trust: untrusted-web-content`, stable source/chunk IDs, origin/hash/extraction metadata, and optional text-quote locators.
