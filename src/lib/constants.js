export const PRESETS = ["base", "lineage", "gov"];
export const PRESET_ALIASES = {
  governed: "gov",
};
export const BUNDLERS = [
  "vite",
  "webpack",
  "rollup",
  "esbuild",
  "rspack",
  "node-loader",
  "unknown",
];

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

export const CAPABILITY_DEFINITIONS = {
  lineage: {
    packageName: "@manifesto-ai/lineage",
    dependencyType: "dependencies",
    configCapability: "lineage",
    label: "lineage",
  },
  governance: {
    packageName: "@manifesto-ai/governance",
    dependencyType: "dependencies",
    configCapability: "governance",
    requires: ["lineage"],
    label: "governance",
  },
  codegen: {
    packageName: "@manifesto-ai/codegen",
    dependencyType: "devDependencies",
    toolingKey: "codegen",
    label: "codegen",
  },
  skills: {
    packageName: "@manifesto-ai/skills",
    dependencyType: "devDependencies",
    toolingKey: "skills",
    label: "skills",
  },
};

export const TOOLING_KEYS = ["codegen", "skills"];
export const BASE_DEPENDENCIES = ["@manifesto-ai/sdk"];
export const BASE_DEV_DEPENDENCIES = ["@manifesto-ai/compiler"];
export const DOCTOR_PACKAGE_ORDER = [
  "@manifesto-ai/sdk",
  "@manifesto-ai/compiler",
  "@manifesto-ai/lineage",
  "@manifesto-ai/governance",
  "@manifesto-ai/codegen",
  "@manifesto-ai/skills",
];

export const MANIFESTO_CONFIG_FILENAMES = [
  "manifesto.config.ts",
  "manifesto.config.js",
  "manifesto.config.mjs",
  "manifesto.config.cjs",
];

export const SKILLS_CODEX_MARKER = ".manifesto-codex-install.json";
export const SKILLS_CODEX_DIR_NAME = "manifesto";

export function normalizePreset(value) {
  if (!value) {
    return value;
  }

  return PRESET_ALIASES[value] ?? value;
}

export function presetToCapabilities(preset) {
  switch (normalizePreset(preset)) {
    case "lineage":
      return ["lineage"];
    case "gov":
      return ["lineage", "governance"];
    default:
      return [];
  }
}

export function inferPresetFromCapabilities(capabilities = []) {
  if (capabilities.includes("governance")) {
    return "gov";
  }

  if (capabilities.includes("lineage")) {
    return "lineage";
  }

  return "base";
}
