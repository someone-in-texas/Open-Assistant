#!/bin/sh
set -eu
binary_path="$1"
target_dir="$HOME/Library/Application Support/Mozilla/NativeMessagingHosts"
manifest_path="$target_dir/org.mozilla.open_assistant.json"
mkdir -p "$target_dir"
escaped_path=$(printf '%s' "$binary_path" | sed 's/[&/]/\\&/g')
sed "s/__ABSOLUTE_BINARY_PATH__/$escaped_path/" "$(dirname "$0")/../../native-manifest.json" > "$manifest_path"
chmod 600 "$manifest_path"
