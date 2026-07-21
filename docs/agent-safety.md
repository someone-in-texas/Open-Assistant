# Agent safety gate

Interactive agent actions are hard-disabled in production configuration and the relay returns a policy error. Read-only policy primitives cannot grant interaction.

Production enablement requires: independent security-engineer review; the full injection corpus; at least 500 automated adversarial scenarios with zero unauthorized high-impact actions; manual red-team coverage of commerce, email, social, cloud admin, and account settings; sensitive-field fixture coverage; origin-change suspension; local Stop under network failure; accurate redacted audit; confirmation-bypass testing; experimental labeling; a signed disable-only remote kill switch; AMO/privacy disclosure; optional `websiteActivity` consent; and a tested rollback.

Leases default to 15 minutes, one tab, one top-level origin, read-only, and 50 actions. Structured action validation, ephemeral observed element IDs, field classification, consequence confirmation, repetition/failure caps, and local audit are policy-engine decisions—not model decisions. No arbitrary JavaScript, CSS/XPath, network fetch, clipboard read, file picker, executable download acceptance, browser chrome, or new window capability exists.
