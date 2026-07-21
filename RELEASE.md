# Release process

1. Confirm `main` is protected, CI is green, the changelog is curated, security/privacy reviews are complete, and external smoke evidence is attached.
2. Run `pnpm release:prepare --version X.Y.Z` from a clean tree. Review the generated version, changelog, AMO notes, and lockfile changes in a release PR.
3. Merge the approved PR. Create and push an annotated tag: `git tag -s vX.Y.Z -m "Open Assistant vX.Y.Z"`.
4. The tag workflow verifies the tag/main relationship and version parity, runs all gates, builds deterministic extension/source archives, generates SBOM/checksums/provenance, creates a draft GitHub release, and submits to AMO through the approval-protected `production` environment.
5. When AMO review completes, the status workflow attaches the Mozilla-signed XPI and publishes or updates the release. Native binaries are attached only after Authenticode or Developer ID/notarization verification.

AMO issuer/secret, signing keys, OIDC, container-registry, and notarization credentials belong only in approval-protected environment secrets. Never print derived tokens. Rotate after maintainer departure or suspected exposure.

## Verification and rollback

Compare `SHA256SUMS`, SBOM, attestations, and a clean-checkout rebuild. Install only the Mozilla-signed XPI for user smoke. For rollback: disable risky server features, use the signed kill switch only to disable agent/bridge behavior, revoke affected tokens/keys, deprecate the GitHub release, submit an AMO replacement, publish a patch, and use `docs/runbooks/incident-response.md` for communication. AMO does not downgrade installed versions automatically; remediation normally requires a higher patch version.
