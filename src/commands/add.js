import { CliError } from "../lib/errors.js";
import { parseAddArgs } from "../lib/args.js";
import { readManifestoProjectConfig } from "../lib/domain-config.js";
import { buildDomainAddPlan, applyDomainAddPlan } from "../lib/domain-registry.js";
import { LEGACY_ADD_CAPABILITIES } from "../lib/constants.js";
import { applyPlan, buildAddPlan } from "../lib/plans.js";
import { printDomainPlanSummary, printPlanSummary } from "../lib/output.js";

export async function handleAddCommand(argv) {
  const options = parseAddArgs(argv);
  if (!options.specifier) {
    throw new CliError(
      'Missing domain name. Example: "manifesto add trading-agent"',
    );
  }

  const projectConfig = await readManifestoProjectConfig(options.cwd);
  const useLegacyFlow =
    !projectConfig
    && LEGACY_ADD_CAPABILITIES.includes(options.specifier)
    && !options.specifier.startsWith("@");

  if (useLegacyFlow) {
    const plan = await buildAddPlan({
      cwd: options.cwd,
      capability: options.specifier,
    });
    printPlanSummary(plan, { dryRun: options.dryRun, command: "add" });

    if (options.dryRun) {
      return 0;
    }

    await applyPlan(plan);
    return 0;
  }

  const plan = await buildDomainAddPlan({
    cwd: options.cwd,
    specifier: options.specifier,
  });
  printDomainPlanSummary(plan, { dryRun: options.dryRun, command: "add" });

  if (options.dryRun) {
    return 0;
  }

  await applyDomainAddPlan(plan);
  return 0;
}
