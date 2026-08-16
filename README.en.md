# dsh-plugin-kit

> [中文](./README.md) | **English**

> The DSH plugin family: four ready-to-use plugins plus a scaffolding command that generates new plugins.
> The plugins are published to npm (`@hyzyn/dsh-all`, etc.) and can be installed with one command: `dsh plugin --profile web add @hyzyn/dsh-all`.
> The npm package name and the repository directory name are both `dsh-plugin-kit`.

This repository is a pnpm monorepo that focuses on two things:

1. **Using plugins**: after installation, four management cards appear in DSH Web GUI under **Settings → Plugins** (Environment Variables / MCP Servers / Prompt / Profile). Everything is operated graphically and takes effect immediately after saving;
2. **Writing plugins**: `pnpm create-plugin` generates a new plugin package from a template, which you can install and debug locally, then build and publish.

## Directory Structure

```
dsh-plugin-kit/
├── packages/
│   ├── env/      # Environment variables / secrets management plugin (Web GUI settings card)
│   ├── mcp/      # MCP server configuration plugin (Web GUI settings card)
│   ├── prompt/   # Prompt management plugin (Web GUI settings card)
│   ├── profile/  # Profile management plugin (Web GUI settings card)
│   ├── all/      # Aggregate package: install all plugins with one command
│   ├── hello/    # Minimal plugin template (the blueprint copied by create-plugin)
│   └── kit/      # Plugin development toolkit (definePlugin type helpers)
├── scripts/
│   ├── create-plugin.mjs  # Generate a new plugin from the hello template
│   └── aggregate.mjs      # Regenerate the packages/all aggregate manifest
└── tsconfig.base.json     # Shared TypeScript configuration for all packages
```

## Quick Start (Install Plugins)

### Install directly from npm (recommended)

The plugins are published to npm. **You do not need to clone this repository** — on any machine with DSH installed, run one command:

```bash
# All-in-one: install every plugin with a single command
dsh plugin --profile web add @hyzyn/dsh-all
```

Or install them individually:

```bash
dsh plugin --profile web add @hyzyn/dsh-env     # Environment variables / secrets management
dsh plugin --profile web add @hyzyn/dsh-mcp     # MCP server configuration
dsh plugin --profile web add @hyzyn/dsh-prompt  # Prompt management
dsh plugin --profile web add @hyzyn/dsh-profile # Profile management
```

After installation, **restart `dsh web` once**, then open Web GUI **Settings → Plugins** and you will see the corresponding management cards.
After that, all changes made in the cards (saving environment variables / MCP servers / Prompt) **take effect automatically without restarting**.

> Uninstall: `dsh plugin --profile web remove @hyzyn/dsh-<package>` (e.g. `@hyzyn/dsh-mcp`), then restart and the plugin row disappears.

### Local development install (link from source)

When you want to modify plugin code or debug, install from the repository source:

**Prerequisites**: Node ≥ 22.19, pnpm 10, and DSH (`dsh` command available).

```bash
cd dsh-plugin-kit
pnpm install
pnpm build        # Build all packages and output lib/
```

```bash
# All-in-one
dsh plugin --profile web add link:$(pwd)/packages/all

# Or individually
dsh plugin --profile web add link:$(pwd)/packages/env
dsh plugin --profile web add link:$(pwd)/packages/mcp
dsh plugin --profile web add link:$(pwd)/packages/prompt
dsh plugin --profile web add link:$(pwd)/packages/profile
```

## Built-in Plugins Overview

| Plugin | Card location | What it does |
| --- | --- | --- |
| `@hyzyn/dsh-env` | Settings → Plugins → “Environment Variables / Secrets Management” | Manage environment variables and secrets graphically; after saving, write them into `process.env` |
| `@hyzyn/dsh-mcp` | Settings → Plugins → “MCP Server Configuration” | Add MCP servers to DSH so models can use `mcp__<server>__<tool>` |
| `@hyzyn/dsh-prompt` | Settings → Plugins → “Prompt Management” | Visually edit systemPrompt with versioning / A/B testing / export & sharing |
| `@hyzyn/dsh-profile` | Settings → Plugins → “Profile Management” | View / create / copy / rename / delete DSH profiles |

### Environment Variables / Secrets Management (@hyzyn/dsh-env)

- **What it does**: add, edit, or delete environment variables and secrets in the Web GUI; after saving, they are immediately written into the current process’s `process.env`, so both the host and subsequently started child processes can read them without restarting.
- **How to use**: open the card → add a key-value pair → (check “Secret” for sensitive entries to show them as password fields) → save.
- **Supports**: plain strings; `js:` prefixed expressions (e.g. `js:process.env.API_KEY`); secret marking.
- **Where it is stored**: the managed block of `~/.dsh/env.yml` (auto-generated; do not edit by hand).
- **Note**: key names may only contain letters, digits, and underscores, and must not be duplicated.

### MCP Server Configuration (@hyzyn/dsh-mcp)

- **What it does**: add MCP servers to DSH; after saving, they hot-load into `mcp__<server name>__<tool name>` tools within 1–2 seconds, so models can call them directly without restarting.
- **How to use**: open the card → add a server (choose transport) → (it is recommended to click “Connection Test” first) → save.
- **Supports**: two transports — stdio (local subprocess, e.g. `npx -y @modelcontextprotocol/server-filesystem`) and streamable-http (remote service); `js:` prefixed expressions (e.g. `js:process.env.GITHUB_TOKEN`); enable/disable, edit, delete; status badges.
- **Where it is stored**: the managed block of `~/.dsh/cordis.patch.yml`.
- **Note**: **do not** manually append plugin lines to this file, otherwise DSH may fail to start with `duplicate loader entry id`.

