import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { join } from "node:path";
import {
  MANIFESTO_CONFIG_FILENAMES,
  normalizePreset,
  presetToCapabilities,
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

export function createManifestoConfig({ bundler, preset, tooling }) {
  const normalizedPreset = normalizePreset(preset);
  return normalizeManifestoConfig({
    bundler,
    capabilities: presetToCapabilities(normalizedPreset),
    tooling: {
      codegen: tooling.includes("codegen"),
      skills: tooling.includes("skills"),
    },
  });
}

export function mergeManifestoConfig(existingConfig, partial) {
  return normalizeManifestoConfig({
    bundler: partial.bundler ?? existingConfig?.bundler,
    capabilities: partial.capabilities ?? existingConfig?.capabilities,
    tooling: {
      ...existingConfig?.tooling,
      ...partial.tooling,
    },
  });
}

export function serializeManifestoConfig(config) {
  const normalized = normalizeManifestoConfig(config);
  const capabilities = normalized.capabilities.map((value) => `"${value}"`).join(", ");

  return `export default {
  bundler: "${normalized.bundler}",
  capabilities: [${capabilities}],
  tooling: {
    codegen: ${normalized.tooling.codegen},
    skills: ${normalized.tooling.skills},
  },
};
`;
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

function normalizeManifestoConfig(config) {
  const capabilities = Array.from(new Set(config?.capabilities ?? []))
    .filter(Boolean)
    .sort();

  return {
    bundler: config?.bundler ?? "vite",
    capabilities,
    tooling: {
      codegen: Boolean(config?.tooling?.codegen),
      skills: Boolean(config?.tooling?.skills),
    },
  };
}
