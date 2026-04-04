import { CliError } from "./lib/errors.js";
import { handleAddCommand } from "./commands/add.js";
import { handleDoctorCommand } from "./commands/doctor.js";
import { handleInitCommand } from "./commands/init.js";

const HELP_TEXT = `manifesto

Official CLI for installing, configuring, and validating Manifesto projects.

Usage:
  manifesto <command> [options]

Commands:
  init      Inject Manifesto into an existing project
  add       Add an optional Manifesto capability
  doctor    Diagnose package, bundler, and tooling drift
  help      Show this message

Examples:
  manifesto init --preset base --bundler vite
  manifesto init --preset lineage --bundler vite
  manifesto init --preset gov --bundler webpack --tooling codegen,skills
  manifesto add governance --auto-deps
  manifesto doctor --json
`;

export async function runCli(argv = []) {
  const [command, ...rest] = argv;

  if (!command || command === "help" || command === "--help" || command === "-h") {
    console.log(HELP_TEXT);
    return 0;
  }

  switch (command) {
    case "init":
      return handleInitCommand(rest);
    case "add":
      return handleAddCommand(rest);
    case "doctor":
      return handleDoctorCommand(rest);
    default:
      throw new CliError(
        `Unknown command: ${command}\n\nRun "manifesto help" to see the available commands.`,
      );
  }
}
