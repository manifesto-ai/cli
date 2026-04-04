# @manifesto-ai/cli

Official CLI scaffold for installing, configuring, and validating Manifesto projects.

## Commands

```bash
manifesto init --preset base --bundler vite
manifesto init --preset governed --bundler webpack --tooling codegen,skills
manifesto add governance --auto-deps
manifesto doctor --json
```

## Current scope

- `init`: package install plan, bundler wiring, `manifesto.config.ts`, sample MEL/runtime files
- `add`: optional capability install plan with governance dependency guardrails
- `doctor`: package drift, bundler integration, composition integrity, and skills setup checks

The current scaffold intentionally uses only Node built-ins so the package can run without introducing extra CLI runtime dependencies during the first implementation pass.
