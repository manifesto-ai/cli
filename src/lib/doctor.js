import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { compile } from "@manifesto-ai/compiler";
import {
  getManifestBindingCoverage,
  validateDomainFiles,
  validateMcpEffectManifest,
} from "@manifesto-ai/mcp/validation";
import { readManifestoConfig } from "./config.js";
import {
  readManifestoProjectConfig,
  resolveManifestoProjectPaths,
} from "./domain-config.js";
import {
  COMPILER_BUNDLER_IMPORTS,
  DOCTOR_PACKAGE_ORDER,
  PACKAGE_DEFINITIONS,
  SKILLS_DISPLAY_NAMES,
  SKILLS_TARGETS,
  runtimeToPackages,
} from "./constants.js";
import {
  detectBundler,
  detectClaudeSkillsInstall,
  detectCopilotSkillsInstall,
  detectCodexSkillsInstall,
  detectCursorSkillsInstall,
  detectWindsurfSkillsInstall,
  fileExists,
  findBundlerConfigPath,
  hasMelPluginConfigured,
  readInstalledPackageJson,
  scanProjectForSignal,
} from "./project.js";

export async function runDoctor({ cwd, strict = false, online = false }) {
  const checks = [];
  const configRecord = await readManifestoConfig(cwd);
  const config = configRecord?.config ?? null;
  const projectConfigRecord = await readManifestoProjectConfig(cwd);
  const bundlerDetection = detectBundler(cwd);

  const installedPackages = {};
  for (const packageName of DOCTOR_PACKAGE_ORDER) {
    installedPackages[packageName] = await readInstalledPackageJson(cwd, packageName);
  }

  const expectedPackages = collectExpectedPackages(config);
  const anyManifestoPackageInstalled = Object.values(installedPackages).some(Boolean);

  if (!config && !anyManifestoPackageInstalled) {
    checks.push(makeCheck("Intent", "warn", "No Manifesto config or packages detected", {
      suggestion: 'Run "manifesto init" to declare the intended Manifesto state for this project.',
    }));
  }

  if (config) {
    checks.push(makeCheck("Intent", "pass", `runtime=${config.runtime}`, {
      details: configRecord.path,
    }));
    checks.push(makeCheck("Intent", "pass", `integration=${config.integration.mode}`));
    checks.push(makeCheck("Intent", "pass", `codegen=${config.tooling.codegen}`));
    checks.push(makeCheck("Intent", "pass", `skills=${config.tooling.skills}`));
    checks.push(makeCheck("Intent", "pass", `sample=${config.sample}`));
  }

  for (const packageName of DOCTOR_PACKAGE_ORDER) {
    const installed = installedPackages[packageName];
    if (installed) {
      checks.push(makeCheck("Packages", "pass", `${packageName}@${installed.version}`));
      continue;
    }

    if (expectedPackages.has(packageName)) {
      checks.push(makeCheck("Packages", "error", `${packageName} is required but not installed`, {
        suggestion: `Install ${packageName}.`,
      }));
    }
  }

  await addIntegrationChecks({
    checks,
    cwd,
    config,
    bundlerDetection,
  });

  addRuntimeChecks({
    checks,
    config,
    installedPackages,
  });

  await addCodegenChecks({
    checks,
    cwd,
    config,
    installedPackages,
  });

  await addSkillsChecks({
    checks,
    cwd,
    config,
    installedPackages,
  });

  await addSampleChecks({
    checks,
    cwd,
    config,
  });

  await addDomainChecks({
    checks,
    cwd,
    projectConfigRecord,
    online,
  });

  checks.push(...buildCompatibilityChecks(installedPackages));

  const counts = summarizeChecks(checks);
  const exitCode = counts.errors > 0 || (strict && counts.warnings > 0) ? 1 : 0;

  return {
    cwd,
    strict,
    online,
    exitCode,
    configPath: configRecord?.path ?? null,
    projectConfigPath: projectConfigRecord?.path ?? null,
    checks,
    ...counts,
  };
}

