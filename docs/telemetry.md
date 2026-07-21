# Telemetry

Telemetry is absent from the active runtime path and defaults off. A future implementation must first request Firefox's optional `technicalAndInteraction` consent from a direct user gesture. Permitted fields are extension version, Firefox major, OS family, feature success/failure count, coarse performance bucket, and content-free error code.

Forbidden fields include URLs/domains, titles/content, selections, prompts/responses, screenshots, persistent conversation or auth IDs, user-entered text, and exact timestamps. Tests must show zero requests before both preference and Firefox permission are true. Private windows never emit telemetry.
