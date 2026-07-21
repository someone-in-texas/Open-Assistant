import { build, context } from "esbuild";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { URL } from "node:url";

const root = path.resolve(import.meta.dirname, "..");
const output = path.join(root, "dist");
const watch = process.argv.includes("--watch");
const production = process.argv.includes("--mode=production");
function validatedOrigin(value, label, allowLoopback = false) {
  const url = new URL(value);
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !(allowLoopback && loopback && url.protocol === "http:")) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(`${label} must be an HTTPS origin without credentials or a path.`);
  }
  return url.origin;
}
const hostedOrigin = validatedOrigin(
  process.env.OPEN_ASSISTANT_HOSTED_ORIGIN ?? "https://assistant.example.invalid",
  "Hosted relay origin",
);
const oidcOrigin = validatedOrigin(
  process.env.OPEN_ASSISTANT_OIDC_ORIGIN ?? "https://identity.example.invalid",
  "OIDC origin",
);
const relayOrigin = production
  ? hostedOrigin
  : validatedOrigin(
      process.env.OPEN_ASSISTANT_RELAY_ORIGIN ?? "http://127.0.0.1:8787",
      "Development relay origin",
      true,
    );

if (!watch) await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(path.join(root, "public"), output, { recursive: true });

const manifest = JSON.parse(await readFile(path.join(root, "public", "manifest.json"), "utf8"));
const connectOrigins = [...new Set([relayOrigin, hostedOrigin, oidcOrigin])].join(" ");
manifest.content_security_policy.extension_pages = `script-src 'self'; object-src 'none'; connect-src 'self' ${connectOrigins}`;
await writeFile(path.join(output, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

const options = {
  absWorkingDir: root,
  entryPoints: {
    background: "src/background/index.ts",
    content: "src/content/index.ts",
    "chatgpt-bridge": "src/chatgpt-bridge/index.ts",
    "sidebar/index": "src/sidebar/index.tsx",
    "options/index": "src/options/index.tsx",
    "onboarding/index": "src/onboarding/index.tsx",
  },
  bundle: true,
  outdir: output,
  format: "esm",
  target: "firefox140",
  platform: "browser",
  sourcemap: true,
  minify: false,
  legalComments: "eof",
  metafile: true,
  define: {
    __DEFAULT_RELAY_ORIGIN__: JSON.stringify(relayOrigin),
    __BUILD_MODE__: JSON.stringify(production ? "production" : "development"),
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
};

if (watch) {
  const buildContext = await context(options);
  await buildContext.watch();
  console.log("Watching extension sources…");
} else {
  const result = await build(options);
  for (const file of ["sidebar/index.js", "options/index.js", "onboarding/index.js"]) {
    const target = path.join(output, file);
    const bundled = await readFile(target, "utf8");
    const assignment = "              domElement.innerHTML = key;";
    const matches = bundled.split(assignment).length - 1;
    if (matches !== 2) {
      throw new Error(
        `Expected two reviewed React DOM innerHTML compatibility assignments in ${file}; found ${matches}.`,
      );
    }
    await writeFile(
      target,
      bundled.replaceAll(
        assignment,
        '              throw new Error("Dynamic HTML is disabled by extension policy.");',
      ),
    );
  }
  await writeFile(
    path.join(output, "bundle-meta.json"),
    `${JSON.stringify(result.metafile, null, 2)}\n`,
  );
}
