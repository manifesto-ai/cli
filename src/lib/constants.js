export const RUNTIMES = ["base", "lineage", "gov"];
export const INTEGRATION_MODES = [
  "none",
  "vite",
  "webpack",
  "rollup",
  "esbuild",
  "rspack",
  "node-loader",
];
export const DETECTABLE_BUNDLERS = [...INTEGRATION_MODES, "unknown"];
export const CODEGEN_MODES = ["off", "install", "wire"];
export const SKILLS_MODES = ["off", "install", "codex"];
export const SAMPLE_MODES = ["none", "counter"];

export const LEGACY_PRESETS = ["base", "lineage", "gov", "governed"];
export const LEGACY_PRESET_ALIASES = {
  governed: "gov",
};

export const LEGACY_TOOLING_KEYS = ["codegen", "skills"];

export const BUNDLER_CONFIG_CANDIDATES = {
  vite: [
    "vite.config.ts",
    "vite.config.mts",
    "vite.config.js",
    "vite.config.mjs",
    "vite.config.cts",
    "vite.config.cjs",
  ],
  webpack: [
    "webpack.config.ts",
    "webpack.config.mts",
    "webpack.config.js",
    "webpack.config.mjs",
    "webpack.config.cts",
    "webpack.config.cjs",
    "next.config.ts",
    "next.config.mts",
    "next.config.js",
    "next.config.mjs",
    "next.config.cts",
    "next.config.cjs",
  ],
  rollup: [
    "rollup.config.ts",
    "rollup.config.mts",
    "rollup.config.js",
    "rollup.config.mjs",
    "rollup.config.cts",
    "rollup.config.cjs",
  ],
  esbuild: [
    "esbuild.config.ts",
    "esbuild.config.mts",
    "esbuild.config.js",
    "esbuild.config.mjs",
    "esbuild.config.cts",
    "esbuild.config.cjs",
  ],
  rspack: [
    "rspack.config.ts",
    "rspack.config.mts",
    "rspack.config.js",
    "rspack.config.mjs",
    "rspack.config.cts",
    "rspack.config.cjs",
  ],
};

export const COMPILER_BUNDLER_IMPORTS = {
  vite: "@manifesto-ai/compiler/vite",
  webpack: "@manifesto-ai/compiler/webpack",
  rollup: "@manifesto-ai/compiler/rollup",
  esbuild: "@manifesto-ai/compiler/esbuild",
  rspack: "@manifesto-ai/compiler/rspack",
  "node-loader": "@manifesto-ai/compiler/node-loader",
};

export const MANIFESTO_CONFIG_FILENAMES = [
  "manifesto.config.ts",
  "manifesto.config.js",
  "manifesto.config.mjs",
  "manifesto.config.cjs",
];

export const SKILLS_CODEX_MARKER = ".manifesto-codex-install.json";
export const SKILLS_CODEX_DIR_NAME = "manifesto";

export const PACKAGE_DEFINITIONS = {
  sdk: {
    packageName: "@manifesto-ai/sdk",
    dependencyType: "dependencies",
  },
  compiler: {
    packageName: "@manifesto-ai/compiler",
    dependencyType: "devDependencies",
  },
  lineage: {
    packageName: "@manifesto-ai/lineage",
    dependencyType: "dependencies",
  },
  governance: {
    packageName: "@manifesto-ai/governance",
    dependencyType: "dependencies",
  },
  codegen: {
    packageName: "@manifesto-ai/codegen",
    dependencyType: "devDependencies",
  },
  skills: {
    packageName: "@manifesto-ai/skills",
    dependencyType: "devDependencies",
  },
};

export const DOCTOR_PACKAGE_ORDER = [
  PACKAGE_DEFINITIONS.sdk.packageName,
  PACKAGE_DEFINITIONS.compiler.packageName,
  PACKAGE_DEFINITIONS.lineage.packageName,
  PACKAGE_DEFINITIONS.governance.packageName,
  PACKAGE_DEFINITIONS.codegen.packageName,
  PACKAGE_DEFINITIONS.skills.packageName,
];

export function normalizeLegacyPreset(value) {
  if (!value) {
    return value;
  }

  return LEGACY_PRESET_ALIASES[value] ?? value;
}

export function runtimeToPackages(runtime) {
  switch (runtime) {
    case "gov":
      return ["sdk", "compiler", "lineage", "governance"];
    case "lineage":
      return ["sdk", "compiler", "lineage"];
    default:
      return ["sdk", "compiler"];
  }
}

export function runtimeToLegacyCapabilities(runtime) {
  switch (runtime) {
    case "gov":
      return ["governance", "lineage"];
    case "lineage":
      return ["lineage"];
    default:
      return [];
  }
}

export function legacyCapabilitiesToRuntime(capabilities = []) {
  if (capabilities.includes("governance")) {
    return "gov";
  }

  if (capabilities.includes("lineage")) {
    return "lineage";
  }

  return "base";
}

export function normalizeRuntime(value) {
  return normalizeEnumValue(value, RUNTIMES, "base");
}

export function normalizeIntegrationMode(value) {
  return normalizeEnumValue(value, INTEGRATION_MODES, "none");
}

export function normalizeCodegenMode(value) {
  return normalizeEnumValue(value, CODEGEN_MODES, "off");
}

export function normalizeSkillsMode(value) {
  return normalizeEnumValue(value, SKILLS_MODES, "off");
}

export function normalizeSampleMode(value) {
  return normalizeEnumValue(value, SAMPLE_MODES, "none");
}

function normalizeEnumValue(value, allowed, fallback) {
  if (!value) {
    return fallback;
  }

  return allowed.includes(value) ? value : fallback;
}
