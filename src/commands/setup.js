import { parseSetupArgs } from "../lib/args.js";
import { applyPlan, buildSetupPlan } from "../lib/plans.js";
import { printPlanSummary } from "../lib/output.js";

export async function handleSetupCommand(argv) {
  const options = parseSetupArgs(argv);
  const plan = await buildSetupPlan(options);
  printPlanSummary(plan, { dryRun: options.dryRun, command: `setup ${options.target}` });

  if (options.dryRun) {
    return 0;
  }

  await applyPlan(plan);
  return 0;
}
