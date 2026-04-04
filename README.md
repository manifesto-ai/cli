# @manifesto-ai/cli

Official CLI for installing, configuring, and validating Manifesto projects.

Use it when you want to:

- bootstrap a new Manifesto project
- retrofit an existing repo with a bundler or loader integration
- install optional tooling such as codegen or Codex skills
- validate that `manifesto.config.*` still matches the real repo state

Most teams should start with `runtime=base`. Move to `runtime=lineage` or `runtime=gov` only after continuity or approval/history become actual requirements.

## Quick Start

```bash
npm install -D @manifesto-ai/cli
npx manifesto init --runtime base --integration vite --codegen wire --skills off
npx manifesto doctor
```

If you already know you need Codex guidance:

```bash
npx manifesto setup skills codex
```

## Commands

```bash
manifesto init --runtime base --integration vite --codegen wire --skills off
manifesto integrate vite
manifesto setup codegen wire
manifesto setup skills codex
manifesto scaffold counter
manifesto doctor --json
```

## Command Model

- `init`: declare Manifesto intent, install runtime/tooling packages, and optionally run selected setup steps
- `integrate`: patch a host integration surface such as `vite`, `webpack`, `rollup`, `esbuild`, `rspack`, or `node-loader`
- `setup`: manage stateful tooling modes such as `codegen=off|install|wire` and `skills=off|install|codex`
- `scaffold`: generate optional sample files such as the counter MEL runtime
- `doctor`: validate the declared intent in `manifesto.config.*` against actual repo state
- `add`: deprecated compatibility wrapper for the older capability-based flow

The CLI treats `manifesto.config.*` as the source of truth:

```ts
export default {
  runtime: "base",
  integration: {
    mode: "vite",
  },
  tooling: {
    codegen: "wire",
    skills: "off",
  },
  sample: "counter",
};
```

This makes "packages only", "install but do not wire codegen", and "install skills plus run Codex setup" first-class states.

Supported modes:

- `runtime`: `base`, `lineage`, `gov`
- `integration.mode`: `none`, `vite`, `webpack`, `rollup`, `esbuild`, `rspack`, `node-loader`
- `tooling.codegen`: `off`, `install`, `wire`
- `tooling.skills`: `off`, `install`, `codex`
- `sample`: `none`, `counter`

## Interactive Init

When `manifesto init` runs in a TTY, it opens an Ink-based wizard that walks through:

- runtime
- integration mode
- codegen mode
- skills mode
- sample mode
- final review

The wizard defaults to the conservative install-only path: `runtime=base`, `integration=none`, `codegen=off`, `skills=off`, `sample=none`.

Use `--non-interactive` when you want explicit flags only.

## Escalate Later

When the project later needs continuity or approval/history:

- switch `runtime` from `base` to `lineage` or `gov`
- keep the same `manifesto.config.*` workflow
- rerun `manifesto doctor` to confirm repo state matches intent

## Publishing

GitHub Actions includes a manual `Publish npm Package` workflow.

- Run it from the Actions tab on `main`
- Choose `npm-tag` such as `latest` or `next`
- Set `dry-run=true` when you want to validate the tarball without publishing

If npm trusted publishing is not configured for `@manifesto-ai/cli`, add a repository secret named `NPM_TOKEN` with publish access to the `@manifesto-ai` scope.
