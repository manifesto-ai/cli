import { existsSync, readFileSync } from "node:fs";
import {
  mkdir,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import {
  BUNDLER_CONFIG_CANDIDATES,
  COMPILER_BUNDLER_IMPORTS,
  SKILLS_CODEX_DIR_NAME,
  SKILLS_CODEX_MARKER,
} from "./constants.js";
import { detectPackageManager as detectPackageManagerImpl } from "./package-manager.js";

const SEARCH_FILE_EXTENSIONS = new Set([
  ".js",
  ".mjs",
  ".cjs",
  ".ts",
  ".mts",
  ".cts",
  ".tsx",
  ".jsx",
  ".json",
  ".md",
]);

const IGNORED_DIRECTORIES = new Set([
  ".git",
  "coverage",
  "dist",
  "build",
  "node_modules",
  ".next",
  ".turbo",
]);

export async function fileExists(filePath) {
  return existsSync(filePath);
}

export async function readJsonFile(filePath) {
  if (!(await fileExists(filePath))) {
    return null;
  }

  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

export async function writeTextFile(filePath, content) {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf8");
}

export async function readPackageJson(cwd) {
  return readJsonFile(join(cwd, "package.json"));
}

export function detectPackageManager(cwd) {
  return detectPackageManagerImpl(cwd);
}

export function detectBundler(cwd) {
  for (const [bundler, candidates] of Object.entries(BUNDLER_CONFIG_CANDIDATES)) {
    for (const filename of candidates) {
      if (existsSync(join(cwd, filename))) {
        return { bundler, evidence: filename };
      }
    }
  }

  const packageJson = tryReadJsonSync(join(cwd, "package.json"));
  const scripts = packageJson?.scripts ?? {};
  const scriptValues = Object.values(scripts).join(" ");

  if (/\bvite\b/.test(scriptValues)) {
    return { bundler: "vite", evidence: "package.json scripts" };
  }
  if (/\bwebpack\b|\bnext\b/.test(scriptValues)) {
    return { bundler: "webpack", evidence: "package.json scripts" };
  }
  if (/\brollup\b/.test(scriptValues)) {
    return { bundler: "rollup", evidence: "package.json scripts" };
  }
  if (/\brspack\b/.test(scriptValues)) {
    return { bundler: "rspack", evidence: "package.json scripts" };
  }
  if (/\besbuild\b/.test(scriptValues)) {
    return { bundler: "esbuild", evidence: "package.json scripts" };
  }
  if (packageJson?.type === "module") {
    return { bundler: "node-loader", evidence: 'package.json "type": "module"' };
  }

  return { bundler: "unknown", evidence: null };
}

export function findBundlerConfigPath(cwd, bundler) {
  const candidates = BUNDLER_CONFIG_CANDIDATES[bundler] ?? [];
  for (const filename of candidates) {
    const filePath = join(cwd, filename);
    if (existsSync(filePath)) {
      return filePath;
    }
  }

  return null;
}

export async function hasMelPluginConfigured(cwd, bundler) {
  if (bundler === "node-loader") {
    const packageJson = await readPackageJson(cwd);
    const scripts = Object.values(packageJson?.scripts ?? {}).join(" ");
    return scripts.includes(COMPILER_BUNDLER_IMPORTS["node-loader"]);
  }

  const configPath = findBundlerConfigPath(cwd, bundler);
  if (!configPath) {
    return false;
  }

  const source = await readFile(configPath, "utf8");
  const importTarget = COMPILER_BUNDLER_IMPORTS[bundler];
  return source.includes("melPlugin(") || source.includes(importTarget);
}

export async function readInstalledPackageJson(cwd, packageName) {
  const packagePath = join(cwd, "node_modules", ...packageName.split("/"), "package.json");
  return readJsonFile(packagePath);
}

export async function detectCodexSkillsInstall() {
  const codexHome = resolve(process.env.CODEX_HOME ?? join(homedir(), ".codex"));
  const skillDir = join(codexHome, "skills", SKILLS_CODEX_DIR_NAME);
  const markerPath = join(skillDir, SKILLS_CODEX_MARKER);
  if (existsSync(markerPath)) {
    return { installed: true, evidence: relative(codexHome, markerPath) };
  }

  const packageJsonPath = join(skillDir, "package.json");
  const packageJson = await readJsonFile(packageJsonPath);
  if (packageJson?.name === "@manifesto-ai/skills") {
    return { installed: true, evidence: relative(codexHome, packageJsonPath) };
  }

  return { installed: false, evidence: null };
}

export async function scanProjectForSignal(cwd, patterns, rootNames = ["src", "."]) {
  for (const rootName of rootNames) {
    const rootPath = resolve(cwd, rootName);
    if (!existsSync(rootPath)) {
      continue;
    }

    const match = await walkAndMatch(rootPath, patterns, cwd);
    if (match) {
      return match;
    }
  }

  return null;
}

function tryReadJsonSync(filePath) {
  if (!existsSync(filePath)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

async function walkAndMatch(currentPath, patterns, cwd) {
  const stats = await readdir(currentPath, { withFileTypes: true });

  for (const entry of stats) {
    const filePath = join(currentPath, entry.name);
    if (entry.isDirectory()) {
      if (IGNORED_DIRECTORIES.has(entry.name)) {
        continue;
      }
      const nested = await walkAndMatch(filePath, patterns, cwd);
      if (nested) {
        return nested;
      }
      continue;
    }

    if (!hasSupportedExtension(entry.name)) {
      continue;
    }

    const source = await readFile(filePath, "utf8");
    for (const pattern of patterns) {
      if (pattern.test(source)) {
        return relative(cwd, filePath);
      }
    }
  }

  return null;
}

function hasSupportedExtension(filename) {
  const extension = filename.includes(".")
    ? `.${filename.split(".").pop()}`
    : "";
  return SEARCH_FILE_EXTENSIONS.has(extension);
}
