#!/usr/bin/env node

import { runCli } from "../src/cli.js";
import { CliError } from "../src/lib/errors.js";

try {
  const exitCode = await runCli(process.argv.slice(2));
  if (typeof exitCode === "number" && exitCode !== 0) {
    process.exitCode = exitCode;
  }
} catch (error) {
  if (error instanceof CliError) {
    console.error(error.message);
    process.exitCode = error.exitCode;
  } else {
    console.error(error);
    process.exitCode = 1;
  }
}
