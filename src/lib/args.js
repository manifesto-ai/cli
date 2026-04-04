import { parseArgs } from "node:util";
import { resolve } from "node:path";
import process from "node:process";
import { CliError } from "./errors.js";
import {
  CODEGEN_MODES,
  INTEGRATION_MODES,
  RUNTIMES,
  SAMPLE_MODES,
  SKILLS_MODES,
} from "./constants.js";

export function parseInitArgs(argv) {
  const { values } = parseArgs({
    args: argv,
    allowPositionals: false,
    options: {
      runtime: { type: "string" },
      integration: { type: "string" },
      codegen: { type: "string" },
      skills: { type: "string" },
      sample: { type: "string" },
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
  --runtime <base|lineage|gov>
  --integration <none|vite|webpack|rollup|esbuild|rspack|node-loader>
  --codegen <off|install|wire>
  --skills <off|install|codex>
  --sample <none|counter>
  --dry-run
  --non-interactive
  --cwd <path>
`);
    process.exit(0);
  }

  validateEnumOption("runtime", values.runtime, RUNTIMES);
  validateEnumOption("integration", values.integration, INTEGRATION_MODES);
  validateEnumOption("codegen", values.codegen, CODEGEN_MODES);
  validateEnumOption("skills", values.skills, SKILLS_MODES);
  validateEnumOption("sample", values.sample, SAMPLE_MODES);

  return {
    runtime: values.runtime,
    integration: values.integration,
    codegen: values.codegen,
    skills: values.skills,
    sample: values.sample,
    dryRun: Boolean(values["dry-run"]),
    nonInteractive: Boolean(values["non-interactive"]),
    cwd: values.cwd ? resolveCwd(values.cwd) : process.cwd(),
  };
}

export function parseIntegrateArgs(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      cwd: { type: "string" },
      "dry-run": { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });

  if (values.help) {
    console.log(`manifesto integrate

Usage:
  manifesto integrate <none|vite|webpack|rollup|esbuild|rspack|node-loader> [options]

Options:
  --dry-run
  --cwd <path>
`);
    process.exit(0);
  }

  const integration = positionals[0];
  validateEnumOption("integration", integration, INTEGRATION_MODES);

  return {
    integration,
    dryRun: Boolean(values["dry-run"]),
    cwd: values.cwd ? resolveCwd(values.cwd) : process.cwd(),
  };
}

export function parseSetupArgs(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      cwd: { type: "string" },
      "dry-run": { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });

  if (values.help) {
    console.log(`manifesto setup

Usage:
  manifesto setup codegen <off|install|wire> [options]
  manifesto setup skills <off|install|codex> [options]

Options:
  --dry-run
  --cwd <path>
`);
    process.exit(0);
  }

  const [target, state] = positionals;
  if (!target) {
    throw new CliError('Missing setup target. Example: "manifesto setup codegen wire"');
  }

  if (target !== "codegen" && target !== "skills") {
    throw new CliError(`Unsupported setup target "${target}".`);
  }

  const allowed = target === "codegen" ? CODEGEN_MODES : SKILLS_MODES;
  validateEnumOption(`${target} state`, state, allowed);

  return {
    target,
    state,
    dryRun: Boolean(values["dry-run"]),
    cwd: values.cwd ? resolveCwd(values.cwd) : process.cwd(),
  };
}

export function parseScaffoldArgs(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      cwd: { type: "string" },
      "dry-run": { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });

  if (values.help) {
    console.log(`manifesto scaffold

Usage:
  manifesto scaffold <none|counter> [options]

Options:
  --dry-run
  --cwd <path>
`);
    process.exit(0);
  }

  const sample = positionals[0];
  validateEnumOption("sample", sample, SAMPLE_MODES);

  return {
    sample,
    dryRun: Boolean(values["dry-run"]),
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

function validateEnumOption(label, value, allowed) {
  if (value == null) {
    return;
  }

  if (!allowed.includes(value)) {
    throw new CliError(`Unsupported ${label} "${value}".`);
  }
}

function resolveCwd(value) {
  return resolve(process.cwd(), value);
}
