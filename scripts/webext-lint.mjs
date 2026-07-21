import { execFileSync } from "node:child_process";
import path from "node:path";

const major = Number(process.versions.node.split(".")[0]);
if (major !== 22) {
  console.error(`web-ext is release-verified on Node 22.22.x; current Node is ${process.version}.`);
  process.exit(1);
}
execFileSync(
  process.execPath,
  [
    path.resolve("node_modules/web-ext/bin/web-ext.js"),
    "lint",
    "--source-dir",
    "apps/extension/dist",
    "--warnings-as-errors",
    "--no-config-discovery",
  ],
  { stdio: "inherit" },
);
