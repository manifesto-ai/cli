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

  await installPackage(cwd, "@manifesto-ai/sdk", "3.4.0");
  await installPackage(cwd, "@manifesto-ai/compiler", "3.1.1");
  await installPackage(cwd, "@manifesto-ai/codegen", "0.2.3");

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

  await installPackage(cwd, "@manifesto-ai/sdk", "3.4.0");
  await installPackage(cwd, "@manifesto-ai/compiler", "3.1.1");
  await installPackage(cwd, "@manifesto-ai/codegen", "0.2.3");

  const result = await runDoctor({ cwd });

  const codegenCheck = result.checks.find((check) => check.label === "codegen wiring is required but was not detected");
  assert.ok(codegenCheck);
  assert.equal(codegenCheck.status, "error");
  assert.equal(result.exitCode, 1);
});

async function installPackage(cwd, packageName, version) {
  await mkdir(join(cwd, "node_modules", ...packageName.split("/")), { recursive: true });
  await writeFile(join(cwd, "node_modules", ...packageName.split("/"), "package.json"), JSON.stringify({
    name: packageName,
    version,
  }, null, 2));
}
