export { runCli } from "./cli.js";
export { buildInitPlan, buildAddPlan } from "./lib/plans.js";
export { runDoctor } from "./lib/doctor.js";
export {
  detectBundler,
  detectPackageManager,
  findBundlerConfigPath,
  hasMelPluginConfigured,
} from "./lib/project.js";
