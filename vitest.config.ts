import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@open-assistant/protocol": path.join(root, "packages/protocol/src/index.ts"),
      "@open-assistant/extraction": path.join(root, "packages/extraction/src/index.ts"),
      "@open-assistant/editor": path.join(root, "packages/editor/src/index.ts"),
      "@open-assistant/prompt-security": path.join(root, "packages/prompt-security/src/index.ts"),
      "@open-assistant/agent-policy": path.join(root, "packages/agent-policy/src/index.ts"),
    },
  },
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx", "apps/*/test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: [
        "packages/agent-policy/src/**/*.ts",
        "packages/editor/src/**/*.ts",
        "packages/extraction/src/**/*.ts",
        "packages/prompt-security/src/**/*.ts",
        "packages/protocol/src/**/*.ts",
      ],
      thresholds: { statements: 90, branches: 85, functions: 90, lines: 90 },
    },
  },
});
