import { execFileSync } from "node:child_process";
import { mkdir, readdir, rename, rm, stat, utimes } from "node:fs/promises";
import path from "node:path";

const version = JSON.parse(
  await (await import("node:fs/promises")).readFile("package.json", "utf8"),
).version;
const output = path.resolve("artifacts");
await mkdir(output, { recursive: true });
await rm(path.join(output, `open-assistant-firefox-${version}-unsigned.zip`), { force: true });
execFileSync("pnpm", ["build:extension:production"], { stdio: "inherit" });

async function files(directory, prefix = "") {
  const entries = await readdir(directory);
  const result = [];
  for (const entry of entries.sort()) {
    const absolute = path.join(directory, entry);
    const relative = path.join(prefix, entry);
    if ((await stat(absolute)).isDirectory()) result.push(...(await files(absolute, relative)));
    else result.push(relative);
  }
  return result;
}

const source = path.resolve("apps/extension/dist");
const epoch = new Date("1980-01-01T00:00:00.000Z");
const entries = await files(source);
for (const entry of entries) await utimes(path.join(source, entry), epoch, epoch);
execFileSync(
  "zip",
  ["-X", "-q", path.join(output, `open-assistant-firefox-${version}-unsigned.zip`), ...entries],
  { cwd: source },
);
const webExtArtifacts = path.resolve("apps/extension/web-ext-artifacts");
await rm(webExtArtifacts, { recursive: true, force: true });
execFileSync(
  process.execPath,
  [
    path.resolve("node_modules/web-ext/bin/web-ext.js"),
    "build",
    "--source-dir",
    source,
    "--artifacts-dir",
    webExtArtifacts,
    "--overwrite-dest",
  ],
  { stdio: "inherit" },
);
const webExtFile = (await readdir(webExtArtifacts)).find((name) => name.endsWith(".zip"));
if (webExtFile)
  await rename(
    path.join(webExtArtifacts, webExtFile),
    path.join(output, `open-assistant-firefox-${version}-web-ext.zip`),
  );
console.log(`Created deterministic unsigned extension package for ${version}.`);
