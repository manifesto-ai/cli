import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { compile } from "@manifesto-ai/compiler";

import { runDoctor } from "../src/lib/doctor.js";
import {
  buildDomainAddPlan,
  buildRegistryBuildPlan,
} from "../src/lib/domain-registry.js";
import { serializeManifestoProjectConfig } from "../src/lib/domain-config.js";

const DOMAIN_SOURCE = `domain TradingAgent {
  state {
    status: "idle" | "done" = "idle"
  }

  action markDone() {
    when eq(status, "idle") {
      patch status = "done"
    }
  }
}
`;

function buildRegistryItem(name = "trading-agent") {
  const compiled = compile(DOMAIN_SOURCE);
  if (!compiled.success || !compiled.schema) {
    throw new Error("Fixture domain failed to compile.");
  }

  return {
    name,
    version: "1.0.0",
    description: "Trading agent domain",
    schemaHash: compiled.schema.hash,
    files: [
      {
        path: "domain.mel",
        type: "registry:mel",
        content: DOMAIN_SOURCE,
      },
      {
        path: "README.md",
        type: "registry:readme",
        content: "# Trading agent\n",
      },
    ],
    peers: {
      "@manifesto-ai/sdk": "^3.17.3",
      "@manifesto-ai/lineage": "^3.11.3",
    },
  };
}

test("buildRegistryBuildPlan emits registry artifacts for local domains", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "manifesto-cli-registry-build-"));
  await mkdir(join(cwd, "manifesto", "domains", "trading-agent"), { recursive: true });
  await writeFile(join(cwd, "manifesto.json"), serializeManifestoProjectConfig({}));
  await writeFile(join(cwd, "manifesto", "domains", "trading-agent", "domain.mel"), DOMAIN_SOURCE);
  await writeFile(join(cwd, "manifesto", "domains", "trading-agent", "README.md"), "# Trading agent\n");

  const plan = await buildRegistryBuildPlan({ cwd });
  const itemFile = plan.files.find((file) => file.path.endsWith("/r/trading-agent.json"));
  const indexFile = plan.files.find((file) => file.path.endsWith("/registry.json"));

  assert.ok(itemFile);
  assert.ok(indexFile);
  assert.equal(plan.outDir, join(cwd, "registry"));

  const item = JSON.parse(itemFile.content);
  assert.equal(item.name, "trading-agent");
  assert.equal(item.files[0].path, "domain.mel");

  const index = JSON.parse(indexFile.content);
  assert.equal(index.name, "registry");
  assert.deepEqual(index.items, [
    {
      name: "trading-agent",
      version: "1.0.0",
      description: "Trading agent",
    },
  ]);
});

test("buildDomainAddPlan installs registry files and generates an agent wrapper", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "manifesto-cli-domain-add-"));
  const fetchRef = globalThis.fetch;
  await writeFile(join(cwd, "package.json"), JSON.stringify({
    name: "fixture",
    type: "module",
  }, null, 2));
  await writeFile(join(cwd, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
  await writeFile(join(cwd, "manifesto.json"), serializeManifestoProjectConfig({}));

  globalThis.fetch = async () => new Response(JSON.stringify(buildRegistryItem()), {
    status: 200,
    headers: {
      "content-type": "application/json",
    },
  });

  try {
    const plan = await buildDomainAddPlan({
      cwd,
      specifier: "trading-agent",
    });
    const domainFile = plan.files.find((file) => file.path.endsWith("/manifesto/domains/trading-agent/domain.mel"));
    const agentFile = plan.files.find((file) => file.path.endsWith("/manifesto/agents/trading-agent.ts"));

    assert.ok(domainFile);
    assert.ok(agentFile);
    assert.match(agentFile.content, /createManifesto/);
    assert.doesNotMatch(agentFile.content, /mcpEffects/);
    assert.deepEqual([...plan.installGroups.dependencies].sort(), [
      "@manifesto-ai/lineage@^3.11.3",
      "@manifesto-ai/sdk@^3.17.3",
    ].sort());
    assert.equal(plan.packageManager, "pnpm");
    assert.match(plan.notes[1], /Schema hash:/);
  } finally {
    globalThis.fetch = fetchRef;
  }
});

test("doctor validates manifesto domain projects", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "manifesto-cli-doctor-domains-"));
  await mkdir(join(cwd, "manifesto", "domains", "trading-agent"), { recursive: true });
  await mkdir(join(cwd, "manifesto", "agents"), { recursive: true });
  await writeFile(join(cwd, "package.json"), JSON.stringify({
    name: "fixture",
    type: "module",
  }, null, 2));
  await writeFile(join(cwd, "manifesto.json"), serializeManifestoProjectConfig({}));
  await writeFile(join(cwd, "manifesto", "domains", "trading-agent", "domain.mel"), DOMAIN_SOURCE);

  const result = await runDoctor({ cwd });

  const manifestCheck = result.checks.find((check) => check.label === "manifesto.json detected");
  const compileCheck = result.checks.find((check) => check.label === "trading-agent: MEL compiled");

  assert.ok(manifestCheck);
  assert.equal(manifestCheck.status, "pass");
  assert.ok(compileCheck);
  assert.equal(compileCheck.status, "pass");
  assert.equal(result.exitCode, 0);
});
