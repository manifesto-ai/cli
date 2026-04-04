import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import {
  BASE_DEPENDENCIES,
  BASE_DEV_DEPENDENCIES,
  BUNDLER_CONFIG_CANDIDATES,
  CAPABILITY_DEFINITIONS,
  COMPILER_BUNDLER_IMPORTS,
  inferPresetFromCapabilities,
  normalizePreset,
  TOOLING_KEYS,
} from "./constants.js";
import { CliError } from "./errors.js";
import {
  createManifestoConfig,
  mergeManifestoConfig,
  readManifestoConfig,
  serializeManifestoConfig,
} from "./config.js";
import { buildInstallCommand, runInstallCommand } from "./package-manager.js";
import {
  detectBundler,
  detectPackageManager,
  fileExists,
  findBundlerConfigPath,
  readPackageJson,
  writeTextFile,
} from "./project.js";

export async function buildInitPlan({ cwd, bundler, preset, tooling, sample }) {
  const normalizedPreset = normalizePreset(preset);
  const normalizedTooling = dedupeTooling(tooling);
  const packageJson = await readPackageJson(cwd);
  const existingConfig = await readManifestoConfig(cwd);
  const nextConfig = mergeManifestoConfig(
    existingConfig?.config ?? createManifestoConfig({ bundler, preset: normalizedPreset, tooling: normalizedTooling }),
    createManifestoConfig({ bundler, preset: normalizedPreset, tooling: normalizedTooling }),
  );

  const installGroups = {
    dependencies: [...BASE_DEPENDENCIES],
    devDependencies: [...BASE_DEV_DEPENDENCIES],
  };

  if (normalizedPreset === "lineage" || normalizedPreset === "gov") {
    installGroups.dependencies.push(CAPABILITY_DEFINITIONS.lineage.packageName);
  }

  if (normalizedPreset === "gov") {
    installGroups.dependencies.push(CAPABILITY_DEFINITIONS.governance.packageName);
  }

  for (const toolingKey of normalizedTooling) {
    const definition = CAPABILITY_DEFINITIONS[toolingKey];
    installGroups[definition.dependencyType].push(definition.packageName);
  }

  const files = [];
  files.push({
    path: join(cwd, "manifesto.config.ts"),
    content: serializeManifestoConfig(nextConfig),
    mode: "write",
    reason: "record Manifesto intent for add/doctor/sync workflows",
  });

  const bundlerAction = await buildBundlerIntegrationAction({
    cwd,
    bundler,
    tooling: normalizedTooling,
    packageJson,
  });
  if (bundlerAction) {
    files.push(bundlerAction);
  }

  if (sample) {
    files.push(...await buildSampleFiles({ cwd, preset: normalizedPreset }));
  }

  return {
    cwd,
    packageManager: detectPackageManager(cwd),
    bundler,
    preset: normalizedPreset,
    tooling: normalizedTooling,
    installGroups: dedupeInstallGroups(installGroups),
    files,
    notes: buildSharedNotes({ bundler, tooling: normalizedTooling }),
  };
}

export async function buildAddPlan({ cwd, capability, autoDeps }) {
  const definition = CAPABILITY_DEFINITIONS[capability];
  if (!definition) {
    throw new CliError(
      `Unsupported capability "${capability}". Valid values: lineage, governance, codegen, skills.`,
    );
  }

  const detectedBundler = detectBundler(cwd);
  const existingConfig = await readManifestoConfig(cwd);
  const config = existingConfig?.config ?? createManifestoConfig({
    bundler: detectedBundler.bundler === "unknown" ? "vite" : detectedBundler.bundler,
    preset: "base",
    tooling: [],
  });

  const installGroups = {
    dependencies: [],
    devDependencies: [],
  };
  const notes = [];

  if (definition.requires?.includes("lineage")) {
    const lineagePresent = config.capabilities.includes("lineage");
    if (!lineagePresent && !autoDeps) {
      throw new CliError(`governance requires lineage.

In Manifesto, governance adds legitimacy to a world that already has continuity.
Without lineage, there is no history to govern.

Run first:  manifesto add lineage
Then retry: manifesto add governance
`);
    }

    if (!lineagePresent && autoDeps) {
      installGroups.dependencies.push(CAPABILITY_DEFINITIONS.lineage.packageName);
      notes.push(
        "Installing @manifesto-ai/lineage because governance composes on top of continuity.",
      );
    }
  }

  installGroups[definition.dependencyType].push(definition.packageName);

  const nextConfig = mergeManifestoConfig(config, mutateConfigForCapability(config, capability, autoDeps));
  const files = [{
    path: join(cwd, "manifesto.config.ts"),
    content: serializeManifestoConfig(nextConfig),
    mode: "write",
    reason: "keep CLI intent in sync with added capabilities",
  }];

  if (capability === "codegen") {
    const packageJson = await readPackageJson(cwd);
    const bundlerAction = await buildBundlerIntegrationAction({
      cwd,
      bundler: nextConfig.bundler,
      tooling: Object.entries(nextConfig.tooling)
        .filter(([, enabled]) => enabled)
        .map(([name]) => name),
      packageJson,
    });
    if (bundlerAction) {
      files.push(bundlerAction);
    }
  }

  notes.push(...buildCapabilityNotes(capability));

  return {
    cwd,
    packageManager: detectPackageManager(cwd),
    bundler: nextConfig.bundler,
    preset: inferPresetFromCapabilities(nextConfig.capabilities),
    tooling: Object.entries(nextConfig.tooling)
      .filter(([, enabled]) => enabled)
      .map(([name]) => name),
    installGroups: dedupeInstallGroups(installGroups),
    files,
    notes,
  };
}

