import { CliError } from "../lib/errors.js";
import { parseAddArgs } from "../lib/args.js";
import { applyPlan, buildAddPlan } from "../lib/plans.js";
import { printPlanSummary } from "../lib/output.js";

export async function handleAddCommand(argv) {
  const options = parseAddArgs(argv);
  if (!options.capability) {
    throw new CliError(
      'Missing capability. Example: "manifesto add lineage"',
    );
  }

  const plan = await buildAddPlan(options);
  printPlanSummary(plan, { dryRun: options.dryRun, command: "add" });

  if (options.dryRun) {
    return 0;
  }

  await applyPlan(plan);
  return 0;
}
