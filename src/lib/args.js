import { parseArgs } from "node:util";
import { resolve } from "node:path";
import process from "node:process";
import { CliError } from "./errors.js";
import { BUNDLERS, PRESETS, TOOLING_KEYS } from "./constants.js";

export function parseInitArgs(argv) {
  const { values } = parseArgs({
    args: argv,
    allowPositionals: false,
    options: {
      preset: { type: "string" },
      bundler: { type: "string" },
      tooling: { type: "string" },
      "no-sample": { type: "boolean" },
      "dry-run": { type: "boolean" },
      "non-interactive": { type: "boolean" },
      cwd: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });

  if (values.help) {
    console.log(`manifesto init

Usage:
  manifesto init [options]

Options:
  --preset <base|governed>
  --bundler <vite|webpack|rollup|esbuild|rspack|node-loader>
  --tooling <comma-separated values>
  --no-sample
  --dry-run
  --non-interactive
  --cwd <path>
`);
    process.exit(0);
  }

  const preset = values.preset;
  if (preset && !PRESETS.includes(preset)) {
    throw new CliError(`Unsupported preset "${preset}".`);
  }

  const bundler = values.bundler;
  if (bundler && !BUNDLERS.includes(bundler)) {
    throw new CliError(`Unsupported bundler "${bundler}".`);
  }

  const tooling = parseTooling(values.tooling);

  return {
    preset,
    bundler,
    tooling,
    sample: !values["no-sample"],
    dryRun: Boolean(values["dry-run"]),
    nonInteractive: Boolean(values["non-interactive"]),
    cwd: values.cwd ? resolveCwd(values.cwd) : process.cwd(),
  };
}

export function parseAddArgs(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      "auto-deps": { type: "boolean" },
      "dry-run": { type: "boolean" },
      cwd: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });

  if (values.help) {
    console.log(`manifesto add

Usage:
  manifesto add <lineage|governance|codegen|skills> [options]

Options:
  --auto-deps
  --dry-run
  --cwd <path>
`);
    process.exit(0);
  }

  return {
    capability: positionals[0],
    autoDeps: Boolean(values["auto-deps"]),
    dryRun: Boolean(values["dry-run"]),
    cwd: values.cwd ? resolveCwd(values.cwd) : process.cwd(),
  };
}

export function parseDoctorArgs(argv) {
  const { values } = parseArgs({
    args: argv,
    allowPositionals: false,
    options: {
      json: { type: "boolean" },
      strict: { type: "boolean" },
      cwd: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });

  if (values.help) {
    console.log(`manifesto doctor

Usage:
  manifesto doctor [options]

Options:
  --json
  --strict
  --cwd <path>
`);
    process.exit(0);
  }

  return {
    json: Boolean(values.json),
    strict: Boolean(values.strict),
    cwd: values.cwd ? resolveCwd(values.cwd) : process.cwd(),
  };
}

function parseTooling(rawValue) {
  if (!rawValue) {
    return [];
  }

  const tooling = rawValue
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  for (const entry of tooling) {
    if (!TOOLING_KEYS.includes(entry)) {
      throw new CliError(`Unsupported tooling "${entry}".`);
    }
  }

  return tooling;
}

function resolveCwd(value) {
  return resolve(process.cwd(), value);
}
