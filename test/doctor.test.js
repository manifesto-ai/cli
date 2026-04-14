import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runDoctor } from "../src/lib/doctor.js";

test("doctor does not require bundler wiring when integration intent is none", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "manifesto-cli-doctor-none-"));
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
    codegen: "install",
    skills: "off",
  },
  sample: "none",
};
`);

  await installPackage(cwd, "@manifesto-ai/sdk", "3.13.0");
  await installPackage(cwd, "@manifesto-ai/compiler", "3.4.0");
  await installPackage(cwd, "@manifesto-ai/codegen", "0.2.7");

  const result = await runDoctor({ cwd });

  assert.equal(result.exitCode, 0);
  const integrationCheck = result.checks.find((check) => check.label === "integration disabled by Manifesto intent");
  assert.ok(integrationCheck);
  assert.equal(integrationCheck.status, "pass");
});

test("doctor errors when codegen wire is declared but wiring is missing", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "manifesto-cli-doctor-wire-"));
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

  await installPackage(cwd, "@manifesto-ai/sdk", "3.13.0");
  await installPackage(cwd, "@manifesto-ai/compiler", "3.4.0");
  await installPackage(cwd, "@manifesto-ai/codegen", "0.2.7");

  const result = await runDoctor({ cwd });

  const codegenCheck = result.checks.find((check) => check.label === "codegen wiring is required but was not detected");
  assert.ok(codegenCheck);
  assert.equal(codegenCheck.status, "error");
  assert.equal(result.exitCode, 1);
});

test("doctor validates project-local Claude Code skills setup", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "manifesto-cli-doctor-skills-claude-"));
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
    skills: "claude",
  },
  sample: "none",
};
`);
  await writeFile(join(cwd, "CLAUDE.md"), `<!-- BEGIN MANAGED BLOCK: @manifesto-ai/skills v1.0.1 -->
See @node_modules/@manifesto-ai/skills/SKILL.md for Manifesto integration guidance.
<!-- END MANAGED BLOCK: @manifesto-ai/skills -->
`);

  await installPackage(cwd, "@manifesto-ai/sdk", "3.13.0");
  await installPackage(cwd, "@manifesto-ai/compiler", "3.4.0");
  await installPackage(cwd, "@manifesto-ai/skills", "1.0.1");

  const result = await runDoctor({ cwd });

  const skillsCheck = result.checks.find((check) => check.label === "Claude Code skill install detected");
  assert.ok(skillsCheck);
  assert.equal(skillsCheck.status, "pass");
  assert.equal(result.exitCode, 0);
});

async function installPackage(cwd, packageName, version) {
  await mkdir(join(cwd, "node_modules", ...packageName.split("/")), { recursive: true });
  await writeFile(join(cwd, "node_modules", ...packageName.split("/"), "package.json"), JSON.stringify({
    name: packageName,
    version,
  }, null, 2));
}
