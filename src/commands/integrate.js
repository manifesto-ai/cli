import { CliError } from "../lib/errors.js";
import { parseIntegrateArgs } from "../lib/args.js";
import { applyPlan, buildIntegratePlan } from "../lib/plans.js";
import { printPlanSummary } from "../lib/output.js";

export async function handleIntegrateCommand(argv) {
  const options = parseIntegrateArgs(argv);
  if (!options.integration) {
    throw new CliError(
      'Missing integration mode. Example: "manifesto integrate vite"',
    );
  }

  const plan = await buildIntegratePlan(options);
  printPlanSummary(plan, { dryRun: options.dryRun, command: "integrate" });

  if (options.dryRun) {
    return 0;
  }

  await applyPlan(plan);
  return 0;
}
