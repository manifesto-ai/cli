import { readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { readManifestoConfig } from "./config.js";
import {
  COMPILER_BUNDLER_IMPORTS,
  DOCTOR_PACKAGE_ORDER,
  PACKAGE_DEFINITIONS,
  runtimeToPackages,
} from "./constants.js";
import {
  detectBundler,
  detectCodexSkillsInstall,
  fileExists,
  findBundlerConfigPath,
  hasMelPluginConfigured,
  readInstalledPackageJson,
  scanProjectForSignal,
} from "./project.js";

export async function runDoctor({ cwd, strict = false }) {
  const checks = [];
  const configRecord = await readManifestoConfig(cwd);
  const config = configRecord?.config ?? null;
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
    config,
    installedPackages,
  });

  await addSampleChecks({
    checks,
    cwd,
    config,
  });

  checks.push(...buildCompatibilityChecks(installedPackages));

  const counts = summarizeChecks(checks);
  const exitCode = counts.errors > 0 || (strict && counts.warnings > 0) ? 1 : 0;

  return {
    cwd,
    strict,
    exitCode,
    configPath: configRecord?.path ?? null,
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

async function addSkillsChecks({ checks, config, installedPackages }) {
  const skillsPackage = PACKAGE_DEFINITIONS.skills.packageName;
  const configuredMode = config?.tooling.skills ?? "off";
  const installed = Boolean(installedPackages[skillsPackage]);
  const codexSkills = await detectCodexSkillsInstall();

  if (configuredMode === "off") {
    if (installed) {
      checks.push(makeCheck(
        "Skills",
        "warn",
        `${skillsPackage} is installed, but manifesto.config sets skills=off`,
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
      codexSkills.installed ? "warn" : "pass",
      codexSkills.installed
        ? "Codex setup detected, but manifesto.config only requests skills=install"
        : "skills install intent does not require Codex setup",
      codexSkills.installed ? { details: codexSkills.evidence } : {},
    ));
    return;
  }

  checks.push(makeCheck(
    "Skills",
    codexSkills.installed ? "pass" : "error",
    codexSkills.installed
      ? "Codex skill install detected"
      : "skills=codex requires Codex setup",
    codexSkills.installed
      ? { details: codexSkills.evidence }
      : { suggestion: "Run: manifesto setup skills codex" },
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