async function addIntegrationChecks({ checks, cwd, config, bundlerDetection }) {
  const integrationMode = config?.integration.mode ?? bundlerDetection.bundler;

  if (integrationMode === "none") {
    checks.push(makeCheck("Integration", "pass", "integration disabled by Manifesto intent"));
    return;
  }

  if (integrationMode === "unknown") {
    checks.push(makeCheck("Integration", "warn", "No integration surface detected", {
      suggestion: 'Run "manifesto integrate <mode>" when you want compiler wiring.',
    }));
    return;
  }

  const evidence = config
    ? "manifesto.config.ts"
    : bundlerDetection.evidence ?? "project detection";
  checks.push(makeCheck("Integration", "pass", `${integrationMode} selected`, {
    details: evidence,
  }));

  if (integrationMode === "node-loader") {
    const configured = await hasMelPluginConfigured(cwd, "node-loader");
    checks.push(makeCheck(
      "Integration",
      configured ? "pass" : config ? "error" : "warn",
      configured
        ? "node-loader entry detected"
        : "node-loader script is not configured",
      configured
        ? {}
        : {
            suggestion: `Use ${COMPILER_BUNDLER_IMPORTS["node-loader"]} in a package.json script or your node invocation.`,
          },
    ));
    return;
  }

  const configPath = findBundlerConfigPath(cwd, integrationMode);
  if (!configPath) {
    checks.push(makeCheck(
      "Integration",
      config ? "error" : "warn",
      `No ${integrationMode} config file detected`,
      {
        suggestion: `Add a ${integrationMode} config and wire ${COMPILER_BUNDLER_IMPORTS[integrationMode]}.`,
      },
    ));
    return;
  }

  const configured = await hasMelPluginConfigured(cwd, integrationMode);
  checks.push(makeCheck(
    "Integration",
    configured ? "pass" : config ? "error" : "warn",
    configured
      ? "melPlugin() configured"
      : "melPlugin() is missing from the integration config",
    configured
      ? { details: configPath }
      : {
          details: configPath,
          suggestion: `Import melPlugin from ${COMPILER_BUNDLER_IMPORTS[integrationMode]} and add it to plugins.`,
        },
  ));
}

function addRuntimeChecks({ checks, config, installedPackages }) {
  if (!config) {
    return;
  }

  const expectedKeys = runtimeToPackages(config.runtime);
  if (config.runtime === "gov" && !expectedKeys.includes("lineage")) {
    checks.push(makeCheck("Runtime", "error", "gov runtime expects lineage semantics"));
  }

  if (config.runtime === "gov" && !installedPackages[PACKAGE_DEFINITIONS.lineage.packageName]) {
    checks.push(makeCheck(
      "Runtime",
      "error",
      "gov runtime requires @manifesto-ai/lineage",
      { suggestion: `Install ${PACKAGE_DEFINITIONS.lineage.packageName}.` },
    ));
  }
}

