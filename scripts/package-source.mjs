import { execFileSync } from "node:child_process";
import { mkdir } from "node:fs/promises";

const version = JSON.parse(
  await (await import("node:fs/promises")).readFile("package.json", "utf8"),
).version;
await mkdir("artifacts", { recursive: true });
execFileSync(
  "git",
  [
    "archive",
    "--format=zip",
    `--prefix=firefox-open-assistant-${version}/`,
    `--output=artifacts/open-assistant-firefox-${version}-source.zip`,
    "HEAD",
  ],
  { stdio: "inherit" },
);
execFileSync(
  "git",
  [
    "archive",
    "--format=tar.gz",
    `--prefix=firefox-open-assistant-${version}/`,
    `--output=artifacts/open-assistant-${version}.tar.gz`,
    "HEAD",
  ],
  { stdio: "inherit" },
);
