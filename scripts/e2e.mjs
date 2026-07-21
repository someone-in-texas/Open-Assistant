import { execFileSync, spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const profile = path.resolve("test-results/firefox-profile");
const results = path.resolve("test-results/smoke");
await rm(profile, { recursive: true, force: true });
await mkdir(profile, { recursive: true });
await mkdir(results, { recursive: true });

const args = [
  "exec",
  "web-ext",
  "run",
  "--source-dir",
  "apps/extension/dist",
  "--start-url",
  "http://127.0.0.1:4173/article.html",
  "--no-reload",
  "--keep-profile-changes",
  "--firefox-profile",
  profile,
];
if (process.env.FIREFOX_BINARY) args.push("--firefox", process.env.FIREFOX_BINARY);

const child = spawn("pnpm", args, { stdio: ["ignore", "pipe", "pipe"] });
let output = "";
for (const stream of [child.stdout, child.stderr]) {
  stream.on("data", (chunk) => {
    const text = chunk.toString();
    output += text;
    process.stdout.write(text);
  });
}
const exited = new Promise((resolve) =>
  child.once("exit", (status, signal) => resolve({ status, signal })),
);
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function profileFirefoxPids() {
  if (process.platform === "win32") return [];
  const listing = execFileSync("ps", ["-axo", "pid=,command="], { encoding: "utf8" });
  return listing
    .split("\n")
    .filter((line) => line.includes(profile) && /firefox/iu.test(line))
    .map((line) => Number.parseInt(line.trim().split(/\s+/u)[0] ?? "", 10))
    .filter((pid) => Number.isInteger(pid) && pid !== process.pid);
}

async function stopProfileFirefox() {
  if (process.platform === "win32") {
    const script = `$p=${JSON.stringify(profile)}; Get-CimInstance Win32_Process | Where-Object { $_.Name -match 'firefox' -and $_.CommandLine -like ('*' + $p + '*') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;
    const encoded = Buffer.from(script, "utf16le").toString("base64");
    try {
      execFileSync("powershell.exe", ["-NoProfile", "-EncodedCommand", encoded]);
    } catch {}
    return;
  }
  for (const pid of profileFirefoxPids()) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {}
  }
  await delay(500);
  for (const pid of profileFirefoxPids()) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {}
  }
}

let failure;
try {
  const launch = await Promise.race([
    exited.then((result) => ({ type: "exit", result })),
    delay(8_000).then(() => ({ type: "ready" })),
  ]);
  if (launch.type === "exit") {
    failure = new Error(
      `Firefox exited before the extension-install check (${launch.result.status ?? launch.result.signal ?? "unknown"}).`,
    );
  } else {
    if (!/Installed .* as a temporary add-on/iu.test(output)) {
      failure = new Error("web-ext did not confirm temporary extension installation.");
    }
    child.kill("SIGINT");
    const stopped = await Promise.race([exited.then(() => true), delay(3_000).then(() => false)]);
    if (!stopped) child.kill("SIGKILL");
  }
} catch (error) {
  failure = error;
} finally {
  await stopProfileFirefox();
  await rm(profile, { recursive: true, force: true });
}

if (failure) {
  await writeFile(path.join(results, "firefox.log"), output);
  throw failure;
}
