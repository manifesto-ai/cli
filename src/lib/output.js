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
