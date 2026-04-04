import process from "node:process";
import { parseInitArgs } from "../lib/args.js";
import { applyPlan, buildInitPlan } from "../lib/plans.js";
import { printPlanSummary } from "../lib/output.js";
import { runInitWizard } from "../ui/init-wizard.js";

export async function handleInitCommand(argv) {
  const options = parseInitArgs(argv);
  const interactive = process.stdin.isTTY && process.stdout.isTTY && !options.nonInteractive;

  if (interactive) {
    const selection = await runInitWizard({
      runtime: options.runtime,
      integration: options.integration,
      codegen: options.codegen,
      skills: options.skills,
      sample: options.sample,
      dryRun: options.dryRun,
      cwd: options.cwd,
    });

    if (!selection) {
      return 0;
    }

    options.runtime = selection.runtime;
    options.integration = selection.integration;
    options.codegen = selection.codegen;
    options.skills = selection.skills;
    options.sample = selection.sample;
  }

  const plan = await buildInitPlan({
    cwd: options.cwd,
    runtime: options.runtime,
    integration: options.integration,
    codegen: options.codegen,
    skills: options.skills,
    sample: options.sample,
  });

  printPlanSummary(plan, { dryRun: options.dryRun, command: "init" });
  if (options.dryRun) {
    return 0;
  }

  await applyPlan(plan);
  return 0;
}
