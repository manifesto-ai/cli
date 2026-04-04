import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runDoctor } from "../src/lib/doctor.js";

test("doctor reports missing lineage when governance is expected", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "manifesto-cli-doctor-"));
  await writeFile(join(cwd, "package.json"), JSON.stringify({
    name: "fixture",
    type: "module",
    scripts: {},
  }, null, 2));
  await writeFile(join(cwd, "manifesto.config.ts"), `export default {
  bundler: "vite",
  capabilities: ["governance"],
  tooling: {
    codegen: false,
    skills: false,
  },
};
`);
  await writeFile(join(cwd, "vite.config.ts"), `import { melPlugin } from "@manifesto-ai/compiler/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [melPlugin()],
});
`);

  await mkdir(join(cwd, "node_modules", "@manifesto-ai", "sdk"), { recursive: true });
  await mkdir(join(cwd, "node_modules", "@manifesto-ai", "compiler"), { recursive: true });
  await mkdir(join(cwd, "node_modules", "@manifesto-ai", "governance"), { recursive: true });
  await writeFile(join(cwd, "node_modules", "@manifesto-ai", "sdk", "package.json"), JSON.stringify({
    name: "@manifesto-ai/sdk",
    version: "3.4.0",
  }, null, 2));
  await writeFile(join(cwd, "node_modules", "@manifesto-ai", "compiler", "package.json"), JSON.stringify({
    name: "@manifesto-ai/compiler",
    version: "3.1.1",
  }, null, 2));
  await writeFile(join(cwd, "node_modules", "@manifesto-ai", "governance", "package.json"), JSON.stringify({
    name: "@manifesto-ai/governance",
    version: "3.3.0",
  }, null, 2));

  const result = await runDoctor({ cwd });
  const governanceCheck = result.checks.find((check) => check.label === "governance requires lineage");
  assert.ok(governanceCheck);
  assert.equal(governanceCheck.status, "error");
  assert.equal(result.exitCode, 1);
});
