import { spawnSync } from "node:child_process";

const check = spawnSync("cargo", ["--version"], { encoding: "utf8" });
if (check.status !== 0) {
  console.error(
    "Rust/Cargo is required for the optional native companion. Install the pinned stable toolchain documented in docs/native-host.md.",
  );
  process.exit(1);
}
const result = spawnSync(
  "cargo",
  ["build", "--locked", "--release", "--manifest-path", "apps/native-host/Cargo.toml"],
  { stdio: "inherit" },
);
process.exit(result.status ?? 1);
