import { CliError } from "./lib/errors.js";
import { handleAddCommand } from "./commands/add.js";
import { handleDoctorCommand } from "./commands/doctor.js";
import { handleInitCommand } from "./commands/init.js";
import { handleIntegrateCommand } from "./commands/integrate.js";
import { handleScaffoldCommand } from "./commands/scaffold.js";
import { handleSetupCommand } from "./commands/setup.js";

const HELP_TEXT = `manifesto

Official CLI for installing, configuring, and validating Manifesto projects.

Usage:
  manifesto <command> [options]

Commands:
  init        Declare Manifesto intent and install the required packages
  integrate   Configure a host integration surface such as vite or node-loader
  setup       Install or configure Manifesto tooling such as codegen or skills
  scaffold    Generate optional sample files
  add         Deprecated compatibility wrapper for the old capability flow
  doctor      Diagnose package, integration, and tooling drift
  help        Show this message

Examples:
  manifesto init --runtime gov --integration none --codegen install --skills all
  manifesto integrate vite
  manifesto setup codegen wire
  manifesto setup skills claude
  manifesto scaffold counter
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
    case "integrate":
      return handleIntegrateCommand(rest);
    case "setup":
      return handleSetupCommand(rest);
    case "scaffold":
      return handleScaffoldCommand(rest);
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
