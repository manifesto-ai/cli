import process from "node:process";
import { CliError } from "../lib/errors.js";
import {
  BUNDLERS,
  PRESETS,
  TOOLING_KEYS,
} from "../lib/constants.js";
import { parseInitArgs } from "../lib/args.js";
import { applyPlan, buildInitPlan } from "../lib/plans.js";
import { detectBundler } from "../lib/project.js";
import { promptInput } from "../lib/prompts.js";
import { printPlanSummary } from "../lib/output.js";

export async function handleInitCommand(argv) {
  const options = parseInitArgs(argv);
  const interactive = process.stdin.isTTY && process.stdout.isTTY && !options.nonInteractive;
  const detection = detectBundler(options.cwd);

  let bundler = options.bundler;
  if (!bundler && detection.bundler !== "unknown") {
    bundler = detection.bundler;
  }

  if (interactive) {
    bundler = await resolveBundlerOption(bundler, detection);
    options.preset = await resolvePresetOption(options.preset);
    options.tooling = await resolveToolingOption(options.tooling);
  } else {
    if (!bundler) {
      throw new CliError(
        'Could not detect a bundler. Re-run with "--bundler <name>" or enable the interactive prompt.',
      );
    }
    if (!options.preset) {
      throw new CliError(
        'Missing "--preset". Valid values: base, governed.',
      );
    }
  }

  const plan = await buildInitPlan({
    cwd: options.cwd,
    bundler,
    preset: options.preset,
    tooling: options.tooling,
    sample: options.sample,
  });

  printPlanSummary(plan, { dryRun: options.dryRun, command: "init" });
  if (options.dryRun) {
    return 0;
  }

  await applyPlan(plan);
  return 0;
}

async function resolveBundlerOption(currentValue, detection) {
  const defaultValue = currentValue ?? "vite";
  const hint = detection.bundler !== "unknown"
    ? ` [detected: ${detection.bundler}${detection.evidence ? ` from ${detection.evidence}` : ""}]`
    : "";
  const value = await promptInput(
    `Bundler${hint} (${BUNDLERS.filter((entry) => entry !== "unknown").join("/")})`,
    defaultValue,
  );

  if (!BUNDLERS.includes(value)) {
    throw new CliError(`Unsupported bundler "${value}".`);
  }

  if (value === "unknown") {
    throw new CliError('Pick a concrete bundler value instead of "unknown".');
  }

  return value;
}

async function resolvePresetOption(currentValue) {
  const value = await promptInput(
    `Preset (${PRESETS.join("/")})`,
    currentValue ?? "base",
  );

  if (!PRESETS.includes(value)) {
    throw new CliError(`Unsupported preset "${value}".`);
  }

  return value;
}

async function resolveToolingOption(currentValue) {
  if (Array.isArray(currentValue) && currentValue.length > 0) {
    return currentValue;
  }

  const raw = await promptInput(
    `Tooling (${TOOLING_KEYS.join(", ")} or none)`,
    "none",
  );

  if (!raw || raw === "none") {
    return [];
  }

  const tooling = raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  for (const item of tooling) {
    if (!TOOLING_KEYS.includes(item)) {
      throw new CliError(`Unsupported tooling "${item}".`);
    }
  }

  return tooling;
}
