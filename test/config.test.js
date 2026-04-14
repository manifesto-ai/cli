import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readManifestoConfig } from "../src/lib/config.js";
import {
  createManifestoProjectConfig,
  readManifestoProjectConfig,
  resolveManifestoProjectPaths,
  serializeManifestoProjectConfig,
} from "../src/lib/domain-config.js";

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

test("readManifestoProjectConfig normalizes manifesto.json defaults", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "manifesto-cli-project-config-"));
  await writeFile(join(cwd, "manifesto.json"), JSON.stringify({
    domains: "domains",
  }, null, 2));

  const record = await readManifestoProjectConfig(cwd);
  assert.ok(record);
  assert.equal(record.config.domains, "domains");
  assert.equal(record.config.agents, "manifesto/agents");
  assert.equal(record.config.typescript, true);
  assert.deepEqual(record.config.registries, {
    manifesto: "https://registry.manifesto-ai.dev",
  });

  const paths = resolveManifestoProjectPaths(cwd, record.config);
  assert.equal(paths.configPath, join(cwd, "manifesto.json"));
  assert.equal(paths.domainsDir, join(cwd, "domains"));
  assert.equal(paths.agentsDir, join(cwd, "manifesto/agents"));

  const serialized = serializeManifestoProjectConfig(createManifestoProjectConfig({
    domains: "custom/domains",
    agents: "custom/agents",
    registries: {
      internal: "https://registry.example.test",
    },
  }));
  assert.match(serialized, /"domains": "custom\/domains"/);
  assert.match(serialized, /"agents": "custom\/agents"/);
  assert.match(serialized, /"internal": "https:\/\/registry\.example\.test"/);
});
