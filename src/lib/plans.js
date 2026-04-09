import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import {
  BUNDLER_CONFIG_CANDIDATES,
  CODEGEN_MODES,
  COMPILER_BUNDLER_IMPORTS,
  INTEGRATION_MODES,
  PACKAGE_DEFINITIONS,
  RUNTIMES,
  SKILLS_DISPLAY_NAMES,
  SKILLS_INSTALL_COMMANDS,
  SAMPLE_MODES,
  SKILLS_SETUP_MODES,
  SKILLS_MODES,
  normalizeCodegenMode,
  normalizeIntegrationMode,
  normalizeRuntime,
  normalizeSampleMode,
  normalizeSkillsMode,
  runtimeToPackages,
} from "./constants.js";
import { CliError } from "./errors.js";
import {
  createManifestoConfig,
  mergeManifestoConfig,
  readManifestoConfig,
  serializeManifestoConfig,
} from "./config.js";
import {
  buildExecCommand,
  buildInstallCommand,
  runCommand,
  runInstallCommand,
} from "./package-manager.js";
import {
  detectPackageManager,
  fileExists,
  findBundlerConfigPath,
  readPackageJson,
  writeTextFile,
} from "./project.js";

export async function buildInitPlan({
  cwd,
  runtime,
  integration,
  codegen,
  skills,
  sample,
}) {
  const existingConfig = await resolveExistingConfig(cwd);
  const nextConfig = mergeManifestoConfig(existingConfig, {
    runtime,
    integration: integration ? { mode: integration } : undefined,
    tooling: {
      codegen,
      skills,
    },
    sample,
  });

  return buildPlanFromConfig({
    cwd,
    currentConfig: existingConfig,
    nextConfig,
    commandName: "init",
    applyIntegration: nextConfig.integration.mode !== "none",
    applySample: nextConfig.sample !== "none",
    applySkillsSetup: SKILLS_SETUP_MODES.includes(nextConfig.tooling.skills),
  });
}

export async function buildIntegratePlan({ cwd, integration }) {
  const existingConfig = await resolveExistingConfig(cwd);
  const nextConfig = mergeManifestoConfig(existingConfig, {
    integration: { mode: integration },
  });

  return buildPlanFromConfig({
    cwd,
    currentConfig: existingConfig,
    nextConfig,
    commandName: "integrate",
    applyIntegration: nextConfig.integration.mode !== "none",
    applySample: false,
    applySkillsSetup: false,
  });
}

export async function buildSetupPlan({ cwd, target, state }) {
  const existingConfig = await resolveExistingConfig(cwd);

  if (target === "codegen") {
    const nextConfig = mergeManifestoConfig(existingConfig, {
      tooling: {
        codegen: state,
      },
    });

    return buildPlanFromConfig({
      cwd,
      currentConfig: existingConfig,
      nextConfig,
      commandName: "setup",
      applyIntegration: nextConfig.tooling.codegen === "wire",
      applySample: false,
      applySkillsSetup: false,
    });
  }

  if (target === "skills") {
    const nextConfig = mergeManifestoConfig(existingConfig, {
      tooling: {
        skills: state,
      },
    });

    return buildPlanFromConfig({
      cwd,
      currentConfig: existingConfig,
      nextConfig,
      commandName: "setup",
      applyIntegration: false,
      applySample: false,
      applySkillsSetup: SKILLS_SETUP_MODES.includes(nextConfig.tooling.skills),
    });
  }

  throw new CliError(`Unsupported setup target "${target}". Valid values: codegen, skills.`);
}

export async function buildScaffoldPlan({ cwd, sample }) {
  const existingConfig = await resolveExistingConfig(cwd);
  const nextConfig = mergeManifestoConfig(existingConfig, {
    sample,
  });

  return buildPlanFromConfig({
    cwd,
    currentConfig: existingConfig,
    nextConfig,
    commandName: "scaffold",
    applyIntegration: false,
    applySample: nextConfig.sample !== "none",
    applySkillsSetup: false,
  });
}

