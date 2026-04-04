import process from "node:process";
import { CliError } from "../lib/errors.js";
import { parseInitArgs } from "../lib/args.js";
import { applyPlan, buildInitPlan } from "../lib/plans.js";
import { detectBundler } from "../lib/project.js";
import { printPlanSummary } from "../lib/output.js";
import { runInitWizard } from "../ui/init-wizard.js";

export async function handleInitCommand(argv) {
  const options = parseInitArgs(argv);
  const interactive = process.stdin.isTTY && process.stdout.isTTY && !options.nonInteractive;
  const detection = detectBundler(options.cwd);

  let bundler = options.bundler;
  if (!bundler && detection.bundler !== "unknown") {
    bundler = detection.bundler;
  }

  if (interactive) {
    const selection = await runInitWizard({
      bundler,
      detection,
      preset: options.preset,
      tooling: options.tooling,
      sample: options.sample,
      dryRun: options.dryRun,
    });

    if (!selection) {
      return 0;
    }

    bundler = selection.bundler;
    options.preset = selection.preset;
    options.tooling = selection.tooling;
    options.sample = selection.sample;
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
