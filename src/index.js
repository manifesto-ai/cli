export { runCli } from "./cli.js";
export {
  buildAddPlan,
  buildInitPlan,
  buildIntegratePlan,
  buildScaffoldPlan,
  buildSetupPlan,
} from "./lib/plans.js";
export { runDoctor } from "./lib/doctor.js";
export {
  detectBundler,
  detectPackageManager,
  findBundlerConfigPath,
  hasMelPluginConfigured,
} from "./lib/project.js";