export async function buildAddPlan({ cwd, capability }) {
  const existingConfig = await resolveExistingConfig(cwd);
  let nextConfig = existingConfig;

  switch (capability) {
    case "lineage":
      nextConfig = mergeManifestoConfig(existingConfig, {
        runtime: existingConfig.runtime === "gov" ? "gov" : "lineage",
      });
      break;
    case "governance":
      nextConfig = mergeManifestoConfig(existingConfig, {
        runtime: "gov",
      });
      break;
    case "codegen":
      nextConfig = mergeManifestoConfig(existingConfig, {
        tooling: {
          codegen: existingConfig.integration.mode === "none" ? "install" : "wire",
        },
      });
      break;
    case "skills":
      nextConfig = mergeManifestoConfig(existingConfig, {
        tooling: {
          skills: "install",
        },
      });
      break;
    default:
      throw new CliError(
        `Unsupported capability "${capability}". Valid values: lineage, governance, codegen, skills.`,
      );
  }

  const plan = await buildPlanFromConfig({
    cwd,
    currentConfig: existingConfig,
    nextConfig,
    commandName: "add",
    applyIntegration: capability === "codegen" && nextConfig.tooling.codegen === "wire",
    applySample: false,
    applySkillsSetup: false,
  });

  plan.notes.unshift(
    `manifesto add is deprecated. Use ${deprecatedAddReplacement(capability, nextConfig)} instead.`,
  );

  return plan;
}

export async function applyPlan(plan) {
  for (const fileAction of plan.files) {
    await writeTextFile(fileAction.path, fileAction.content);
  }

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

  for (const commandStep of plan.commands) {
    runCommand({
      cwd: plan.cwd,
      command: commandStep.command,
      args: commandStep.args,
    });
  }
}

async function buildPlanFromConfig({
  cwd,
  currentConfig,
  nextConfig,
  commandName,
  applyIntegration,
  applySample,
  applySkillsSetup,
}) {
  validateConfigIntent(nextConfig);

  const packageJson = await readPackageJson(cwd);
  const packageManager = detectPackageManager(cwd, packageJson);
  const installGroups = collectInstallGroups(nextConfig);
  const files = [{
    path: join(cwd, "manifesto.config.ts"),
    content: serializeManifestoConfig(nextConfig),
    mode: "write",
    reason: "record Manifesto intent for doctor and future CLI actions",
  }];
  const notes = buildSharedNotes({
    commandName,
    currentConfig,
    nextConfig,
    packageManager,
  });

  if (applyIntegration && nextConfig.integration.mode !== "none") {
    const integrationAction = await buildBundlerIntegrationAction({
      cwd,
      mode: nextConfig.integration.mode,
      includeCodegen: nextConfig.tooling.codegen === "wire",
      packageJson,
    });
    if (integrationAction) {
      files.push(integrationAction);
    } else {
      notes.push(`No ${nextConfig.integration.mode} integration patch was needed.`);
    }
  }

  if (applySample && nextConfig.sample === "counter") {
    files.push(...await buildSampleFiles({
      cwd,
      runtime: nextConfig.runtime,
    }));
  }

  const commands = [];
  if (applySkillsSetup && SKILLS_SETUP_MODES.includes(nextConfig.tooling.skills)) {
    const skillCommandArgs = SKILLS_INSTALL_COMMANDS[nextConfig.tooling.skills];
    commands.push({
      ...buildExecCommand(packageManager, "manifesto-skills", skillCommandArgs),
      reason: `run the ${SKILLS_DISPLAY_NAMES[nextConfig.tooling.skills]} installer from @manifesto-ai/skills`,
    });
  }

  return {
    cwd,
    packageManager,
    intent: nextConfig,
    installGroups,
    files,
    commands,
    notes,
  };
}

async function resolveExistingConfig(cwd) {
  const existingConfig = await readManifestoConfig(cwd);
  return existingConfig?.config ?? createManifestoConfig();
}

