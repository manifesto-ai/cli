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
  applyDomainAddPlan,
  applyDomainDiffPlan,
  applyRegistryBuildPlan,
  buildDomainAddPlan,
  buildDomainDiffPlan,
  buildRegistryBuildPlan,
} from "./lib/domain-registry.js";
export {
  createManifestoProjectConfig,
  readManifestoProjectConfig,
  resolveManifestoProjectPaths,
  serializeManifestoProjectConfig,
} from "./lib/domain-config.js";
export {
  detectBundler,
  detectPackageManager,
  findBundlerConfigPath,
  hasMelPluginConfigured,
} from "./lib/project.js";