export async function applyPlan(plan) {
  for (const dependencyType of ["dependencies", "devDependencies"]) {
    const installCommand = buildInstallCommand(
      plan.packageManager,
      dependencyType,
      plan.installGroups[dependencyType],
    );
    if (installCommand) {
      runInstallCommand({ cwd: plan.cwd, ...installCommand });
    }
  }

  for (const fileAction of plan.files) {
    await writeTextFile(fileAction.path, fileAction.content);
  }
}

async function buildBundlerIntegrationAction({ cwd, bundler, tooling, packageJson }) {
  if (bundler === "node-loader") {
    const nextPackageJson = packageJson ?? { scripts: {} };
    const scripts = { ...(nextPackageJson.scripts ?? {}) };
    if (!scripts["manifesto:node-loader"]) {
      scripts["manifesto:node-loader"] = "node --loader @manifesto-ai/compiler/node-loader ./src/index.js";
      return {
        path: join(cwd, "package.json"),
        content: `${JSON.stringify({ ...nextPackageJson, scripts }, null, 2)}\n`,
        mode: "write",
        reason: "add a node-loader example entry point",
      };
    }
    return null;
  }

  if (!["vite", "webpack"].includes(bundler)) {
    return null;
  }

  const existingPath = findBundlerConfigPath(cwd, bundler);
  if (existingPath) {
    if (basename(existingPath).startsWith("next.config")) {
      return null;
    }

    const source = await readFile(existingPath, "utf8");
    const updated = injectBundlerPlugin(source, {
      bundler,
      tooling,
      filename: basename(existingPath),
    });

    if (!updated || updated === source) {
      return null;
    }

    return {
      path: existingPath,
      content: updated,
      mode: "write",
      reason: "wire melPlugin() into the detected bundler config",
    };
  }

  const targetPath = join(cwd, defaultBundlerConfigFilename(bundler, packageJson));
  return {
    path: targetPath,
    content: createBundlerConfigTemplate({
      bundler,
      tooling,
      moduleType: packageJson?.type === "module",
    }),
    mode: "write",
    reason: "create an initial bundler config with Manifesto compiler wiring",
  };
}

async function buildSampleFiles({ cwd, preset }) {
  const files = [];
  const melPath = join(cwd, "manifesto", "counter.mel");
  if (!(await fileExists(melPath))) {
    files.push({
      path: melPath,
      content: sampleMelSource(),
      mode: "write",
      reason: "add a minimal MEL sample domain",
    });
  }

  const runtimePath = join(cwd, "src", "manifesto", "runtime.js");
  if (!(await fileExists(runtimePath))) {
    files.push({
      path: runtimePath,
      content: sampleRuntimeForPreset(preset),
      mode: "write",
      reason: "add a starter runtime integration example",
    });
  }

  const declarationPath = join(cwd, "src", "mel.d.ts");
  if (!(await fileExists(declarationPath))) {
    files.push({
      path: declarationPath,
      content: `declare module "*.mel" {
  const schema: unknown;
  export default schema;
}
`,
      mode: "write",
      reason: "declare MEL module imports for TS projects",
    });
  }

  return files;
}

function mutateConfigForCapability(config, capability, autoDeps) {
  const next = {
    bundler: config.bundler,
    capabilities: [...config.capabilities],
    tooling: { ...config.tooling },
  };

  if (capability === "lineage") {
    next.capabilities.push("lineage");
  } else if (capability === "governance") {
    if (autoDeps && !next.capabilities.includes("lineage")) {
      next.capabilities.push("lineage");
    }
    next.capabilities.push("governance");
  } else if (capability === "codegen" || capability === "skills") {
    next.tooling[capability] = true;
  }

  return next;
}

