import { CliError } from "../lib/errors.js";
import { parseScaffoldArgs } from "../lib/args.js";
import { applyPlan, buildScaffoldPlan } from "../lib/plans.js";
import { printPlanSummary } from "../lib/output.js";

export async function handleScaffoldCommand(argv) {
  const options = parseScaffoldArgs(argv);
  if (!options.sample) {
    throw new CliError(
      'Missing scaffold target. Example: "manifesto scaffold counter"',
    );
  }

  const plan = await buildScaffoldPlan(options);
  printPlanSummary(plan, { dryRun: options.dryRun, command: "scaffold" });

  if (options.dryRun) {
    return 0;
  }

  await applyPlan(plan);
  return 0;
}
