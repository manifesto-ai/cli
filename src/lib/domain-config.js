import { join, resolve } from "node:path";

import {
  MANIFESTO_DEFAULT_AGENTS_DIR,
  MANIFESTO_DEFAULT_DOMAINS_DIR,
  MANIFESTO_DEFAULT_REGISTRIES,
  MANIFESTO_DEFAULT_TYPESCRIPT,
  MANIFESTO_JSON_FILENAME,
  MANIFESTO_JSON_SCHEMA_URL,
} from "./constants.js";
import { fileExists, readJsonFile } from "./project.js";

function normalizeRegistries(registries) {
  if (!registries || typeof registries !== "object" || Array.isArray(registries)) {
    return { ...MANIFESTO_DEFAULT_REGISTRIES };
  }

  const entries = Object.entries(registries).filter(
    ([alias, value]) => typeof alias === "string" && alias.trim().length > 0 && typeof value === "string" && value.trim().length > 0,
  );

  if (entries.length === 0) {
    return { ...MANIFESTO_DEFAULT_REGISTRIES };
  }

  return Object.fromEntries(entries);
}

export function createManifestoProjectConfig(partial = {}) {
  return {
    $schema: MANIFESTO_JSON_SCHEMA_URL,
    domains:
      typeof partial.domains === "string" && partial.domains.trim().length > 0
        ? partial.domains
        : MANIFESTO_DEFAULT_DOMAINS_DIR,
    agents:
      typeof partial.agents === "string" && partial.agents.trim().length > 0
        ? partial.agents
        : MANIFESTO_DEFAULT_AGENTS_DIR,
    typescript:
      typeof partial.typescript === "boolean"
        ? partial.typescript
        : MANIFESTO_DEFAULT_TYPESCRIPT,
    registries: normalizeRegistries(partial.registries),
  };
}

export async function readManifestoProjectConfig(cwd) {
  const filePath = join(cwd, MANIFESTO_JSON_FILENAME);
  if (!(await fileExists(filePath))) {
    return null;
  }

  const parsed = await readJsonFile(filePath);
  if (!parsed) {
    return null;
  }

  return {
    path: filePath,
    config: createManifestoProjectConfig(parsed),
  };
}

export function serializeManifestoProjectConfig(config) {
  return `${JSON.stringify(createManifestoProjectConfig(config), null, 2)}\n`;
}

export function resolveManifestoProjectPaths(cwd, config) {
  const normalized = createManifestoProjectConfig(config);
  return {
    configPath: join(cwd, MANIFESTO_JSON_FILENAME),
    domainsDir: resolve(cwd, normalized.domains),
    agentsDir: resolve(cwd, normalized.agents),
  };
}
