import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { CliError } from "./errors.js";

export function detectPackageManager(cwd, packageJson = null) {
  if (packageJson?.packageManager) {
    return packageJson.packageManager.split("@")[0];
  }

  if (existsSync(join(cwd, "pnpm-lock.yaml"))) {
    return "pnpm";
  }

  if (existsSync(join(cwd, "yarn.lock"))) {
    return "yarn";
  }

  if (existsSync(join(cwd, "package-lock.json"))) {
    return "npm";
  }

  const userAgent = process.env.npm_config_user_agent ?? "";
  if (userAgent.startsWith("pnpm/")) {
    return "pnpm";
  }
  if (userAgent.startsWith("yarn/")) {
    return "yarn";
  }

  return "npm";
}

export function buildInstallCommand(packageManager, dependencyType, packages) {
  const filtered = packages.filter(Boolean);
  if (filtered.length === 0) {
    return null;
  }

  switch (packageManager) {
    case "pnpm":
      return {
        command: "pnpm",
        args: dependencyType === "devDependencies"
          ? ["add", "-D", ...filtered]
          : ["add", ...filtered],
      };
    case "yarn":
      return {
        command: "yarn",
        args: dependencyType === "devDependencies"
          ? ["add", "-D", ...filtered]
          : ["add", ...filtered],
      };
    default:
      return {
        command: "npm",
        args: dependencyType === "devDependencies"
          ? ["install", "-D", ...filtered]
          : ["install", ...filtered],
      };
  }
}

export function runInstallCommand({ cwd, command, args }) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    throw new CliError(`Package installation failed: ${command} ${args.join(" ")}`);
  }
}
