export function printPlanSummary(plan, { dryRun, command }) {
  console.log(`manifesto ${command}${dryRun ? " --dry-run" : ""}`);
  console.log("");

  console.log("Intent");
  console.log(`  runtime: ${plan.intent.runtime}`);
  console.log(`  integration: ${plan.intent.integration.mode}`);
  console.log(`  codegen: ${plan.intent.tooling.codegen}`);
  console.log(`  skills: ${plan.intent.tooling.skills}`);
  console.log(`  sample: ${plan.intent.sample}`);
  console.log("");

  console.log("Packages");
  let hasPackages = false;
  for (const dependencyType of ["dependencies", "devDependencies"]) {
    const packages = plan.installGroups[dependencyType];
    if (packages.length === 0) {
      continue;
    }

    hasPackages = true;
    const label = dependencyType === "dependencies" ? "dependencies" : "devDependencies";
    console.log(`  ${label}: ${packages.join(", ")}`);
  }
  if (!hasPackages) {
    console.log("  (none)");
  }

  console.log("");
  console.log("Files");
  if (plan.files.length === 0) {
    console.log("  (none)");
  } else {
    for (const fileAction of plan.files) {
      console.log(`  ${fileAction.path}`);
      console.log(`    -> ${fileAction.reason}`);
    }
  }

  console.log("");
  console.log("Commands");
  if (plan.commands.length === 0) {
    console.log("  (none)");
  } else {
    for (const commandStep of plan.commands) {
      console.log(`  ${commandStep.command} ${commandStep.args.join(" ")}`);
      console.log(`    -> ${commandStep.reason}`);
    }
  }

  if (plan.notes.length > 0) {
    console.log("");
    console.log("Notes");
    for (const note of plan.notes) {
      console.log(`  - ${note}`);
    }
  }

  if (!dryRun) {
    console.log("");
    console.log("Applying changes...");
  }
}

export function printDomainPlanSummary(plan, { dryRun, command }) {
  console.log(`manifesto ${command}${dryRun ? " --dry-run" : ""}`);
  console.log("");

  if (plan.domainName) {
    console.log("Domain");
    console.log(`  name: ${plan.domainName}`);
    if (plan.registryAlias) {
      console.log(`  registry: ${plan.registryAlias} (${plan.registryUrl})`);
    }
    console.log("");
  } else if (plan.outDir) {
    console.log("Registry");
    console.log(`  outDir: ${plan.outDir}`);
    console.log("");
  }

  if (plan.installGroups) {
    console.log("Packages");
    let hasPackages = false;
    for (const dependencyType of ["dependencies", "devDependencies"]) {
      const packages = plan.installGroups[dependencyType] ?? [];
      if (packages.length === 0) {
        continue;
      }

      hasPackages = true;
      console.log(`  ${dependencyType}: ${packages.join(", ")}`);
    }

    if (!hasPackages) {
      console.log("  (none)");
    }

    if (plan.manualPeers && Object.keys(plan.manualPeers).length > 0) {
      console.log(`  manual: ${Object.entries(plan.manualPeers).map(([name, range]) => `${name}@${range}`).join(", ")}`);
    }

    console.log("");
  }

  if (plan.env && Object.keys(plan.env).length > 0) {
    console.log("Env");
    for (const [key, spec] of Object.entries(plan.env)) {
      if (!spec.required) {
        continue;
      }

      console.log(`  ${key}`);
      console.log(`    -> ${spec.description}`);
    }
    console.log("");
  }

  console.log("Files");
  if (!plan.files || plan.files.length === 0) {
    console.log("  (none)");
  } else {
    for (const fileAction of plan.files) {
      console.log(`  ${fileAction.path}`);
      console.log(`    -> ${fileAction.reason}`);
    }
  }

  if (plan.notes?.length > 0) {
    console.log("");
    console.log("Notes");
    for (const note of plan.notes) {
      console.log(`  - ${note}`);
    }
  }

  if (plan.warnings?.length > 0) {
    console.log("");
    console.log("Warnings");
    for (const warning of plan.warnings) {
      console.log(`  - ${warning}`);
    }
  }

  if (!dryRun) {
    console.log("");
    console.log("Applying changes...");
  }
}

export function printDoctorReport(result, { json }) {
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log("manifesto doctor");
  console.log("");

  const groups = groupBy(result.checks, (check) => check.category);
  for (const [category, checks] of groups) {
    console.log(category);
    for (const check of checks) {
      console.log(`  ${statusLabel(check.status)} ${check.label}`);
      if (check.details) {
        console.log(`    ${check.details}`);
      }
      if (check.suggestion) {
        console.log(`    -> ${check.suggestion}`);
      }
    }
    console.log("");
  }

  console.log(`Summary: ${result.passed} passed, ${result.warnings} warnings, ${result.errors} errors`);
}

function groupBy(items, getKey) {
  const map = new Map();
  for (const item of items) {
    const key = getKey(item);
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key).push(item);
  }
  return map;
}

function statusLabel(status) {
  switch (status) {
    case "pass":
      return "[ok]";
    case "warn":
      return "[warn]";
    default:
      return "[error]";
  }
}
