// `npm test`: bundle tests/*.test.ts with Vite (it resolves the page's extensionless imports and
// JSON the same way the page build does), then run them with Node's built-in test runner.

import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "node_modules", ".tests");
const tests = readdirSync(here).filter((f) => f.endsWith(".test.ts"));

await build({
  root: join(here, ".."),
  logLevel: "warn",
  configFile: false,
  build: {
    ssr: true,
    outDir: out,
    emptyOutDir: true,
    rollupOptions: { input: Object.fromEntries(tests.map((f) => [f.replace(/\.ts$/, ""), join(here, f)])) },
  },
});

const res = spawnSync(process.execPath, ["--test", ...tests.map((f) => join(out, f.replace(/\.ts$/, ".js")))], { stdio: "inherit" });
process.exit(res.status ?? 1);