function validateConfigIntent(config) {
  if (!RUNTIMES.includes(config.runtime)) {
    throw new CliError(`Unsupported runtime "${config.runtime}".`);
  }

  if (!INTEGRATION_MODES.includes(config.integration.mode)) {
    throw new CliError(`Unsupported integration "${config.integration.mode}".`);
  }

  if (!CODEGEN_MODES.includes(config.tooling.codegen)) {
    throw new CliError(`Unsupported codegen mode "${config.tooling.codegen}".`);
  }

  if (!SKILLS_MODES.includes(config.tooling.skills)) {
    throw new CliError(`Unsupported skills mode "${config.tooling.skills}".`);
  }

  if (!SAMPLE_MODES.includes(config.sample)) {
    throw new CliError(`Unsupported sample mode "${config.sample}".`);
  }

  if (config.tooling.codegen === "wire" && config.integration.mode === "none") {
    throw new CliError('codegen "wire" requires an integration mode other than "none".');
  }

  if (config.tooling.codegen === "wire" && config.integration.mode === "node-loader") {
    throw new CliError('codegen "wire" is not supported with "node-loader". Use "install" instead.');
  }
}

function collectInstallGroups(config) {
  const installGroups = {
    dependencies: [],
    devDependencies: [],
  };

  for (const packageKey of runtimeToPackages(config.runtime)) {
    const definition = PACKAGE_DEFINITIONS[packageKey];
    installGroups[definition.dependencyType].push(definition.packageName);
  }

  if (config.tooling.codegen !== "off") {
    installGroups.devDependencies.push(PACKAGE_DEFINITIONS.codegen.packageName);
  }

  if (config.tooling.skills !== "off") {
    installGroups.devDependencies.push(PACKAGE_DEFINITIONS.skills.packageName);
  }

  return dedupeInstallGroups(installGroups);
}

