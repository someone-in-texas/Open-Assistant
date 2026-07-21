# Enterprise deployment

Enterprises should self-host the relay behind managed OIDC, pin the extension ID, preconfigure only approved HTTPS origins, disable telemetry and agent mode, retain content-free security logs, and apply outbound policy allowing only the identity provider and OpenAI. Managed configuration must never inject API keys into extension storage. Document data residency, deletion SLA, incident contacts, model allowlist/cost caps, native-host signing, and permission review for employees.
