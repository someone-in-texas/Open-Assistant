# Native host

Build with the pinned stable Rust toolchain and `pnpm build:native`. The host is a single binary using 4-byte little-endian native-messaging framing, a 1 MiB hard limit, strict tagged requests, no shell/plugins, fixed OpenAI HTTPS destination, and OS credential storage.

macOS installs the manifest under `~/Library/Application Support/Mozilla/NativeMessagingHosts/`, uses the `org.mozilla.open-assistant` Keychain service, and requires a universal Developer ID signed/notarized/stapled release. Windows installs per-user under `%LOCALAPPDATA%`, registers `HKCU\Software\Mozilla\NativeMessagingHosts\org.mozilla.open_assistant`, uses Credential Manager, and requires Authenticode. Installer templates are under `apps/native-host/installers`; release packaging must verify signatures before attachment.