async function buildBundlerIntegrationAction({ cwd, mode, includeCodegen, packageJson }) {
  if (mode === "node-loader") {
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

  const existingPath = findBundlerConfigPath(cwd, mode);
  if (existingPath) {
    if (basename(existingPath).startsWith("next.config")) {
      return null;
    }

    const source = await readFile(existingPath, "utf8");
    const updated = injectBundlerPlugin(source, {
      bundler: mode,
      includeCodegen,
      filename: basename(existingPath),
    });

    if (!updated || updated === source) {
      return null;
    }

    return {
      path: existingPath,
      content: updated,
      mode: "write",
      reason: "wire melPlugin() into the selected integration surface",
    };
  }

  const targetPath = join(cwd, defaultBundlerConfigFilename(mode, packageJson));
  return {
    path: targetPath,
    content: createBundlerConfigTemplate({
      bundler: mode,
      includeCodegen,
      moduleType: packageJson?.type === "module",
    }),
    mode: "write",
    reason: `create a ${mode} config with Manifesto compiler wiring`,
  };
}

async function buildSampleFiles({ cwd, runtime }) {
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
      content: sampleRuntimeForRuntime(runtime),
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

function dedupeInstallGroups(groups) {
  return {
    dependencies: Array.from(new Set(groups.dependencies)).sort(),
    devDependencies: Array.from(new Set(groups.devDependencies)).sort(),
  };
}

function buildSharedNotes({ commandName, currentConfig, nextConfig, packageManager }) {
  const notes = ['Run "manifesto doctor" after the install to validate the resulting project state.'];

  if (nextConfig.integration.mode === "none" && currentConfig.integration.mode !== "none") {
    notes.push("Integration intent is now set to none. Existing bundler wiring is left untouched.");
  }

  if (nextConfig.sample === "none" && currentConfig.sample !== "none") {
    notes.push("Sample intent is now none. Existing sample files are left untouched.");
  }

  if (nextConfig.integration.mode === "webpack") {
    notes.push(
      "Webpack and Next.js share the compiler subpath. Next-specific config still needs manual review.",
    );
  }

  if (commandName === "setup" && SKILLS_SETUP_MODES.includes(nextConfig.tooling.skills)) {
    notes.push(
      `${SKILLS_DISPLAY_NAMES[nextConfig.tooling.skills]} setup will run via ${packageManager} exec manifesto-skills ${SKILLS_INSTALL_COMMANDS[nextConfig.tooling.skills].join(" ")}.`,
    );
  }

  if (nextConfig.tooling.skills === "install") {
    notes.push(
      "Agent setup remains optional. Use manifesto setup skills <codex|claude|cursor|copilot|windsurf|all> when you want tool-specific guidance installed.",
    );
  }

  if (nextConfig.tooling.codegen === "install") {
    notes.push("Codegen is installed only. Run manifesto setup codegen wire when you want compiler wiring.");
  }

  return notes;
}

function deprecatedAddReplacement(capability, nextConfig) {
  switch (capability) {
    case "lineage":
      return "manifesto init --runtime lineage --non-interactive";
    case "governance":
      return "manifesto init --runtime gov --non-interactive";
    case "codegen":
      return `manifesto setup codegen ${nextConfig.tooling.codegen}`;
    case "skills":
      return "manifesto setup skills install";
    default:
      return "manifesto help";
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

  if (bundler === "rollup") {
    return "rollup.config.mjs";
  }

  if (bundler === "esbuild") {
    return "esbuild.config.mjs";
  }

  if (bundler === "rspack") {
    return isModule ? "rspack.config.mjs" : "rspack.config.js";
  }

  return BUNDLER_CONFIG_CANDIDATES[bundler]?.[0] ?? `${bundler}.config.js`;
}

function createBundlerConfigTemplate({ bundler, includeCodegen, moduleType }) {
  const pluginCall = includeCodegen
    ? "melPlugin({ codegen: createCompilerCodegen() })"
    : "melPlugin()";
  const codegenImport = includeCodegen
    ? 'import { createCompilerCodegen } from "@manifesto-ai/codegen";\n'
    : "";
  const codegenRequire = includeCodegen
    ? 'const { createCompilerCodegen } = require("@manifesto-ai/codegen");\n'
    : "";

  switch (bundler) {
    case "vite":
      return `${codegenImport}import { melPlugin } from "${COMPILER_BUNDLER_IMPORTS.vite}";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [${pluginCall}],
});
`;
    case "rollup":
      return `${codegenImport}import { defineConfig } from "rollup";
import { melPlugin } from "${COMPILER_BUNDLER_IMPORTS.rollup}";

export default defineConfig({
  plugins: [${pluginCall}],
});
`;
    case "esbuild":
      return `${codegenImport}import { build } from "esbuild";
import { melPlugin } from "${COMPILER_BUNDLER_IMPORTS.esbuild}";

await build({
  plugins: [${pluginCall}],
});
`;
    case "rspack":
      if (moduleType) {
        return `${codegenImport}import { melPlugin } from "${COMPILER_BUNDLER_IMPORTS.rspack}";

export default {
  plugins: [${pluginCall}],
};
`;
      }

      return `${codegenRequire}const { melPlugin } = require("${COMPILER_BUNDLER_IMPORTS.rspack}");

module.exports = {
  plugins: [${pluginCall}],
};
`;
    case "webpack":
    default:
      if (moduleType) {
        return `${codegenImport}import { melPlugin } from "${COMPILER_BUNDLER_IMPORTS.webpack}";

export default {
  plugins: [${pluginCall}],
};
`;
      }

      return `${codegenRequire}const { melPlugin } = require("${COMPILER_BUNDLER_IMPORTS.webpack}");

module.exports = {
  plugins: [${pluginCall}],
};
`;
  }
}

function injectBundlerPlugin(source, { bundler, includeCodegen, filename }) {
  const importTarget = COMPILER_BUNDLER_IMPORTS[bundler];
  const pluginCall = includeCodegen
    ? "melPlugin({ codegen: createCompilerCodegen() })"
    : "melPlugin()";
  const usesCommonJs = filename.endsWith(".cjs")
    || (filename.endsWith(".js") && source.includes("module.exports"));
  const hasPlugin = source.includes("melPlugin(") || source.includes(importTarget);
  const hasCodegen = source.includes("createCompilerCodegen(");
  let updated = source;

  if (hasPlugin && (!includeCodegen || hasCodegen)) {
    return source;
  }

  if (includeCodegen && hasPlugin && !hasCodegen) {
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

  if (includeCodegen) {
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

  if (/build\s*\(\s*\{/.test(updated)) {
    return updated.replace(/build\s*\(\s*\{/, `build({\n  plugins: [${pluginCall}],`);
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

function sampleRuntimeForRuntime(runtime) {
  switch (normalizeRuntime(runtime)) {
    case "lineage":
      return sampleLineageRuntime();
    case "gov":
      return sampleGovernedRuntime();
    default:
      return sampleBaseRuntime();
  }
}
