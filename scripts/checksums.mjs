import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const directory = "artifacts";
const files = (await readdir(directory))
  .filter((name) => name !== "SHA256SUMS" && !name.startsWith("."))
  .sort();
const lines = [];
for (const file of files) {
  const digest = createHash("sha256")
    .update(await readFile(path.join(directory, file)))
    .digest("hex");
  lines.push(`${digest}  ${file}`);
}
await writeFile(path.join(directory, "SHA256SUMS"), `${lines.join("\n")}\n`);