async function addCodegenChecks({ checks, cwd, config, installedPackages }) {
  const codegenPackage = PACKAGE_DEFINITIONS.codegen.packageName;
  const configuredMode = config?.tooling.codegen ?? "off";
  let codegenSignal = await scanProjectForSignal(
    cwd,
    [/createCompilerCodegen\s*\(/],
    ["src/manifesto", "manifesto"],
  );

  const integrationMode = config?.integration.mode ?? detectBundler(cwd).bundler;
  if (!codegenSignal && integrationMode !== "unknown" && integrationMode !== "none" && integrationMode !== "node-loader") {
    const bundlerConfigPath = findBundlerConfigPath(cwd, integrationMode);
    if (bundlerConfigPath) {
      const bundlerSource = await readFile(bundlerConfigPath, "utf8");
      if (bundlerSource.includes("@manifesto-ai/codegen") || bundlerSource.includes("createCompilerCodegen(")) {
        codegenSignal = relative(cwd, bundlerConfigPath);
      }
    }
  }

  const installed = Boolean(installedPackages[codegenPackage]);

  if (configuredMode === "off") {
    if (installed) {
      checks.push(makeCheck(
        "Tooling",
        "warn",
        "@manifesto-ai/codegen is installed, but manifesto.config disables codegen",
      ));
    }
    if (codegenSignal) {
      checks.push(makeCheck(
        "Tooling",
        "warn",
        "codegen wiring was detected, but manifesto.config sets codegen=off",
        { details: codegenSignal },
      ));
    }
    return;
  }

  checks.push(makeCheck(
    "Tooling",
    installed ? "pass" : "error",
    `${codegenPackage} ${installed ? "installed" : "missing"}`,
    installed ? {} : { suggestion: `Install ${codegenPackage}.` },
  ));

  if (configuredMode === "install") {
    checks.push(makeCheck(
      "Tooling",
      codegenSignal ? "warn" : "pass",
      codegenSignal
        ? "codegen wiring detected while intent is install-only"
        : "codegen install-only intent does not require wiring",
      codegenSignal ? { details: codegenSignal } : {},
    ));
    return;
  }

  checks.push(makeCheck(
    "Tooling",
    codegenSignal ? "pass" : "error",
    codegenSignal
      ? "codegen wiring detected"
      : "codegen wiring is required but was not detected",
    codegenSignal
      ? { details: codegenSignal }
      : { suggestion: 'Run "manifesto setup codegen wire" after choosing an integration mode.' },
  ));
}

async function addSkillsChecks({ checks, cwd, config, installedPackages }) {
  const skillsPackage = PACKAGE_DEFINITIONS.skills.packageName;
  const configuredMode = config?.tooling.skills ?? "off";
  const installed = Boolean(installedPackages[skillsPackage]);
  const skillInstalls = await detectSkillInstalls(cwd);
  const anySkillSetupInstalled = Object.values(skillInstalls).some((result) => result.installed);

  if (configuredMode === "off") {
    if (installed) {
      checks.push(makeCheck(
        "Skills",
        "warn",
        `${skillsPackage} is installed, but manifesto.config sets skills=off`,
      ));
    }
    if (anySkillSetupInstalled) {
      checks.push(makeCheck(
        "Skills",
        "warn",
        "agent-specific skills setup was detected, but manifesto.config sets skills=off",
      ));
    }
    return;
  }

  checks.push(makeCheck(
    "Skills",
    installed ? "pass" : "error",
    `${skillsPackage} ${installed ? "installed" : "missing"}`,
    installed ? {} : { suggestion: `Install ${skillsPackage}.` },
  ));

  if (configuredMode === "install") {
    checks.push(makeCheck(
      "Skills",
      anySkillSetupInstalled ? "warn" : "pass",
      anySkillSetupInstalled
        ? "agent-specific skills setup detected, but manifesto.config only requests skills=install"
        : "skills install intent does not require agent setup",
      anySkillSetupInstalled ? { details: summarizeInstalledSkillEvidence(skillInstalls) } : {},
    ));
    return;
  }

  if (configuredMode === "all") {
    const missingTargets = SKILLS_TARGETS.filter((target) => !skillInstalls[target].installed);
    checks.push(makeCheck(
      "Skills",
      missingTargets.length === 0 ? "pass" : "error",
      missingTargets.length === 0
        ? "all supported agent skill installs detected"
        : `skills=all is missing ${missingTargets.map((target) => SKILLS_DISPLAY_NAMES[target]).join(", ")}`,
      missingTargets.length === 0
        ? { details: summarizeInstalledSkillEvidence(skillInstalls) }
        : { suggestion: "Run: manifesto setup skills all" },
    ));
    return;
  }

  const configuredInstall = skillInstalls[configuredMode];
  checks.push(makeCheck(
    "Skills",
    configuredInstall.installed ? "pass" : "error",
    configuredInstall.installed
      ? `${SKILLS_DISPLAY_NAMES[configuredMode]} skill install detected`
      : `skills=${configuredMode} requires ${SKILLS_DISPLAY_NAMES[configuredMode]} setup`,
    configuredInstall.installed
      ? { details: configuredInstall.evidence }
      : { suggestion: `Run: manifesto setup skills ${configuredMode}` },
  ));
}

async function addSampleChecks({ checks, cwd, config }) {
  if (!config || config.sample === "none") {
    return;
  }

  const melPath = join(cwd, "manifesto", "counter.mel");
  const runtimePath = join(cwd, "src", "manifesto", "runtime.js");
  const melExists = await fileExists(melPath);
  const runtimeExists = await fileExists(runtimePath);

  checks.push(makeCheck(
    "Sample",
    melExists ? "pass" : "warn",
    melExists ? "counter.mel sample present" : "counter.mel sample is missing",
    melExists ? { details: "manifesto/counter.mel" } : {
      suggestion: 'Run "manifesto scaffold counter".',
    },
  ));

  checks.push(makeCheck(
    "Sample",
    runtimeExists ? "pass" : "warn",
    runtimeExists ? "sample runtime present" : "sample runtime is missing",
    runtimeExists ? { details: "src/manifesto/runtime.js" } : {
      suggestion: 'Run "manifesto scaffold counter".',
    },
  ));
}

async function addDomainChecks({ checks, cwd, projectConfigRecord, online }) {
  if (!projectConfigRecord) {
    return;
  }

  const projectConfig = projectConfigRecord.config;
  const paths = resolveManifestoProjectPaths(cwd, projectConfig);
  checks.push(makeCheck("Domains", "pass", "manifesto.json detected", {
    details: relative(cwd, projectConfigRecord.path),
  }));

  const domainsDirExists = await fileExists(paths.domainsDir);
  checks.push(makeCheck(
    "Domains",
    domainsDirExists ? "pass" : "error",
    domainsDirExists ? "domains directory detected" : "domains directory is missing",
    { details: relative(cwd, paths.domainsDir) },
  ));

  const agentsDirExists = await fileExists(paths.agentsDir);
  checks.push(makeCheck(
    "Domains",
    agentsDirExists ? "pass" : "warn",
    agentsDirExists ? "agents directory detected" : "agents directory is missing",
    { details: relative(cwd, paths.agentsDir) },
  ));

  if (!domainsDirExists) {
    return;
  }

  const envContent = await readFile(join(cwd, ".env"), "utf8").catch(() => "");
  const envValues = parseEnvFile(envContent);
  const entries = await readdir(paths.domainsDir, { withFileTypes: true });
  const domains = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();

  if (domains.length === 0) {
    checks.push(makeCheck("Domains", "warn", "no local domains found", {
      details: relative(cwd, paths.domainsDir),
    }));
    return;
  }

  for (const domainName of domains) {
    const domainDir = join(paths.domainsDir, domainName);
    const domainEntries = await readdir(domainDir, { withFileTypes: true });
    const invalidDirectories = domainEntries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    if (invalidDirectories.length > 0) {
      checks.push(makeCheck(
        "Domains",
        "error",
        `${domainName}: nested directories are not allowed`,
        { details: invalidDirectories.join(", ") },
      ));
      continue;
    }

    const filenames = domainEntries.filter((entry) => entry.isFile()).map((entry) => entry.name).sort();
    const fileValidation = validateDomainFiles(filenames);
    if (!fileValidation.ok) {
      for (const error of fileValidation.errors) {
        checks.push(makeCheck(
          "Domains",
          "error",
          `${domainName}: ${error.message}`,
          { details: error.path },
        ));
      }
      continue;
    }

    checks.push(makeCheck("Domains", "pass", `${domainName}: domain file allow-list passed`));

    const melPath = join(domainDir, "domain.mel");
    const melSource = await readFile(melPath, "utf8");
    const compileResult = compile(melSource);
    if (!compileResult.success || !compileResult.schema) {
      checks.push(makeCheck(
        "Domains",
        "error",
        `${domainName}: MEL compile failed`,
        { details: compileResult.errors.map((error) => error.message).join("; ") || relative(cwd, melPath) },
      ));
      continue;
    }

    checks.push(makeCheck("Domains", "pass", `${domainName}: MEL compiled`, {
      details: compileResult.schema.hash,
    }));

    if (compileResult.warnings.length > 0) {
      checks.push(makeCheck(
        "Domains",
        "warn",
        `${domainName}: compiler warnings`,
        { details: compileResult.warnings.map((warning) => warning.message).join("; ") },
      ));
    }

    const manifestPath = join(domainDir, "mcp-manifest.json");
    if (!(await fileExists(manifestPath))) {
      continue;
    }

    let manifestJson;
    try {
      manifestJson = JSON.parse(await readFile(manifestPath, "utf8"));
    } catch {
      checks.push(makeCheck("Domains", "error", `${domainName}: mcp-manifest.json is invalid JSON`));
      continue;
    }

    const manifestValidation = validateMcpEffectManifest(manifestJson, { mode: "runtime" });
    if (!manifestValidation.ok || !manifestValidation.value) {
      checks.push(makeCheck(
        "Domains",
        "error",
        `${domainName}: MCP manifest validation failed`,
        { details: manifestValidation.errors.map((error) => `${error.path}: ${error.message}`).join("; ") },
      ));
      continue;
    }

    checks.push(makeCheck("Domains", "pass", `${domainName}: MCP manifest valid`));

    const effectCoverage = getManifestBindingCoverage(
      collectEffectTypes(compileResult.schema),
      manifestValidation.value,
    );
    if (effectCoverage.missing.length > 0) {
      checks.push(makeCheck(
        "Domains",
        "warn",
        `${domainName}: missing MCP bindings`,
        { details: effectCoverage.missing.join(", ") },
      ));
    } else {
      checks.push(makeCheck("Domains", "pass", `${domainName}: effect bindings covered`));
    }

    for (const [envKey, spec] of Object.entries(manifestValidation.value.env ?? {})) {
      if (!spec.required) {
        continue;
      }

      const hasValue = typeof envValues[envKey] === "string" && envValues[envKey].trim().length > 0;
      checks.push(makeCheck(
        "Domains",
        hasValue ? "pass" : "error",
        `${domainName}: ${envKey} ${hasValue ? "configured" : "missing from .env"}`,
      ));
    }

    if (online) {
      for (const [serverName, server] of Object.entries(manifestValidation.value.servers)) {
        const connectivity = await probeMcpServer(server, envValues);
        checks.push(makeCheck(
          "Domains",
          connectivity.status,
          `${domainName}: ${serverName} ${connectivity.label}`,
          connectivity.details ? { details: connectivity.details } : {},
        ));
      }
    }
  }
}

function collectExpectedPackages(config) {
  const expected = new Set();
  if (!config) {
    return expected;
  }

  for (const packageKey of runtimeToPackages(config.runtime)) {
    expected.add(PACKAGE_DEFINITIONS[packageKey].packageName);
  }

  if (config.tooling.codegen !== "off") {
    expected.add(PACKAGE_DEFINITIONS.codegen.packageName);
  }

  if (config.tooling.skills !== "off") {
    expected.add(PACKAGE_DEFINITIONS.skills.packageName);
  }

  return expected;
}

function buildCompatibilityChecks(installedPackages) {
  const checks = [];
  for (const [packageName, packageJson] of Object.entries(installedPackages)) {
    const compatibleWith = packageJson?.manifesto?.compatibleWith;
    if (!compatibleWith) {
      continue;
    }

    for (const [relatedName, range] of Object.entries(compatibleWith)) {
      const relatedPackageName = relatedName.startsWith("@manifesto-ai/")
        ? relatedName
        : `@manifesto-ai/${relatedName}`;
      const related = installedPackages[relatedPackageName];
      if (!related) {
        checks.push(makeCheck(
          "Compatibility",
          "warn",
          `${packageName} declares compatibility with ${relatedName}, but it is not installed`,
        ));
        continue;
      }

      const ok = satisfiesRange(related.version, range);
      checks.push(makeCheck(
        "Compatibility",
        ok ? "pass" : "error",
        `${packageName} -> ${relatedPackageName} (${range})`,
        ok ? { details: related.version } : {
          details: related.version,
          suggestion: `Install a ${relatedPackageName} version that satisfies ${range}.`,
        },
      ));
    }
  }

  return checks;
}

function summarizeChecks(checks) {
  const summary = {
    passed: 0,
    warnings: 0,
    errors: 0,
  };

  for (const check of checks) {
    if (check.status === "pass") {
      summary.passed += 1;
    } else if (check.status === "warn") {
      summary.warnings += 1;
    } else {
      summary.errors += 1;
    }
  }

  return summary;
}

async function detectSkillInstalls(cwd) {
  return {
    codex: await detectCodexSkillsInstall(),
    claude: cwd ? await detectClaudeSkillsInstall(cwd) : { installed: false, evidence: null },
    cursor: cwd ? await detectCursorSkillsInstall(cwd) : { installed: false, evidence: null },
    copilot: cwd ? await detectCopilotSkillsInstall(cwd) : { installed: false, evidence: null },
    windsurf: cwd ? await detectWindsurfSkillsInstall(cwd) : { installed: false, evidence: null },
  };
}

function summarizeInstalledSkillEvidence(skillInstalls) {
  return Object.entries(skillInstalls)
    .filter(([, result]) => result.installed)
    .map(([target, result]) => `${SKILLS_DISPLAY_NAMES[target]}: ${result.evidence}`)
    .join(", ");
}

function parseEnvFile(content) {
  const values = {};
  for (const line of content.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1);
    values[key] = value;
  }

  return values;
}

