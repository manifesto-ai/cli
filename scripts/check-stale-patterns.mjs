import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const IGNORED_DIRS = new Set([".git", "node_modules", "dist", "coverage"]);
const IGNORED_FILES = new Set(["pnpm-lock.yaml", "check-stale-patterns.mjs"]);

const checks = [
  ["retired dispatch API", /\bdispatchAsync\b/],
  ["retired intent builder", /\bcreateIntent\b/],
  ["retired lineage write API", /\bcommitAsync\b/],
  ["retired governance write API", /\bproposeAsync\b/],
  ["retired governance observer", /\bwaitForProposal\b/],
  ["retired typed MEL root", /\bruntime\.MEL\b/],
  ["retired app snapshot read", /\bgetSnapshot\(/],
  ["retired canonical snapshot read", /\bgetCanonicalSnapshot\(/],
  ["retired snapshot data root", /\bsnapshot\.data\b/],
  ["retired Core version wording", /\bCore v4\b/],
  ["retired MEL guard wording", /\$mel guard/],
  ["inline preview option bag", /\bpreview\([^)\n]*,\s*\{/],
  ["inline submit option bag", /\bsubmit\([^)\n]*,\s*\{/],
];

const findings = [];

for await (const file of walk(ROOT)) {
  const rel = relative(ROOT, file);
  const source = await readFile(file, "utf8");
  for (const [label, pattern] of checks) {
    if (!pattern.test(source)) {
      continue;
    }

    const lines = source.split(/\r?\n/u);
    for (const [index, line] of lines.entries()) {
      if (pattern.test(line)) {
        findings.push(`${rel}:${index + 1}: ${label}: ${line.trim()}`);
      }
    }
  }
}

if (findings.length > 0) {
  console.error("Stale Manifesto v3/v4 CLI artifact detected:\n");
  console.error(findings.join("\n"));
  process.exit(1);
}

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name)) {
        yield* walk(join(dir, entry.name));
      }
      continue;
    }

    if (!entry.isFile() || IGNORED_FILES.has(entry.name)) {
      continue;
    }

    const path = join(dir, entry.name);
    if (/\.(md|json|js|mjs|ts|tsx)$/u.test(path)) {
      yield path;
    }
  }
}
