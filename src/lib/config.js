import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { join } from "node:path";
import {
  LEGACY_TOOLING_KEYS,
  MANIFESTO_CONFIG_FILENAMES,
  legacyCapabilitiesToRuntime,
  normalizeCodegenMode,
  normalizeIntegrationMode,
  normalizeLegacyPreset,
  normalizeRuntime,
  normalizeSampleMode,
  normalizeSkillsMode,
} from "./constants.js";
import { fileExists } from "./project.js";

export async function readManifestoConfig(cwd) {
  for (const filename of MANIFESTO_CONFIG_FILENAMES) {
    const filePath = join(cwd, filename);
    if (!(await fileExists(filePath))) {
      continue;
    }

    const source = await readFile(filePath, "utf8");
    const parsed = parseManifestoConfigSource(source);
    if (parsed) {
      return { path: filePath, config: normalizeManifestoConfig(parsed) };
    }
  }

  return null;
}

export function createManifestoConfig(partial = {}) {
  return normalizeManifestoConfig(partial);
}

export function mergeManifestoConfig(existingConfig, partial = {}) {
  const existing = normalizeManifestoConfig(existingConfig);
  return normalizeManifestoConfig({
    runtime: partial.runtime ?? existing.runtime,
    integration: {
      mode: partial.integration?.mode ?? existing.integration.mode,
    },
    tooling: {
      codegen: partial.tooling?.codegen ?? existing.tooling.codegen,
      skills: partial.tooling?.skills ?? existing.tooling.skills,
    },
    sample: partial.sample ?? existing.sample,
  });
}

export function serializeManifestoConfig(config) {
  const normalized = normalizeManifestoConfig(config);

  return `export default {
  runtime: "${normalized.runtime}",
  integration: {
    mode: "${normalized.integration.mode}",
  },
  tooling: {
    codegen: "${normalized.tooling.codegen}",
    skills: "${normalized.tooling.skills}",
  },
  sample: "${normalized.sample}",
};
`;
}

export function normalizeManifestoConfig(config) {
  if (looksLikeLegacyConfig(config)) {
    return normalizeLegacyConfig(config);
  }

  return {
    runtime: normalizeRuntime(config?.runtime),
    integration: {
      mode: normalizeIntegrationMode(config?.integration?.mode),
    },
    tooling: {
      codegen: normalizeCodegenMode(config?.tooling?.codegen),
      skills: normalizeSkillsMode(config?.tooling?.skills),
    },
    sample: normalizeSampleMode(config?.sample),
  };
}

function parseManifestoConfigSource(source) {
  const exportMatch = source.match(/export\s+default\s+([\s\S]+?)\s*;?\s*$/);
  const commonJsMatch = source.match(/module\.exports\s*=\s*([\s\S]+?)\s*;?\s*$/);
  const literal = exportMatch?.[1] ?? commonJsMatch?.[1];

  if (!literal) {
    return null;
  }

  try {
    return vm.runInNewContext(`(${literal})`, {}, { timeout: 100 });
  } catch {
    return null;
  }
}

function looksLikeLegacyConfig(config) {
  return Boolean(
    config
    && (
      Array.isArray(config.capabilities)
      || typeof config.bundler === "string"
      || hasLegacyBooleanTooling(config.tooling)
      || normalizeLegacyPreset(config.preset)
    ),
  );
}

function hasLegacyBooleanTooling(tooling) {
  return LEGACY_TOOLING_KEYS.some((key) => typeof tooling?.[key] === "boolean");
}

function normalizeLegacyConfig(config) {
  const runtime = normalizeLegacyPreset(config?.preset)
    ? normalizeRuntime(normalizeLegacyPreset(config.preset))
    : legacyCapabilitiesToRuntime(Array.isArray(config?.capabilities) ? config.capabilities : []);
  const bundler = normalizeIntegrationMode(config?.bundler);
  const codegenEnabled = config?.tooling?.codegen === true;
  const skillsEnabled = config?.tooling?.skills === true;

  return {
    runtime,
    integration: {
      mode: bundler,
    },
    tooling: {
      codegen: codegenEnabled ? "wire" : "off",
      skills: skillsEnabled ? "install" : "off",
    },
    sample: "none",
  };
}
