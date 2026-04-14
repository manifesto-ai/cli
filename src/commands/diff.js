import { parseDiffArgs } from "../lib/args.js";
import { buildDomainDiffPlan, applyDomainDiffPlan } from "../lib/domain-registry.js";
import { CliError } from "../lib/errors.js";
import { printDomainPlanSummary } from "../lib/output.js";

export async function handleDiffCommand(argv) {
  const options = parseDiffArgs(argv);
  if (!options.specifier) {
    throw new CliError('Missing domain name. Example: "manifesto diff trading-agent"');
  }

  const plan = await buildDomainDiffPlan({
    cwd: options.cwd,
    specifier: options.specifier,
  });

  printDomainPlanSummary(plan, { command: "diff", dryRun: options.dryRun || !options.apply });

  if (options.dryRun || !options.apply || plan.files.length === 0) {
    return 0;
  }

  await applyDomainDiffPlan(plan);
  return 0;
}
