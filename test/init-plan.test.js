import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildInitPlan } from "../src/lib/plans.js";

test("buildInitPlan scaffolds gov vite projects with config and samples", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "manifesto-cli-init-"));
  await writeFile(join(cwd, "package.json"), JSON.stringify({
    name: "fixture",
    type: "module",
  }, null, 2));
  await writeFile(join(cwd, "vite.config.ts"), `import { defineConfig } from "vite";

export default defineConfig({});
`);

  const plan = await buildInitPlan({
    cwd,
    bundler: "vite",
    preset: "gov",
    tooling: ["codegen", "skills"],
    sample: true,
  });

  assert.deepEqual(plan.installGroups.dependencies, [
    "@manifesto-ai/governance",
    "@manifesto-ai/lineage",
    "@manifesto-ai/sdk",
  ]);
  assert.deepEqual(plan.installGroups.devDependencies, [
    "@manifesto-ai/codegen",
    "@manifesto-ai/compiler",
    "@manifesto-ai/skills",
  ]);

  const configFile = plan.files.find((file) => file.path.endsWith("manifesto.config.ts"));
  assert.ok(configFile);
  assert.match(configFile.content, /capabilities: \["governance", "lineage"\]/);

  const viteFile = plan.files.find((file) => file.path.endsWith("vite.config.ts"));
  assert.ok(viteFile);
  assert.match(viteFile.content, /melPlugin\(\{ codegen: createCompilerCodegen\(\) \}\)/);

  const runtimeFile = plan.files.find((file) => file.path.endsWith("src/manifesto/runtime.js"));
  assert.ok(runtimeFile);
  assert.match(runtimeFile.content, /withGovernance/);

  const melFile = plan.files.find((file) => file.path.endsWith("manifesto/counter.mel"));
  assert.ok(melFile);
  assert.match(melFile.content, /domain Counter/);

  const persistedViteConfig = await readFile(join(cwd, "vite.config.ts"), "utf8");
  assert.match(persistedViteConfig, /defineConfig/);
});

test("buildInitPlan scaffolds lineage projects without governance", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "manifesto-cli-lineage-"));
  await writeFile(join(cwd, "package.json"), JSON.stringify({
    name: "fixture",
    type: "module",
  }, null, 2));

  const plan = await buildInitPlan({
    cwd,
    bundler: "node-loader",
    preset: "lineage",
    tooling: [],
    sample: true,
  });

  assert.deepEqual(plan.installGroups.dependencies, [
    "@manifesto-ai/lineage",
    "@manifesto-ai/sdk",
  ]);
  assert.deepEqual(plan.installGroups.devDependencies, [
    "@manifesto-ai/compiler",
  ]);

  const configFile = plan.files.find((file) => file.path.endsWith("manifesto.config.ts"));
  assert.ok(configFile);
  assert.match(configFile.content, /capabilities: \["lineage"\]/);

  const runtimeFile = plan.files.find((file) => file.path.endsWith("src\/manifesto\/runtime.js"));
  assert.ok(runtimeFile);
  assert.match(runtimeFile.content, /withLineage/);
  assert.doesNotMatch(runtimeFile.content, /withGovernance/);
});
