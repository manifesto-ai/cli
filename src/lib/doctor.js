import { readFile } from "node:fs/promises";
import { relative } from "node:path";
import { readManifestoConfig } from "./config.js";
import {
  CAPABILITY_DEFINITIONS,
  COMPILER_BUNDLER_IMPORTS,
  DOCTOR_PACKAGE_ORDER,
} from "./constants.js";
import {
  detectBundler,
  detectCodexSkillsInstall,
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
    checks.push(makeCheck("Packages", "warn", "No Manifesto config or packages detected", {
      suggestion: 'Run "manifesto init" to scaffold a Manifesto-aware project.',
    }));
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

  const effectiveBundler = config?.bundler ?? bundlerDetection.bundler;
  if (effectiveBundler !== "unknown") {
    const evidence = bundlerDetection.evidence ?? configRecord?.path ?? "manifesto.config.ts";
    checks.push(makeCheck("Bundler Integration", "pass", `${effectiveBundler} detected`, {
      details: evidence,
    }));

    if (effectiveBundler === "node-loader") {
      const configured = await hasMelPluginConfigured(cwd, "node-loader");
      checks.push(makeCheck(
        "Bundler Integration",
        configured ? "pass" : "warn",
        configured
          ? "node-loader entry detected"
          : "node-loader script is not configured",
        configured
          ? {}
          : {
              suggestion: `Use ${COMPILER_BUNDLER_IMPORTS["node-loader"]} in a package.json script or your node invocation.`,
            },
      ));
    } else {
      const configPath = findBundlerConfigPath(cwd, effectiveBundler);
      if (!configPath) {
        checks.push(makeCheck("Bundler Integration", "warn", `No ${effectiveBundler} config file detected`, {
          suggestion: `Add a ${effectiveBundler} config and wire ${COMPILER_BUNDLER_IMPORTS[effectiveBundler]}.`,
        }));
      } else {
        const configured = await hasMelPluginConfigured(cwd, effectiveBundler);
        checks.push(makeCheck(
          "Bundler Integration",
          configured ? "pass" : "error",
          configured
            ? "melPlugin() configured"
            : "melPlugin() is missing from the bundler config",
          configured
            ? { details: configPath }
            : {
                details: configPath,
                suggestion: `Import melPlugin from ${COMPILER_BUNDLER_IMPORTS[effectiveBundler]} and add it to plugins.`,
              },
        ));
      }
    }
  }

  const hasLineage = Boolean(installedPackages["@manifesto-ai/lineage"])
    || config?.capabilities?.includes("lineage");
  const hasGovernance = Boolean(installedPackages["@manifesto-ai/governance"])
    || config?.capabilities?.includes("governance");
  if (hasGovernance) {
    checks.push(makeCheck(
      "Composition Integrity",
      hasLineage ? "pass" : "error",
      hasLineage
        ? "governance requires lineage - present"
        : "governance requires lineage",
      hasLineage ? {} : { suggestion: 'Run "manifesto add lineage" first.' },
    ));
  }

  let codegenSignal = await scanProjectForSignal(
    cwd,
    [/createCompilerCodegen\s*\(/],
    ["src/manifesto", "manifesto"],
  );
  if (!codegenSignal && effectiveBundler !== "unknown" && effectiveBundler !== "node-loader") {
    const bundlerConfigPath = findBundlerConfigPath(cwd, effectiveBundler);
    if (bundlerConfigPath) {
      const bundlerSource = await readFile(bundlerConfigPath, "utf8");
      if (bundlerSource.includes("@manifesto-ai/codegen") || bundlerSource.includes("createCompilerCodegen(")) {
        codegenSignal = relative(cwd, bundlerConfigPath);
      }
    }
  }
  if (codegenSignal) {
    const installed = Boolean(installedPackages["@manifesto-ai/codegen"]);
    checks.push(makeCheck(
      "Composition Integrity",
      installed ? "pass" : "error",
      installed
        ? "codegen signal detected and @manifesto-ai/codegen is installed"
        : "codegen is referenced but @manifesto-ai/codegen is missing",
      installed ? { details: codegenSignal } : {
        details: codegenSignal,
        suggestion: 'Run "manifesto add codegen".',
      },
    ));
  }

  if (config) {
    for (const capability of config.capabilities) {
      const packageName = Object.values(CAPABILITY_DEFINITIONS)
        .find((definition) => definition.configCapability === capability)?.packageName;
      if (packageName && !installedPackages[packageName]) {
        checks.push(makeCheck(
          "Composition Integrity",
          "error",
          `manifesto.config.ts expects ${capability}`,
          { suggestion: `Install ${packageName} or remove ${capability} from manifesto.config.ts.` },
        ));
      }
    }

    for (const [toolingKey, enabled] of Object.entries(config.tooling)) {
      if (!enabled) {
        continue;
      }
      const definition = CAPABILITY_DEFINITIONS[toolingKey];
      if (!installedPackages[definition.packageName]) {
        checks.push(makeCheck(
          "Composition Integrity",
          "warn",
          `manifesto.config.ts enables ${toolingKey}, but ${definition.packageName} is not installed`,
          { suggestion: `Install ${definition.packageName} or update manifesto.config.ts.` },
        ));
      }
    }
  }

  if (installedPackages["@manifesto-ai/skills"]) {
    const codexSkills = await detectCodexSkillsInstall();
    checks.push(makeCheck(
      "Skills",
      codexSkills.installed ? "pass" : "warn",
      codexSkills.installed
        ? "Codex skill install detected"
        : "@manifesto-ai/skills is installed, but Codex setup was not detected",
      codexSkills.installed
        ? { details: codexSkills.evidence }
        : { suggestion: "Run: pnpm exec manifesto-skills install-codex" },
    ));
  }

  const compatibilityChecks = buildCompatibilityChecks(installedPackages);
  checks.push(...compatibilityChecks);

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

function collectExpectedPackages(config) {
  const expected = new Set();
  if (!config) {
    return expected;
  }

  expected.add("@manifesto-ai/sdk");
  expected.add("@manifesto-ai/compiler");

  for (const capability of config.capabilities) {
    const definition = Object.values(CAPABILITY_DEFINITIONS)
      .find((entry) => entry.configCapability === capability);
    if (definition) {
      expected.add(definition.packageName);
    }
  }

  for (const toolingKey of Object.keys(config.tooling)) {
    if (config.tooling[toolingKey]) {
      expected.add(CAPABILITY_DEFINITIONS[toolingKey].packageName);
    }
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

function satisfiesRange(version, range) {
  const normalizedVersion = version.split("-")[0];
  const normalizedRange = range.trim();

  if (normalizedRange.startsWith(">=")) {
    return compareVersions(normalizedVersion, normalizedRange.slice(2)) >= 0;
  }
  if (normalizedRange.startsWith("<=")) {
    return compareVersions(normalizedVersion, normalizedRange.slice(2)) <= 0;
  }
  if (normalizedRange.startsWith(">")) {
    return compareVersions(normalizedVersion, normalizedRange.slice(1)) > 0;
  }
  if (normalizedRange.startsWith("<")) {
    return compareVersions(normalizedVersion, normalizedRange.slice(1)) < 0;
  }
  if (normalizedRange.startsWith("^")) {
    const target = normalizedRange.slice(1);
    const [major] = normalizeVersion(target);
    const [currentMajor] = normalizeVersion(normalizedVersion);
    return currentMajor === major && compareVersions(normalizedVersion, target) >= 0;
  }
  if (normalizedRange.startsWith("~")) {
    const target = normalizedRange.slice(1);
    const [major, minor] = normalizeVersion(target);
    const [currentMajor, currentMinor] = normalizeVersion(normalizedVersion);
    return currentMajor === major
      && currentMinor === minor
      && compareVersions(normalizedVersion, target) >= 0;
  }

  return compareVersions(normalizedVersion, normalizedRange) === 0;
}

function compareVersions(left, right) {
  const leftParts = normalizeVersion(left);
  const rightParts = normalizeVersion(right);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = leftParts[index] ?? 0;
    const rightPart = rightParts[index] ?? 0;
    if (leftPart > rightPart) {
      return 1;
    }
    if (leftPart < rightPart) {
      return -1;
    }
  }
  return 0;
}

function normalizeVersion(value) {
  return value
    .split(".")
    .map((part) => Number.parseInt(part, 10))
    .map((part) => (Number.isFinite(part) ? part : 0));
}

function summarizeChecks(checks) {
  const passed = checks.filter((check) => check.status === "pass").length;
  const warnings = checks.filter((check) => check.status === "warn").length;
  const errors = checks.filter((check) => check.status === "error").length;
  return { passed, warnings, errors };
}

function makeCheck(category, status, label, extras = {}) {
  return {
    category,
    status,
    label,
    details: extras.details ?? null,
    suggestion: extras.suggestion ?? null,
  };
}