function dedupeTooling(tooling) {
  return Array.from(new Set(tooling ?? [])).filter((entry) => TOOLING_KEYS.includes(entry));
}

function dedupeInstallGroups(groups) {
  return {
    dependencies: Array.from(new Set(groups.dependencies)).sort(),
    devDependencies: Array.from(new Set(groups.devDependencies)).sort(),
  };
}

function buildSharedNotes({ bundler, tooling }) {
  const notes = ['Run "manifesto doctor" after the install to validate the resulting project state.'];

  if (bundler === "webpack") {
    notes.push(
      "Webpack and Next.js use the same compiler subpath, but Next-specific config still needs manual review.",
    );
  }

  if (tooling.includes("skills")) {
    notes.push("Codex: pnpm exec manifesto-skills install-codex");
    notes.push("Claude Code: reference @node_modules/@manifesto-ai/skills/SKILL.md in CLAUDE.md");
  }

  return notes;
}

function buildCapabilityNotes(capability) {
  switch (capability) {
    case "skills":
      return [
        "@manifesto-ai/skills installed.",
        "Skills uses explicit setup by design.",
        "Codex: pnpm exec manifesto-skills install-codex",
        "Claude Code: reference @node_modules/@manifesto-ai/skills/SKILL.md in CLAUDE.md",
      ];
    case "codegen":
      return [
        "Review the generated bundler config and keep createCompilerCodegen() aligned with your schema output.",
      ];
    default:
      return [];
  }
}

function defaultBundlerConfigFilename(bundler, packageJson) {
  const isModule = packageJson?.type === "module";

  if (bundler === "vite") {
    return "vite.config.ts";
  }

  if (bundler === "webpack") {
    return isModule ? "webpack.config.mjs" : "webpack.config.js";
  }

  return BUNDLER_CONFIG_CANDIDATES[bundler]?.[0] ?? `${bundler}.config.js`;
}

function createBundlerConfigTemplate({ bundler, tooling, moduleType }) {
  const pluginCall = tooling.includes("codegen")
    ? "melPlugin({ codegen: createCompilerCodegen() })"
    : "melPlugin()";

  if (bundler === "vite") {
    return `${tooling.includes("codegen") ? 'import { createCompilerCodegen } from "@manifesto-ai/codegen";\n' : ""}import { melPlugin } from "${COMPILER_BUNDLER_IMPORTS.vite}";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [${pluginCall}],
});
`;
  }

  if (moduleType) {
    return `${tooling.includes("codegen") ? 'import { createCompilerCodegen } from "@manifesto-ai/codegen";\n' : ""}import { melPlugin } from "${COMPILER_BUNDLER_IMPORTS.webpack}";

export default {
  plugins: [${pluginCall}],
};
`;
  }

  return `${tooling.includes("codegen") ? 'const { createCompilerCodegen } = require("@manifesto-ai/codegen");\n' : ""}const { melPlugin } = require("${COMPILER_BUNDLER_IMPORTS.webpack}");

module.exports = {
  plugins: [${pluginCall}],
};
`;
}

