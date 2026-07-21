import { execPnpmSync } from "./lib/pnpm.mjs";

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
  execPnpmSync(args, { stdio: "inherit" });
