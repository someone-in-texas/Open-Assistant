# ADR 0001: Firefox MV3 event page and shared schemas

Status: accepted, 2026-07-20.

Firefox 140 is the minimum. The artifact declares both `background.scripts` and `background.service_worker` plus preferred environments; Firefox uses the non-persistent module script while other engines can select their supported environment. Protocol objects live in a strict shared Zod package and are validated at every extension, relay, and model-output boundary. This prevents independent client/server drift and rejects unknown capability fields.

The consequence is that event-page memory can disappear. Persist only harmless metadata, cancel/reconstruct sessions safely, and require context refresh after restart. Zod increases bundle size but materially improves the hostile-boundary review story.
