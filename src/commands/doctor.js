import { parseDoctorArgs } from "../lib/args.js";
import { printDoctorReport } from "../lib/output.js";
import { runDoctor } from "../lib/doctor.js";

export async function handleDoctorCommand(argv) {
  const options = parseDoctorArgs(argv);
  const result = await runDoctor({
    cwd: options.cwd,
    strict: options.strict,
  });

  printDoctorReport(result, { json: options.json });
  return result.exitCode;
}
