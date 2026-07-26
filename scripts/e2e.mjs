import { execFileSync } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnPnpm } from "./lib/pnpm.mjs";

const results = path.resolve("test-results/smoke");
await mkdir(results, { recursive: true });

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function positiveInteger(name, fallback, maximum) {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isInteger(value) && value > 0 && value <= maximum ? value : fallback;
}

const installTimeout = positiveInteger("FIREFOX_INSTALL_TIMEOUT_MS", 45_000, 120_000);
const installAttempts = positiveInteger("FIREFOX_INSTALL_ATTEMPTS", 2, 3);
const installedPattern = /Installed .* as a temporary add-on/iu;
const maxCapturedOutput = 1_048_576;

function profileFirefoxPids(profile) {
  const listing = execFileSync("ps", ["-axo", "pid=,command="], { encoding: "utf8" });
  return listing
    .split("\n")
    .filter((line) => line.includes(profile) && /firefox/iu.test(line))
    .map((line) => Number.parseInt(line.trim().split(/\s+/u)[0] ?? "", 10))
    .filter((pid) => Number.isInteger(pid) && pid !== process.pid);
}

function stopWindowsProfileFirefox(profile) {
  const script = [
    "$profilePath = $env:OPEN_ASSISTANT_FIREFOX_PROFILE;",
    "Get-CimInstance Win32_Process |",
    "Where-Object { $_.Name -like 'firefox*' -and $_.CommandLine -like \"*$profilePath*\" } |",
    "ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }",
  ].join(" ");
  try {
    execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
      env: { ...process.env, OPEN_ASSISTANT_FIREFOX_PROFILE: profile },
      stdio: "ignore",
    });
  } catch {}
}

async function removeProfile(profile) {
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    try {
      await rm(profile, { recursive: true, force: true, maxRetries: 1, retryDelay: 250 });
      return;
    } catch (error) {
      if (attempt === 20) throw error;
      await delay(500);
    }
  }
}

async function stopProcessTree(child, exited, profile) {
  if (process.platform === "win32") {
    try {
      execFileSync("taskkill.exe", ["/F", "/T", "/PID", String(child.pid)], {
        stdio: "ignore",
      });
    } catch {}
    stopWindowsProfileFirefox(profile);
    await Promise.race([exited, delay(3_000)]);
    stopWindowsProfileFirefox(profile);
    await delay(500);
    return;
  }

  child.kill("SIGINT");
  const stopped = await Promise.race([exited.then(() => true), delay(3_000).then(() => false)]);
  if (!stopped) child.kill("SIGKILL");

  for (const pid of profileFirefoxPids(profile)) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {}
  }
  await delay(500);
  for (const pid of profileFirefoxPids(profile)) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {}
  }
}

async function runAttempt(attempt) {
  const profile = path.resolve(`test-results/firefox-profile-${attempt}`);
  await rm(profile, { recursive: true, force: true });
  await mkdir(profile, { recursive: true });
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

  const child = spawnPnpm(args, { stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  let confirmInstalled;
  const installed = new Promise((resolve) => {
    confirmInstalled = resolve;
  });
  for (const stream of [child.stdout, child.stderr]) {
    stream.on("data", (chunk) => {
      const text = chunk.toString();
      output = `${output}${text}`.slice(-maxCapturedOutput);
      process.stdout.write(text);
      if (installedPattern.test(output)) confirmInstalled();
    });
  }
  const exited = new Promise((resolve) =>
    child.once("exit", (status, signal) => resolve({ status, signal })),
  );

  let failure;
  let installTimer;
  try {
    const timedOut = new Promise((resolve) => {
      installTimer = setTimeout(() => resolve({ type: "timeout" }), installTimeout);
    });
    const launch = await Promise.race([
      installed.then(() => ({ type: "installed" })),
      exited.then((result) => ({ type: "exit", result })),
      timedOut,
    ]);
    if (launch.type === "exit") {
      failure = new Error(
        `Firefox exited before the extension-install check (${launch.result.status ?? launch.result.signal ?? "unknown"}).`,
      );
    } else if (launch.type === "timeout") {
      failure = new Error(
        `web-ext did not confirm temporary extension installation within ${installTimeout}ms.`,
      );
    }
  } catch (error) {
    failure = error;
  } finally {
    clearTimeout(installTimer);
    await stopProcessTree(child, exited, profile);
    await removeProfile(profile);
  }

  return { failure, output };
}

const attemptLogs = [];
let finalFailure;
for (let attempt = 1; attempt <= installAttempts; attempt += 1) {
  const result = await runAttempt(attempt);
  attemptLogs.push(`=== attempt ${attempt} ===\n${result.output}`);
  finalFailure = result.failure;
  if (!finalFailure) break;
  if (attempt < installAttempts) {
    console.warn(`Firefox install attempt ${attempt} failed; retrying with a clean profile.`);
  }
}

if (finalFailure) {
  await writeFile(path.join(results, "firefox.log"), `${attemptLogs.join("\n")}\n`);
  throw finalFailure;
}
