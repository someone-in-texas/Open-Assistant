import { execFileSync } from "node:child_process";

for (const args of [
  ["check:versions"],
  ["check:data-inventory"],
  ["format:check"],
  ["lint"],
  ["typecheck"],
  ["test"],
  ["build"],
  ["lint:webext"],
  ["package:extension"],
])
  execFileSync("pnpm", args, { stdio: "inherit" });