### Prompt Management (@hyzyn/dsh-prompt)

- **What it does**: visually edit systemPrompt; when enabled, its content is injected as a systemPrompt section and takes effect immediately after saving.
- **How to use**: open the card → create/edit a Prompt (multiple versions can be saved) → enable.
- **Supports**: version switching/rollback; A/B testing (choose A/B versions for the same Prompt and randomly match them by weight); export JSON/Markdown, one-click copy & share, import from JSON.
- **Where it is stored**: the managed block of `~/.dsh/prompts.yml`.
- **Note**: each Prompt must have at least one version, and a single version’s content must be ≤ 500KB.

### Profile Management (@hyzyn/dsh-profile)

- **What it does**: visually view all DSH profiles under `~/.dsh/profiles`, with create, copy, rename, and delete operations for maintaining multiple DSH environments.
- **How to use**: open the card → view the profile list → create / copy / rename / delete; set a port for each profile and copy a startup command with `--port`.
- **Supports**: initialization status, bundle layer and dependency display; create from basic / `web` / `headless` templates; copy excludes `node_modules` and lock files and automatically installs dependencies; rename; port configuration and startup command copy.
- **Where it is stored**: directly manages the `~/.dsh/profiles/<name>` directory.
- **Note**: deletion is recursive — confirm twice before operating; the built-in `web` default profile cannot be deleted, while `headless` can be deleted; after creating a new profile, dependencies are installed on demand when you first run `dsh plugin --profile <name> add ...`.

## UI Previews

### MCP Server Configuration (@hyzyn/dsh-mcp)

![MCP server configuration plugin](/docs/dsh-plugin-kit-mcp.png)

### Environment Variables / Secrets Management (@hyzyn/dsh-env)

![Environment variables / secrets management plugin](/docs/dsh-plugin-kit-env.png)

### Prompt Management (@hyzyn/dsh-prompt)

![Prompt management plugin](/docs/dsh-plugin-kit-promat.png)

### Profile Management (@hyzyn/dsh-profile)

![Profile management configuration UI](/docs/dsh-plugin-kit-profile.png)

![Example of starting a headless profile from the command line](/docs/dsh-plugin-kit-profile-example-headless1.png)

## Developing a New Plugin

```bash
pnpm create-plugin <name> [id]
# Example: pnpm create-plugin timer          → packages/timer (@hyzyn/dsh-timer, plugin id: timer)
# Example: pnpm create-plugin pet-tracker pt → packages/pet-tracker (plugin id: pt)
```

The script copies the `packages/hello` template, replaces the package name and plugin id, and automatically updates the aggregate package. Then:

1. Edit `packages/<name>/src/index.ts` to write your plugin logic;
2. Build and install locally for debugging:

```bash
pnpm --filter @hyzyn/dsh-<name> build
dsh plugin --profile web add link:$(pwd)/packages/<name>
```

### What a Plugin Package Looks Like (using hello as an example)

| File / field | Purpose |
| --- | --- |
| `package.json#dsh.bundle.patch` | Points to `cordis.patch.yml`, declaring this package as a bundle patch layer |
| `cordis.patch.yml` | Inserts one line to mount the plugin into the profile lineup |
| `src/index.ts` | Host half: exports a Cordis plugin shaped like `{ name, inject, apply }` |
| `package.json#dsh.client` | Optional: declares the browser half; Web GUI loads it as `/plugins/<id>/client.js` |

There are two ways to inject services: use `inject: ['tools', 'webServer']` and then access `ctx.tools` directly; or call `ctx.get('tools')` at runtime and check for null. Use schemastery to export a same-name `Config` schema for configuration.

## Common Commands

| Command | Purpose |
| --- | --- |
| `pnpm install` | Install dependencies |
| `pnpm build` | Build all packages (tsc outputs lib/) |
| `pnpm typecheck` | Run type checking across the repo |
| `pnpm create-plugin <name> [id]` | Generate a new plugin from the template |
| `pnpm aggregate` | Regenerate the `packages/all` aggregate manifest (run after adding/removing plugins) |

## FAQ

**The card does not appear?**
Restart `dsh web`; make sure you are using the official `dsh-web-app` settings panel (the browser half depends on the core slots service).

**Changes to plugin code do not take effect?**
Run `pnpm build` again, then restart `dsh web`.

**No tools appear after saving an MCP server?**
Wait 1–2 seconds for HMR; check the status badge and conflict hints in the card; click “Connection Test” before saving.

**Getting `duplicate loader entry id`?**
Most likely you manually added plugin lines to `~/.dsh/cordis.patch.yml`. Remove the duplicate lines — plugin lines should only be mounted by bundle patches; the managed block is only for server configuration.

**`npm install` / `npm view` reports EPERM?**
There may be root-owned files in the local `~/.npm` cache (a historical npm bug). Run `sudo chown -R $(id -u):$(id -g) ~/.npm` to fix it. pnpm is not affected.

## Environment Notes

- SDK version baseline: `@deepseek-ai/dsh-*@0.1.0-rc.6`, `@deepseek-ai/cordis@^4.0.1`, `schemastery@^3.18` (aliased to `@deepseek-ai/schemastery@3.18.1` in official profiles).

## References

- DSH built-in skill `cordis-plugin-development`: development specification for dynamic Cordis plugins (runtime `cordis_define`)
- README inside each plugin package (`packages/<name>/README.md`): more detailed implementation notes
