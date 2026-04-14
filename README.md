# @manifesto-ai/cli

Official CLI for installing, configuring, and validating Manifesto projects.

Use it when you want to:

- bootstrap a new Manifesto project
- install and diff registry-backed domains
- build registry artifacts from local domains
- retrofit an existing repo with a bundler or loader integration
- install optional tooling such as codegen or Codex skills
- validate that `manifesto.config.*` still matches the real repo state

Most teams should start with `runtime=base`. Move to `runtime=lineage` or `runtime=gov` only after continuity or approval/history become actual requirements.

## Quick Start

```bash
npm install -D @manifesto-ai/cli
npx manifesto init --runtime base --integration vite --codegen wire --skills off
npx manifesto add trading-agent
npx manifesto doctor
```

If you already know you need Codex guidance:

```bash
npx manifesto setup skills codex
```

If you want project-local guidance for Claude Code or other supported agents:

```bash
npx manifesto setup skills claude
npx manifesto setup skills cursor
npx manifesto setup skills copilot
npx manifesto setup skills windsurf
npx manifesto setup skills all
```

## Commands

```bash
manifesto init --runtime base --integration vite --codegen wire --skills off
manifesto add trading-agent
manifesto diff trading-agent --apply
manifesto registry build
manifesto integrate vite
manifesto setup codegen wire
manifesto setup skills claude
manifesto setup skills all
manifesto scaffold counter
manifesto doctor --json
```

## Command Model

- `init`: declare Manifesto intent, install runtime/tooling packages, and optionally run selected setup steps
- `add`: install a domain from the configured Manifesto registry and generate an agent wrapper under `manifesto/agents`
- `diff`: compare an installed local domain with the latest registry item and optionally apply file updates
- `registry build`: compile local domains under `manifesto/domains` and emit publishable registry JSON artifacts
- `integrate`: patch a host integration surface such as `vite`, `webpack`, `rollup`, `esbuild`, `rspack`, or `node-loader`
- `setup`: manage stateful tooling modes such as `codegen=off|install|wire` and `skills=off|install|codex|claude|cursor|copilot|windsurf|all`
- `scaffold`: generate optional sample files such as the counter MEL runtime
- `doctor`: validate the declared intent in `manifesto.config.*` and local `manifesto.json` domain state against actual repo state
- `add <lineage|governance|codegen|skills>`: legacy compatibility mode when `manifesto.json` is absent

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

This makes "packages only", "install but do not wire codegen", and "install skills plus run a specific agent setup" first-class states.

Domain and registry flows use `manifesto.json` as the source of truth:

```json
{
  "$schema": "https://registry.manifesto-ai.dev/schema/manifesto.json",
  "domains": "manifesto/domains",
  "agents": "manifesto/agents",
  "typescript": true,
  "registries": {
    "manifesto": "https://registry.manifesto-ai.dev"
  }
}
```

Supported modes:

- `runtime`: `base`, `lineage`, `gov`
- `integration.mode`: `none`, `vite`, `webpack`, `rollup`, `esbuild`, `rspack`, `node-loader`
- `tooling.codegen`: `off`, `install`, `wire`
- `tooling.skills`: `off`, `install`, `codex`, `claude`, `cursor`, `copilot`, `windsurf`, `all`
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

## Skills Targets

`skills=install` means package only. No agent installer runs.

Tool-specific modes run the matching `manifesto-skills` installer:

- `codex` -> `manifesto-skills install-codex`
- `claude` -> `manifesto-skills install-claude`
- `cursor` -> `manifesto-skills install-cursor`
- `copilot` -> `manifesto-skills install-copilot`
- `windsurf` -> `manifesto-skills install-windsurf`
- `all` -> `manifesto-skills install-all`

`codex` installs into the user-level Codex home. The other agent installers default to project-local files so the repo is ready for Claude Code, Cursor, Copilot, or Windsurf immediately after `manifesto init` or `manifesto setup`.

## Publishing

GitHub Actions includes a manual `Publish npm Package` workflow.

- Run it from the Actions tab on `main`
- Choose `npm-tag` such as `latest` or `next`
- Set `dry-run=true` when you want to validate the tarball without publishing

If npm trusted publishing is not configured for `@manifesto-ai/cli`, add a repository secret named `NPM_TOKEN` with publish access to the `@manifesto-ai` scope.
