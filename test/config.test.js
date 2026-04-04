import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readManifestoConfig } from "../src/lib/config.js";

test("readManifestoConfig migrates legacy schema into the new intent model", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "manifesto-cli-config-"));
  await writeFile(join(cwd, "manifesto.config.ts"), `export default {
  bundler: "vite",
  capabilities: ["lineage"],
  tooling: {
    codegen: true,
    skills: true,
  },
};
`);

  const record = await readManifestoConfig(cwd);
  assert.ok(record);
  assert.equal(record.config.runtime, "lineage");
  assert.equal(record.config.integration.mode, "vite");
  assert.equal(record.config.tooling.codegen, "wire");
  assert.equal(record.config.tooling.skills, "install");
  assert.equal(record.config.sample, "none");
});