function collectEffectTypesFromFlow(flow, bucket = new Set()) {
  if (!flow || typeof flow !== "object") {
    return bucket;
  }

  if (flow.kind === "effect" && typeof flow.type === "string") {
    bucket.add(flow.type);
    return bucket;
  }

  if (flow.kind === "seq" && Array.isArray(flow.steps)) {
    for (const step of flow.steps) {
      collectEffectTypesFromFlow(step, bucket);
    }
    return bucket;
  }

  if (flow.kind === "if") {
    collectEffectTypesFromFlow(flow.then, bucket);
    if (flow.else) {
      collectEffectTypesFromFlow(flow.else, bucket);
    }
  }

  return bucket;
}

function collectEffectTypes(schema) {
  const bucket = new Set();
  for (const action of Object.values(schema.actions ?? {})) {
    collectEffectTypesFromFlow(action.flow, bucket);
  }
  return Array.from(bucket.values()).sort();
}

async function probeMcpServer(server, envValues) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);

  try {
    const headers = {};
    if (server.auth.type === "env") {
      const token = envValues[server.auth.envKey] ?? process.env[server.auth.envKey];
      if (!token) {
        return {
          status: "warn",
          label: "connectivity skipped",
          details: `Missing auth token ${server.auth.envKey}`,
        };
      }

      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(server.url, {
      method: "GET",
      headers,
      signal: controller.signal,
    });

    if (response.status >= 500) {
      return {
        status: "warn",
        label: "unreachable",
        details: `${response.status} ${response.statusText}`,
      };
    }

    return {
      status: "pass",
      label: "reachable",
      details: `${response.status} ${response.statusText}`,
    };
  } catch (error) {
    return {
      status: "warn",
      label: "unreachable",
      details: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function makeCheck(category, status, label, extra = {}) {
  return {
    category,
    status,
    label,
    details: extra.details,
    suggestion: extra.suggestion,
  };
}

function satisfiesRange(version, range) {
  if (!range || range === "*" || range === version) {
    return true;
  }

  const cleanedVersion = normalizeVersion(version);
  const cleanedRange = String(range).trim();

  if (cleanedRange.startsWith("^")) {
    const base = normalizeVersion(cleanedRange.slice(1));
    return cleanedVersion.major === base.major
      && compareVersions(cleanedVersion, base) >= 0;
  }

  if (cleanedRange.startsWith("~")) {
    const base = normalizeVersion(cleanedRange.slice(1));
    return cleanedVersion.major === base.major
      && cleanedVersion.minor === base.minor
      && compareVersions(cleanedVersion, base) >= 0;
  }

  if (cleanedRange.startsWith(">=")) {
    return compareVersions(cleanedVersion, normalizeVersion(cleanedRange.slice(2))) >= 0;
  }

  return version === cleanedRange;
}

function normalizeVersion(version) {
  const [major = "0", minor = "0", patch = "0"] = String(version).split(".");
  return {
    major: Number.parseInt(major, 10),
    minor: Number.parseInt(minor, 10),
    patch: Number.parseInt(patch, 10),
  };
}

function compareVersions(left, right) {
  if (left.major !== right.major) {
    return left.major - right.major;
  }

  if (left.minor !== right.minor) {
    return left.minor - right.minor;
  }

  return left.patch - right.patch;
}
