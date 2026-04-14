import { readFile, readdir } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";
import process from "node:process";

import { compile, formatDiagnostics } from "@manifesto-ai/compiler";
import {
  getManifestBindingCoverage,
  partitionRegistryPeers,
  validateDomainFiles,
  validateRegistryIndex,
  validateRegistryItem,
} from "@manifesto-ai/mcp/validation";

import { CliError } from "./errors.js";
import { promptInput } from "./prompts.js";
import {
  buildInstallCommand,
  detectPackageManager,
  runInstallCommand,
} from "./package-manager.js";
import {
  fileExists,
  readJsonFile,
  readPackageJson,
  writeTextFile,
} from "./project.js";
import {
  DOMAIN_ALLOWED_FILENAMES,
  MANIFESTO_DEFAULT_DOMAIN_VERSION,
  MANIFESTO_DEFAULT_REGISTRY_ALIAS,
  MANIFESTO_DEFAULT_REGISTRY_BUILD_DIR,
  PEER_VERSION_DEFAULTS,
} from "./constants.js";
import {
  readManifestoProjectConfig,
  resolveManifestoProjectPaths,
} from "./domain-config.js";

function getRegistryBaseUrl(url) {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function domainNameToIdentifier(name) {
  const cleaned = name.replace(/[^A-Za-z0-9]+/g, " ").trim();
  if (!cleaned) {
    return "domainRuntime";
  }

  const parts = cleaned.split(/\s+/);
  const [first = "domain", ...rest] = parts;
  const joined = [
    first.toLowerCase(),
    ...rest.map((part) => part[0].toUpperCase() + part.slice(1).toLowerCase()),
  ].join("");

  return /^[A-Za-z_$]/.test(joined) ? joined : `domain${joined[0]?.toUpperCase() ?? ""}${joined.slice(1)}`;
}

function deriveDescription(name, readmeSource) {
  if (typeof readmeSource !== "string" || readmeSource.trim().length === 0) {
    return `${name} domain`;
  }

  const firstLine = readmeSource
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find(Boolean);

  if (!firstLine) {
    return `${name} domain`;
  }

  return firstLine.replace(/^#+\s*/, "").trim() || `${name} domain`;
}

function formatCompilerFailure(sourceId, result, source) {
  const diagnostics = [...result.errors, ...result.warnings];
  const formatted = diagnostics.length > 0
    ? formatDiagnostics(diagnostics, source)
    : "Unknown compiler failure";
  return `Failed to compile ${sourceId}.\n${formatted}`;
}

function compileDomainSource(sourceId, melSource) {
  const result = compile(melSource);
  if (!result.success || !result.schema) {
    throw new CliError(formatCompilerFailure(sourceId, result, melSource));
  }

  return result;
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
    return bucket;
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

function resolveRegistryTarget(projectConfig, specifier) {
  const registries = Object.entries(projectConfig.registries ?? {});
  if (registries.length === 0) {
    throw new CliError("manifesto.json does not define any registries.");
  }

  if (specifier.startsWith("@")) {
    const match = /^@([^/]+)\/(.+)$/u.exec(specifier);
    if (!match) {
      throw new CliError(`Invalid registry specifier "${specifier}". Use @alias/name.`);
    }

    const [, alias, name] = match;
    const registryUrl = projectConfig.registries[alias];
    if (!registryUrl) {
      throw new CliError(`Unknown registry alias "${alias}" in manifesto.json.`);
    }

    return {
      alias,
      name,
      registryUrl,
      itemUrl: `${getRegistryBaseUrl(registryUrl)}/r/${name}.json`,
    };
  }

  const [alias, registryUrl] = registries[0];
  return {
    alias: alias ?? MANIFESTO_DEFAULT_REGISTRY_ALIAS,
    name: specifier,
    registryUrl,
    itemUrl: `${getRegistryBaseUrl(registryUrl)}/r/${specifier}.json`,
  };
}

async function fetchRegistryItem(projectConfig, specifier) {
  const target = resolveRegistryTarget(projectConfig, specifier);
  const response = await fetch(target.itemUrl);

  if (!response.ok) {
    throw new CliError(
      `Failed to fetch registry item "${specifier}" from ${target.itemUrl} (${response.status} ${response.statusText}).`,
    );
  }

  let json;
  try {
    json = await response.json();
  } catch {
    throw new CliError(`Registry item "${specifier}" did not return valid JSON.`);
  }

  const validation = validateRegistryItem(json);
  if (!validation.ok || !validation.value) {
    const details = validation.errors.map((entry) => `${entry.path}: ${entry.message}`).join("\n");
    throw new CliError(`Registry item "${specifier}" failed validation.\n${details}`);
  }

  return {
    ...target,
    item: validation.value,
    warnings: validation.warnings,
  };
}

function createAgentSource({
  domainName,
  agentRelativeDomainPath,
  agentRelativeManifestPath,
  hasManifest,
}) {
  const exportName = domainNameToIdentifier(domainName);
  const manifestLoad = hasManifest
    ? `const manifest = JSON.parse(readFileSync(new URL("${agentRelativeManifestPath}", import.meta.url), "utf-8"));\n\n`
    : "";
  const effectsExpression = hasManifest ? "mcpEffects(manifest)" : "{}";
  const manifestImport = hasManifest
    ? `import { mcpEffects } from "@manifesto-ai/mcp";\n`
    : "";

  return `// Generated by @manifesto-ai/cli — feel free to modify.
import { readFileSync } from "node:fs";
import { createManifesto } from "@manifesto-ai/sdk";
import { withLineage, createInMemoryLineageStore } from "@manifesto-ai/lineage";
${manifestImport}
const mel = readFileSync(new URL("${agentRelativeDomainPath}", import.meta.url), "utf-8");
${manifestLoad}export const ${exportName} = withLineage(
  createManifesto(mel, ${effectsExpression}),
  { store: createInMemoryLineageStore() },
).activate();
`;
}

function formatPeerSpecifier(name, versionRange) {
  return versionRange ? `${name}@${versionRange}` : name;
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

function mergeEnvContent(existingContent, entries) {
  const trimmedExisting = existingContent.trimEnd();
  const lines = trimmedExisting ? trimmedExisting.split(/\r?\n/u) : [];
  const existing = parseEnvFile(existingContent);

  for (const entry of entries) {
    if (Object.prototype.hasOwnProperty.call(existing, entry.key)) {
      continue;
    }

    if (lines.length > 0 && lines.at(-1) !== "") {
      lines.push("");
    }

    lines.push(`# ${entry.description}`);
    lines.push(`${entry.key}=${entry.value ?? ""}`);
    existing[entry.key] = entry.value ?? "";
  }

  return `${lines.join("\n")}${lines.length > 0 ? "\n" : ""}`;
}

async function resolveRequiredEnvEntries(cwd, item) {
  const envSpecs = Object.entries(item.env ?? {}).filter(([, spec]) => spec.required);
  if (envSpecs.length === 0) {
    return [];
  }

  const interactive = process.stdin.isTTY && process.stdout.isTTY;
  const envFilePath = resolve(cwd, ".env");
  const existingContent = await readFile(envFilePath, "utf8").catch(() => "");
  const existingValues = parseEnvFile(existingContent);

  const entries = [];
  for (const [key, spec] of envSpecs) {
    let value = existingValues[key] ?? process.env[key] ?? "";

    if (interactive && !value) {
      value = await promptInput(`${key} (${spec.description})`, value);
    }

    entries.push({
      key,
      description: spec.description,
      value,
    });
  }

  return entries;
}

function buildDomainFileMap(files) {
  return Object.fromEntries(files.map((file) => [file.path, file]));
}

async function buildCompiledDomainFromItem(item) {
  const fileMap = buildDomainFileMap(item.files);
  const melFile = fileMap["domain.mel"];
  if (!melFile) {
    throw new CliError(`Registry item "${item.name}" is missing domain.mel.`);
  }

  const compileResult = compileDomainSource(`registry item ${item.name}`, melFile.content);
  if (compileResult.schema.hash !== item.schemaHash) {
    throw new CliError(
      `Schema hash mismatch for "${item.name}". Expected ${item.schemaHash}, got ${compileResult.schema.hash}.`,
    );
  }

  const manifestFile = fileMap["mcp-manifest.json"];
  const manifest = manifestFile ? JSON.parse(manifestFile.content) : null;
  const coverage = getManifestBindingCoverage(
    collectEffectTypes(compileResult.schema),
    manifest ? { bindings: manifest.bindings } : { bindings: {} },
  );

  return {
    compileResult,
    manifest,
    coverage,
    fileMap,
  };
}

function ensureFileDoesNotExist(filePath, label) {
  return fileExists(filePath).then((exists) => {
    if (exists) {
      throw new CliError(`${label} already exists at ${filePath}.`);
    }
  });
}

export async function buildDomainAddPlan({ cwd, specifier }) {
  const projectRecord = await readManifestoProjectConfig(cwd);
  if (!projectRecord) {
    throw new CliError('manifesto.json is required for domain install flows. Run "manifesto init" or create manifesto.json first.');
  }

  const packageJson = await readPackageJson(cwd);
  const packageManager = detectPackageManager(cwd, packageJson);
  const paths = resolveManifestoProjectPaths(cwd, projectRecord.config);
  const fetched = await fetchRegistryItem(projectRecord.config, specifier);
  const compiled = await buildCompiledDomainFromItem(fetched.item);
  const domainDir = join(paths.domainsDir, fetched.item.name);
  const agentExtension = projectRecord.config.typescript ? "ts" : "js";
  const agentPath = join(paths.agentsDir, `${fetched.item.name}.${agentExtension}`);
  const relativeDomainPath = relative(
    paths.agentsDir,
    join(domainDir, "domain.mel"),
  ).replaceAll("\\", "/");
  const manifestTargetPath = join(domainDir, "mcp-manifest.json");
  const relativeManifestPath = relative(paths.agentsDir, manifestTargetPath).replaceAll("\\", "/");

  await Promise.all([
    ...fetched.item.files.map((file) =>
      ensureFileDoesNotExist(join(domainDir, file.path), `Domain file ${file.path}`),
    ),
    ensureFileDoesNotExist(agentPath, "Agent file"),
  ]);

  const files = fetched.item.files.map((file) => ({
    path: join(domainDir, file.path),
    content: file.content,
    reason: `install ${file.path} from ${fetched.alias} registry`,
  }));

  files.push({
    path: agentPath,
    content: createAgentSource({
      domainName: fetched.item.name,
      agentRelativeDomainPath: relativeDomainPath,
      agentRelativeManifestPath: relativeManifestPath,
      hasManifest: Boolean(compiled.manifest),
    }),
    reason: "generate lineage-ready composition file",
  });

  const peerPartition = partitionRegistryPeers(fetched.item.peers);
  const warnings = [
    ...fetched.warnings.map((entry) => `${entry.path}: ${entry.message}`),
  ];
  if (compiled.coverage.missing.length > 0) {
    warnings.push(
      `Missing MCP bindings for effects: ${compiled.coverage.missing.join(", ")}`,
    );
  }

  return {
    kind: "add",
    cwd,
    packageManager,
    domainName: fetched.item.name,
    registryAlias: fetched.alias,
    registryUrl: fetched.registryUrl,
    files,
    installGroups: {
      dependencies: Object.entries(peerPartition.autoInstall).map(([name, range]) => formatPeerSpecifier(name, range)),
      devDependencies: [],
    },
    manualPeers: peerPartition.manualInstall,
    warnings,
    notes: [
      `Registry item: ${fetched.itemUrl}`,
      `Schema hash: ${fetched.item.schemaHash}`,
    ],
    env: fetched.item.env ?? {},
  };
}

export async function applyDomainAddPlan(plan) {
  for (const file of plan.files) {
    await writeTextFile(file.path, file.content);
  }

  const envEntries = await resolveRequiredEnvEntries(plan.cwd, { env: plan.env });
  if (envEntries.length > 0) {
    const envPath = join(plan.cwd, ".env");
    const existingContent = await readFile(envPath, "utf8").catch(() => "");
    const nextContent = mergeEnvContent(existingContent, envEntries);
    await writeTextFile(envPath, nextContent);
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
}

export async function buildDomainDiffPlan({ cwd, specifier }) {
  const projectRecord = await readManifestoProjectConfig(cwd);
  if (!projectRecord) {
    throw new CliError('manifesto.json is required for domain diff flows. Run "manifesto init" or create manifesto.json first.');
  }

  const paths = resolveManifestoProjectPaths(cwd, projectRecord.config);
  const fetched = await fetchRegistryItem(projectRecord.config, specifier);
  const compiled = await buildCompiledDomainFromItem(fetched.item);
  const domainDir = join(paths.domainsDir, fetched.item.name);

  if (!(await fileExists(join(domainDir, "domain.mel")))) {
    throw new CliError(`Local domain "${fetched.item.name}" is not installed under ${domainDir}.`);
  }

  const files = [];
  for (const file of fetched.item.files) {
    const targetPath = join(domainDir, file.path);
    const localContent = await readFile(targetPath, "utf8").catch(() => null);

    if (localContent !== file.content) {
      files.push({
        path: targetPath,
        content: file.content,
        reason: `update ${file.path} from ${fetched.alias} registry`,
      });
    }
  }

  const warnings = [
    ...fetched.warnings.map((entry) => `${entry.path}: ${entry.message}`),
  ];
  if (compiled.coverage.missing.length > 0) {
    warnings.push(
      `Missing MCP bindings for effects: ${compiled.coverage.missing.join(", ")}`,
    );
  }

  return {
    kind: "diff",
    cwd,
    domainName: fetched.item.name,
    registryAlias: fetched.alias,
    registryUrl: fetched.registryUrl,
    files,
    warnings,
    notes: files.length === 0
      ? [`${fetched.item.name} is already up to date.`]
      : [`${files.length} file(s) will be updated. Agent file is left untouched.`],
  };
}

export async function applyDomainDiffPlan(plan) {
  for (const file of plan.files) {
    await writeTextFile(file.path, file.content);
  }
}

async function readDomainDirectory(domainDir) {
  const entries = await readdir(domainDir, { withFileTypes: true });
  const filenames = entries.filter((entry) => entry.isFile()).map((entry) => entry.name).sort();
  const fileValidation = validateDomainFiles(filenames);
  if (!fileValidation.ok) {
    const details = fileValidation.errors.map((entry) => `${entry.path}: ${entry.message}`).join("\n");
    throw new CliError(`Invalid domain contents in ${domainDir}.\n${details}`);
  }

  const files = {};
  for (const filename of filenames) {
    if (!DOMAIN_ALLOWED_FILENAMES.includes(filename)) {
      continue;
    }

    files[filename] = await readFile(join(domainDir, filename), "utf8");
  }

  return files;
}

function createRegistryItem({ name, files }) {
  const compileResult = compileDomainSource(name, files["domain.mel"]);
  const manifest = files["mcp-manifest.json"] ? JSON.parse(files["mcp-manifest.json"]) : null;
  const coverage = getManifestBindingCoverage(
    collectEffectTypes(compileResult.schema),
    manifest ? { bindings: manifest.bindings } : { bindings: {} },
  );
  const peers = {
    "@manifesto-ai/sdk": PEER_VERSION_DEFAULTS["@manifesto-ai/sdk"],
    "@manifesto-ai/lineage": PEER_VERSION_DEFAULTS["@manifesto-ai/lineage"],
  };

  if (manifest) {
    peers["@manifesto-ai/mcp"] = PEER_VERSION_DEFAULTS["@manifesto-ai/mcp"];
  }

  const item = {
    name,
    version: MANIFESTO_DEFAULT_DOMAIN_VERSION,
    description: deriveDescription(name, files["README.md"]),
    schemaHash: compileResult.schema.hash,
    files: DOMAIN_ALLOWED_FILENAMES
      .filter((filename) => typeof files[filename] === "string")
      .map((filename) => ({
        path: filename,
        type:
          filename === "domain.mel"
            ? "registry:mel"
            : filename === "mcp-manifest.json"
              ? "registry:manifest"
              : "registry:readme",
        content: files[filename],
      })),
    env: manifest?.env,
    peers,
  };

  const validation = validateRegistryItem(item);
  if (!validation.ok || !validation.value) {
    const details = validation.errors.map((entry) => `${entry.path}: ${entry.message}`).join("\n");
    throw new CliError(`Generated registry item "${name}" failed validation.\n${details}`);
  }

  return {
    item: validation.value,
    warnings: [
      ...compileResult.warnings.map((warning) => warning.message),
      ...validation.warnings.map((warning) => `${warning.path}: ${warning.message}`),
      ...(coverage.missing.length > 0
        ? [`Missing MCP bindings for effects: ${coverage.missing.join(", ")}`]
        : []),
    ],
  };
}

export async function buildRegistryBuildPlan({ cwd, domainName, outDir }) {
  const projectRecord = await readManifestoProjectConfig(cwd);
  if (!projectRecord) {
    throw new CliError('manifesto.json is required for registry build. Run "manifesto init" or create manifesto.json first.');
  }

  const paths = resolveManifestoProjectPaths(cwd, projectRecord.config);
  const domains = domainName
    ? [domainName]
    : (await readdir(paths.domainsDir, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

  if (domains.length === 0) {
    throw new CliError(`No domains found under ${paths.domainsDir}.`);
  }

  const items = [];
  const files = [];
  const warnings = [];
  const outputRoot = resolve(cwd, outDir || MANIFESTO_DEFAULT_REGISTRY_BUILD_DIR);

  for (const name of domains) {
    const domainDir = join(paths.domainsDir, name);
    const domainFiles = await readDomainDirectory(domainDir);
    const { item, warnings: domainWarnings } = createRegistryItem({
      name,
      files: domainFiles,
    });

    items.push({
      name: item.name,
      version: item.version,
      description: item.description,
    });
    warnings.push(...domainWarnings.map((warning) => `${name}: ${warning}`));
    files.push({
      path: join(outputRoot, "r", `${name}.json`),
      content: `${JSON.stringify(item, null, 2)}\n`,
      reason: `write registry item for ${name}`,
    });
  }

  const index = {
    name: basename(outputRoot),
    items,
  };
  const indexValidation = validateRegistryIndex(index);
  if (!indexValidation.ok || !indexValidation.value) {
    const details = indexValidation.errors.map((entry) => `${entry.path}: ${entry.message}`).join("\n");
    throw new CliError(`Generated registry index failed validation.\n${details}`);
  }

  files.push({
    path: join(outputRoot, "registry.json"),
    content: `${JSON.stringify(indexValidation.value, null, 2)}\n`,
    reason: "write registry index",
  });

  return {
    kind: "registry-build",
    cwd,
    outDir: outputRoot,
    files,
    warnings,
    notes: [`${items.length} domain item(s) will be written.`],
  };
}

export async function applyRegistryBuildPlan(plan) {
  for (const file of plan.files) {
    await writeTextFile(file.path, file.content);
  }
}
