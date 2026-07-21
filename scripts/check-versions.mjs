import { readFile } from "node:fs/promises";

const expected = JSON.parse(await readFile("package.json", "utf8")).version;
const packageFiles = [
  "apps/extension/package.json",
  "apps/relay/package.json",
  "apps/mock-relay/package.json",
  "apps/fixture-server/package.json",
  "packages/protocol/package.json",
  "packages/extraction/package.json",
  "packages/editor/package.json",
  "packages/agent-policy/package.json",
  "packages/prompt-security/package.json",
  "packages/test-fixtures/package.json",
];
const mismatches = [];
for (const file of packageFiles) {
  const version = JSON.parse(await readFile(file, "utf8")).version;
  if (version !== expected) mismatches.push(`${file}: ${version}`);
}
const manifestVersion = JSON.parse(
  await readFile("apps/extension/public/manifest.json", "utf8"),
).version;
if (manifestVersion !== expected)
  mismatches.push(`apps/extension/public/manifest.json: ${manifestVersion}`);
const cargo = await readFile("apps/native-host/Cargo.toml", "utf8");
const cargoVersion = /^version = "([^"]+)"/mu.exec(cargo)?.[1];
if (cargoVersion !== expected)
  mismatches.push(`apps/native-host/Cargo.toml: ${cargoVersion ?? "missing"}`);
if (mismatches.length) {
  console.error(`Version mismatch; expected ${expected}:\n${mismatches.join("\n")}`);
  process.exit(1);
}
console.log(`All package versions match ${expected}.`);
