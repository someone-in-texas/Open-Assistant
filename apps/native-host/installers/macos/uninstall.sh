#!/bin/sh
set -eu
rm -f "$HOME/Library/Application Support/Mozilla/NativeMessagingHosts/org.mozilla.open_assistant.json"
printf '%s\n' "Native manifest removed. Delete the org.mozilla.open-assistant Keychain item separately if desired."
