import { parseRegistryBuildArgs } from "../lib/args.js";
import { applyRegistryBuildPlan, buildRegistryBuildPlan } from "../lib/domain-registry.js";
import { CliError } from "../lib/errors.js";
import { printDomainPlanSummary } from "../lib/output.js";

export async function handleRegistryCommand(argv) {
  const [subcommand, ...rest] = argv;

  if (!subcommand || subcommand === "help" || subcommand === "--help" || subcommand === "-h") {
    console.log(`manifesto registry

Usage:
  manifesto registry build [domain-name] [options]
`);
    return 0;
  }

  if (subcommand !== "build") {
    throw new CliError(`Unsupported registry command "${subcommand}".`);
  }

  const options = parseRegistryBuildArgs(rest);
  const plan = await buildRegistryBuildPlan({
    cwd: options.cwd,
    domainName: options.domainName,
    outDir: options.outDir,
  });

  printDomainPlanSummary(plan, { command: "registry build", dryRun: options.dryRun });

  if (options.dryRun) {
    return 0;
  }

  await applyRegistryBuildPlan(plan);
  return 0;
}
