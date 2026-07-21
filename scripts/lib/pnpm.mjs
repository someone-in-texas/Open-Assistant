import { execFileSync, spawn } from "node:child_process";

function invocation(args) {
  const npmExecPath = process.env.npm_execpath;
  if (npmExecPath) return [process.execPath, [npmExecPath, ...args]];
  return [process.platform === "win32" ? "pnpm.cmd" : "pnpm", args];
}

export function execPnpmSync(args, options = {}) {
  const [command, commandArgs] = invocation(args);
  return execFileSync(command, commandArgs, options);
}

export function spawnPnpm(args, options = {}) {
  const [command, commandArgs] = invocation(args);
  return spawn(command, commandArgs, options);
}
