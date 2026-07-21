import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { execPnpmSync } from "./lib/pnpm.mjs";

const workspaces = JSON.parse(
  execPnpmSync(["list", "-r", "--json", "--depth", "Infinity"], {
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
  }),
);
const components = new Map();
function visit(group) {
  for (const [name, dependency] of Object.entries(group ?? {})) {
    const version = dependency.version ?? "unknown";
    const key = `${name}@${version}`;
    if (!components.has(key))
      components.set(key, {
        type: "library",
        name,
        version,
        purl: `pkg:npm/${encodeURIComponent(name)}@${encodeURIComponent(version)}`,
      });
    visit(dependency.dependencies);
    visit(dependency.devDependencies);
    visit(dependency.optionalDependencies);
  }
}
for (const workspace of workspaces) {
  visit(workspace.dependencies);
  visit(workspace.devDependencies);
  visit(workspace.optionalDependencies);
}
const version = JSON.parse(
  await (await import("node:fs/promises")).readFile("package.json", "utf8"),
).version;
const sbom = {
  bomFormat: "CycloneDX",
  specVersion: "1.6",
  serialNumber: `urn:uuid:${crypto.randomUUID()}`,
  version: 1,
  metadata: {
    timestamp: new Date().toISOString(),
    component: { type: "application", name: "firefox-open-assistant", version },
  },
  components: [...components.values()].sort((a, b) => a.purl.localeCompare(b.purl)),
};
await mkdir("artifacts", { recursive: true });
await writeFile(path.join("artifacts", "sbom.cdx.json"), `${JSON.stringify(sbom, null, 2)}\n`);
