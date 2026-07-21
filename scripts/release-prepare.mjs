import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";

const marker = process.argv.indexOf("--version");
const version = marker >= 0 ? process.argv[marker + 1] : undefined;
if (!version || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(version)) {
  console.error("Usage: pnpm release:prepare --version 1.2.3");
  process.exit(2);
}
if (execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim()) {
  console.error("Release preparation requires a clean working tree.");
  process.exit(1);
}
const jsonFiles = [
  "package.json",
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
for (const file of jsonFiles) {
  const value = JSON.parse(await readFile(file, "utf8"));
  value.version = version;
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}
const manifestFile = "apps/extension/public/manifest.json";
const manifest = JSON.parse(await readFile(manifestFile, "utf8"));
manifest.version = version;
await writeFile(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
const cargoFile = "apps/native-host/Cargo.toml";
await writeFile(
  cargoFile,
  (await readFile(cargoFile, "utf8")).replace(/^version = "[^"]+"/mu, `version = "${version}"`),
);
const date = new Date().toISOString().slice(0, 10);
const changelog = await readFile("CHANGELOG.md", "utf8");
await writeFile(
  "CHANGELOG.md",
  changelog.replace("## Unreleased", `## Unreleased\n\n## ${version} - ${date}`),
);
await writeFile(
  "docs/amo-listing/release-notes.md",
  `# ${version}\n\nSee [CHANGELOG.md](../../../CHANGELOG.md) for the curated changes in this release.\n`,
);
execFileSync("pnpm", ["install", "--lockfile-only"], { stdio: "inherit" });
execFileSync("pnpm", ["release:verify"], { stdio: "inherit" });
console.log("Release files are ready for a reviewed release PR. No tag or push was created.");
