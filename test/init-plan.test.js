import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  buildInitPlan,
  buildIntegratePlan,
  buildSetupPlan,
} from "../src/lib/plans.js";

test("buildInitPlan supports install-only intent with explicit tooling states", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "manifesto-cli-init-"));
  await writeFile(join(cwd, "package.json"), JSON.stringify({
    name: "fixture",
    type: "module",
  }, null, 2));
  await writeFile(join(cwd, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");

  const plan = await buildInitPlan({
    cwd,
    runtime: "gov",
    integration: "none",
    codegen: "install",
    skills: "codex",
    sample: "none",
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

  assert.equal(plan.intent.runtime, "gov");
  assert.equal(plan.intent.integration.mode, "none");
  assert.equal(plan.intent.tooling.codegen, "install");
  assert.equal(plan.intent.tooling.skills, "codex");
  assert.equal(plan.intent.sample, "none");

  const configFile = plan.files.find((file) => file.path.endsWith("manifesto.config.ts"));
  assert.ok(configFile);
  assert.match(configFile.content, /runtime: "gov"/);
  assert.match(configFile.content, /mode: "none"/);
  assert.match(configFile.content, /codegen: "install"/);
  assert.match(configFile.content, /skills: "codex"/);
  assert.match(configFile.content, /sample: "none"/);

  assert.equal(plan.files.length, 1);
  assert.equal(plan.commands.length, 1);
  assert.equal(plan.commands[0].command, "pnpm");
  assert.deepEqual(plan.commands[0].args, ["exec", "manifesto-skills", "install-codex"]);
});

test("buildSetupPlan supports project-local Claude Code skills setup", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "manifesto-cli-skills-claude-"));
  await writeFile(join(cwd, "package.json"), JSON.stringify({
    name: "fixture",
    type: "module",
  }, null, 2));
  await writeFile(join(cwd, "manifesto.config.ts"), `export default {
  runtime: "base",
  integration: {
    mode: "none",
  },
  tooling: {
    codegen: "off",
    skills: "off",
  },
  sample: "none",
};
`);

  const plan = await buildSetupPlan({
    cwd,
    target: "skills",
    state: "claude",
  });

  assert.equal(plan.intent.tooling.skills, "claude");
  assert.deepEqual(plan.installGroups.devDependencies, [
    "@manifesto-ai/compiler",
    "@manifesto-ai/skills",
  ]);
  assert.equal(plan.commands.length, 1);
  assert.match(plan.commands[0].command, /^(npm|pnpm|yarn)$/);
  assert.equal(plan.commands[0].args.at(-2), "manifesto-skills");
  assert.equal(plan.commands[0].args.at(-1), "install-claude");
});

test("buildIntegratePlan patches vite config when integration is selected", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "manifesto-cli-vite-"));
  await writeFile(join(cwd, "package.json"), JSON.stringify({
    name: "fixture",
    type: "module",
  }, null, 2));
  await writeFile(join(cwd, "manifesto.config.ts"), `export default {
  runtime: "base",
  integration: {
    mode: "vite",
  },
  tooling: {
    codegen: "wire",
    skills: "off",
  },
  sample: "none",
};
`);
  await writeFile(join(cwd, "vite.config.ts"), `import { defineConfig } from "vite";

export default defineConfig({});
`);

  const plan = await buildIntegratePlan({
    cwd,
    integration: "vite",
  });

  const viteFile = plan.files.find((file) => file.path.endsWith("vite.config.ts"));
  assert.ok(viteFile);
  assert.match(viteFile.content, /melPlugin/);
});

test("buildSetupPlan keeps codegen install-only when integration is none", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "manifesto-cli-codegen-"));
  await writeFile(join(cwd, "package.json"), JSON.stringify({
    name: "fixture",
    type: "module",
  }, null, 2));
  await writeFile(join(cwd, "manifesto.config.ts"), `export default {
  runtime: "base",
  integration: {
    mode: "none",
  },
  tooling: {
    codegen: "off",
    skills: "off",
  },
  sample: "none",
};
`);

  const plan = await buildSetupPlan({
    cwd,
    target: "codegen",
    state: "install",
  });

  assert.equal(plan.intent.tooling.codegen, "install");
  assert.equal(plan.intent.integration.mode, "none");
  assert.equal(plan.files.filter((file) => file.path.endsWith(".config.ts")).length, 1);
  assert.equal(plan.files.length, 1);
  assert.deepEqual(plan.installGroups.devDependencies, [
    "@manifesto-ai/codegen",
    "@manifesto-ai/compiler",
  ]);

  const configFile = plan.files[0];
  const serialized = await readFile(join(cwd, "manifesto.config.ts"), "utf8");
  assert.match(serialized, /codegen: "off"/);
  assert.match(configFile.content, /codegen: "install"/);
});