function injectBundlerPlugin(source, { bundler, tooling, filename }) {
  const importTarget = COMPILER_BUNDLER_IMPORTS[bundler];
  const pluginCall = tooling.includes("codegen")
    ? "melPlugin({ codegen: createCompilerCodegen() })"
    : "melPlugin()";
  const usesCommonJs = filename.endsWith(".cjs")
    || (filename.endsWith(".js") && source.includes("module.exports"));
  const hasPlugin = source.includes("melPlugin(") || source.includes(importTarget);
  const hasCodegen = source.includes("createCompilerCodegen(");
  let updated = source;

  if (hasPlugin && (!tooling.includes("codegen") || hasCodegen)) {
    return source;
  }

  if (tooling.includes("codegen") && hasPlugin && !hasCodegen) {
    updated = updated.replace(/melPlugin\(\)/, pluginCall);
    updated = injectImport(updated, {
      statement: usesCommonJs
        ? 'const { createCompilerCodegen } = require("@manifesto-ai/codegen");'
        : 'import { createCompilerCodegen } from "@manifesto-ai/codegen";',
      commonJs: usesCommonJs,
    });
    return updated;
  }

  updated = injectImport(updated, {
    statement: usesCommonJs
      ? `const { melPlugin } = require("${importTarget}");`
      : `import { melPlugin } from "${importTarget}";`,
    commonJs: usesCommonJs,
  });

  if (tooling.includes("codegen")) {
    updated = injectImport(updated, {
      statement: usesCommonJs
        ? 'const { createCompilerCodegen } = require("@manifesto-ai/codegen");'
        : 'import { createCompilerCodegen } from "@manifesto-ai/codegen";',
      commonJs: usesCommonJs,
    });
  }

  if (/plugins\s*:\s*\[/.test(updated)) {
    return updated.replace(/plugins\s*:\s*\[/, `plugins: [${pluginCall}, `);
  }

  if (/defineConfig\s*\(\s*\{/.test(updated)) {
    return updated.replace(/defineConfig\s*\(\s*\{/, `defineConfig({\n  plugins: [${pluginCall}],`);
  }

  if (/module\.exports\s*=\s*\{/.test(updated)) {
    return updated.replace(/module\.exports\s*=\s*\{/, `module.exports = {\n  plugins: [${pluginCall}],`);
  }

  if (/export\s+default\s+\{/.test(updated)) {
    return updated.replace(/export\s+default\s+\{/, `export default {\n  plugins: [${pluginCall}],`);
  }

  return null;
}

function injectImport(source, { statement, commonJs }) {
  if (source.includes(statement)) {
    return source;
  }

  if (commonJs) {
    return `${statement}\n${source}`;
  }

  const importLines = source.match(/^import .+$/gm);
  if (!importLines || importLines.length === 0) {
    return `${statement}\n${source}`;
  }

  const lastImport = importLines[importLines.length - 1];
  const insertIndex = source.indexOf(lastImport) + lastImport.length;
  return `${source.slice(0, insertIndex)}\n${statement}${source.slice(insertIndex)}`;
}

function sampleMelSource() {
  return `domain Counter {
  state {
    count: number = 0
  }

  computed canDecrement = gt(count, 0)

  action increment() {
    onceIntent {
      patch count = add(count, 1)
    }
  }

  action decrement() available when canDecrement {
    onceIntent {
      patch count = sub(count, 1)
    }
  }
}
`;
}

function sampleBaseRuntime() {
  return `import { createManifesto } from "@manifesto-ai/sdk";
import counterDomain from "../../manifesto/counter.mel";

const runtime = createManifesto(counterDomain, {}).activate();

export function getCounterSnapshot() {
  return runtime.getSnapshot();
}

export async function incrementCounter() {
  return runtime.dispatchAsync(runtime.createIntent(runtime.MEL.actions.increment));
}

export async function decrementCounter() {
  return runtime.dispatchAsync(runtime.createIntent(runtime.MEL.actions.decrement));
}
`;
}

function sampleLineageRuntime() {
  return `import { createManifesto } from "@manifesto-ai/sdk";
import { createInMemoryLineageStore, withLineage } from "@manifesto-ai/lineage";
import counterDomain from "../../manifesto/counter.mel";

const runtime = withLineage(createManifesto(counterDomain, {}), {
  store: createInMemoryLineageStore(),
}).activate();

export function getCounterSnapshot() {
  return runtime.getSnapshot();
}

export async function commitIncrement() {
  return runtime.commitAsync(runtime.createIntent(runtime.MEL.actions.increment));
}

export async function commitDecrement() {
  return runtime.commitAsync(runtime.createIntent(runtime.MEL.actions.decrement));
}
`;
}

function sampleGovernedRuntime() {
  return `import { createManifesto } from "@manifesto-ai/sdk";
import { createInMemoryLineageStore, withLineage } from "@manifesto-ai/lineage";
import { withGovernance } from "@manifesto-ai/governance";
import counterDomain from "../../manifesto/counter.mel";

const runtime = withGovernance(
  withLineage(createManifesto(counterDomain, {}), {
    store: createInMemoryLineageStore(),
  }),
  {
    bindings: {
      // TODO: replace this placeholder with your real actor bindings.
    },
    execution: {
      projectionId: "counter",
      deriveActor(intent) {
        return { actorId: "agent:demo", kind: "agent" };
      },
      deriveSource(intent) {
        return { kind: "agent", eventId: intent.intentId };
      },
    },
  },
).activate();

export function getCounterSnapshot() {
  return runtime.getSnapshot();
}

export async function proposeIncrement() {
  return runtime.proposeAsync(runtime.createIntent(runtime.MEL.actions.increment));
}
`;
}

function sampleRuntimeForPreset(preset) {
  switch (preset) {
    case "lineage":
      return sampleLineageRuntime();
    case "gov":
      return sampleGovernedRuntime();
    default:
      return sampleBaseRuntime();
  }
}
