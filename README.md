# @manifesto-ai/cli

Official CLI for installing, configuring, and validating Manifesto projects.

## Commands

```bash
manifesto init --runtime gov --integration none --codegen install --skills codex
manifesto integrate vite
manifesto setup codegen wire
manifesto setup skills codex
manifesto scaffold counter
manifesto doctor --json
```

## Current model

- `init`: declare Manifesto intent, install runtime/tooling packages, and optionally run selected setup steps
- `integrate`: patch a host integration surface such as `vite`, `webpack`, `rollup`, `esbuild`, `rspack`, or `node-loader`
- `setup`: manage stateful tooling modes such as `codegen=off|install|wire` and `skills=off|install|codex`
- `scaffold`: generate optional sample files such as the counter MEL runtime
- `doctor`: validate the declared intent in `manifesto.config.*` against actual repo state
- `add`: deprecated compatibility wrapper for the older capability-based flow

The CLI now treats `manifesto.config.*` as the source of truth:

```ts
export default {
  runtime: "gov",
  integration: {
    mode: "none",
  },
  tooling: {
    codegen: "install",
    skills: "codex",
  },
  sample: "none",
};
```

This makes "packages only", "install but do not wire codegen", and "install skills plus run Codex setup" first-class states.

## Interactive init

When `manifesto init` runs in a TTY, it opens an Ink-based wizard that walks through:

- runtime
- integration mode
- codegen mode
- skills mode
- sample mode
- final review

The wizard defaults to the conservative install-only path: `runtime=base`, `integration=none`, `codegen=off`, `skills=off`, `sample=none`.

Use `--non-interactive` when you want explicit flags only.

## Publishing

GitHub Actions includes a manual `Publish npm Package` workflow.

- Run it from the Actions tab on `main`
- Choose `npm-tag` such as `latest` or `next`
- Set `dry-run=true` when you want to validate the tarball without publishing

If npm trusted publishing is not configured for `@manifesto-ai/cli`, add a repository secret named `NPM_TOKEN` with publish access to the `@manifesto-ai` scope.
