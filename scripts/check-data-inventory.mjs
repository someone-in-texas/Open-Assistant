import { readFile } from "node:fs/promises";

const manifest = JSON.parse(await readFile("apps/extension/public/manifest.json", "utf8"));
const inventory = await readFile("docs/data-inventory.md", "utf8");
const declarations = manifest.browser_specific_settings.gecko.data_collection_permissions;
const categories = [...declarations.required, ...declarations.optional];
const missing = categories.filter((category) => !inventory.includes(`\`${category}\``));
if (missing.length) {
  console.error(`Data inventory is missing declared categories: ${missing.join(", ")}`);
  process.exit(1);
}
if (
  !declarations.optional.includes("websiteActivity") ||
  !declarations.optional.includes("technicalAndInteraction")
) {
  console.error("Agent and telemetry data categories must remain optional.");
  process.exit(1);
}
const config = await readFile("apps/extension/src/shared/config.ts", "utf8");
if (!config.includes("telemetryEnabled: false") || !config.includes("agentEnabled: false")) {
  console.error("Telemetry and interactive agent must default off.");
  process.exit(1);
}
console.log("Manifest declarations, data inventory, and feature defaults are consistent.");
