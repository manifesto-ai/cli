# @manifesto-ai/cli

Official CLI scaffold for installing, configuring, and validating Manifesto projects.

## Commands

```bash
manifesto init --preset base --bundler vite
manifesto init --preset lineage --bundler vite
manifesto init --preset gov --bundler webpack --tooling codegen,skills
manifesto add governance --auto-deps
manifesto doctor --json
```

## Current scope

- `init`: package install plan, bundler wiring, `manifesto.config.ts`, sample MEL/runtime files
- `add`: optional capability install plan with governance dependency guardrails
- `doctor`: package drift, bundler integration, composition integrity, and skills setup checks

The current scaffold keeps its core planning and doctor logic lightweight, while the interactive `init` flow now uses Ink for a richer terminal UI.

When `manifesto init` runs in a TTY, it now opens an Ink-based wizard for bundler, preset, tooling, sample-file selection, and final confirmation. The flag-based non-interactive path still works the same way for agents and CI.

## Publishing

GitHub Actions includes a manual `Publish npm Package` workflow.

- Run it from the Actions tab on `main`
- Choose `npm-tag` such as `latest` or `next`
- Set `dry-run=true` when you want to validate the tarball without publishing

If npm trusted publishing is not configured for `@manifesto-ai/cli`, add a repository secret named `NPM_TOKEN` with publish access to the `@manifesto-ai` scope.
