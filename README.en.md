# dsh-plugin-kit · DSH Plugin Family

[中文](README.md) | English

<p align="center">
  <img src="https://img.shields.io/github/v/release/hyzyn/dsh-plugin-kit?style=flat-square" alt="Version">
  &nbsp;
  <img src="https://img.shields.io/github/stars/hyzyn/dsh-plugin-kit?style=flat-square" alt="Stars">
  &nbsp;
  <img src="https://img.shields.io/github/forks/hyzyn/dsh-plugin-kit?style=flat-square" alt="Forks">
  &nbsp;
  <img src="https://img.shields.io/npm/v/@hyzyn%2Fdsh-all?style=flat-square&label=npm" alt="npm">
  &nbsp;
  <img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="License">
</p>

Repo gates: `pnpm typecheck` / `pnpm build` / `pnpm aggregate`.

<p align="center">
  <strong>The plugin family for the DeepSeek Harness (DSH) Web GUI</strong><br>
  <em>Environment variables · MCP servers · Prompt · Profile · RSS · Global search · Codegraph · Terminal panel · Plugin scaffolding</em>
</p>

<p align="center">

[What It Is](#what-it-is) · [Feature Plugins](#feature-plugins) · [Quick Start](#quick-start) · [Developing a New Plugin](#developing-a-new-plugin) · [FAQ](#faq) · [Known Limitations](#known-limitations) · [Contributing](#contributing)

</p>

## What It Is

dsh-plugin-kit is a general-purpose plugin collection for the DeepSeek Harness (DSH) Web GUI: environment variable / secret management, MCP server configuration, Prompt management, Profile management, RSS / news aggregation, global search, Codegraph integration, and a terminal panel, plus a one-command scaffolding tool for generating new plugins. Everything mounts into `dsh web` through the official profile mechanism, so no DSH source changes are needed. Install the plugins individually, or install everything at once with the aggregate package.

![Example of DSH plugin management cards](docs/dsh-plugin-kit-mcp.png)

| Capability | Stock dsh web | dsh-plugin-kit family |
| --- | --- | --- |
| Environment variables | CLI / manual config | Web GUI card, saves directly into `process.env` |
| MCP servers | Manual patch / CLI | Visual card + connection test + hot reload after saving |
| Prompt management | Manual config | Visual editing + versioning / A/B testing / export & sharing |
| Profile management | CLI | Visual create / copy / rename / delete |
| RSS aggregation | None | Multiple sources + daily “Today’s Worth Reading” digest |
| Global search | Session titles/content only | Unified sidebar full-text search over historical sessions |
| Codegraph integration | None | Code-graph card: index status / symbol search / callers-callees-impact / one-click sync-index |
| Terminal panel | None | Sidebar “Terminal” entry + xterm.js modal: multi-tab real PTY terminal (vim / htop / dev servers), cwd follows session, hot-reload config |
| Plugin development | Hand-written boilerplate | `pnpm create-plugin` scaffolding + `@hyzyn/dsh-kit` type helpers |

## Feature Plugins

### Environment Variables / Secrets Management (@hyzyn/dsh-env)

- **What it does**: add, edit, or delete environment variables and secrets in the Web GUI. After saving, they are immediately written into the current process’s `process.env`, so both the host and subsequently started child processes can read them without restarting.
- **How to use**: open Settings → Plugins → “Environment Variables / Secrets Management” → add a key-value pair → (check “Secret” for sensitive entries to show them as password fields) → save.
- **Supports**: plain strings; `js:` prefixed expressions (e.g. `js:process.env.API_KEY`); secret marking.
- **Where it is stored**: the managed block of `~/.dsh/env.yml` (auto-generated; do not edit by hand).
- **Note**: key names may only contain letters, digits, and underscores, and must not be duplicated.

![Environment variables / secrets management plugin](docs/dsh-plugin-kit-env.png)

### MCP Server Configuration (@hyzyn/dsh-mcp)

- **What it does**: add MCP servers to DSH. After saving, they hot-load into `mcp__<server name>__<tool name>` tools within 1–2 seconds, so models can call them directly without restarting.
- **How to use**: open Settings → Plugins → “MCP Server Configuration” → add a server (choose transport) → (it is recommended to click “Connection Test” first) → save.
- **Supports**: two transports — stdio (local subprocess, e.g. `npx -y @modelcontextprotocol/server-filesystem`) and streamable-http (remote service); `js:` prefixed expressions (e.g. `js:process.env.GITHUB_TOKEN`); enable/disable, edit, delete; status badges.
- **Where it is stored**: the managed block of `~/.dsh/cordis.patch.yml`.
- **Note**: **do not** manually append plugin lines to this file, otherwise DSH may fail to start with `duplicate loader entry id`.

![MCP server configuration plugin](docs/dsh-plugin-kit-mcp.png)

### Prompt Management (@hyzyn/dsh-prompt)

- **What it does**: visually edit systemPrompt. When enabled, its content is injected as a systemPrompt section and takes effect immediately after saving.
- **How to use**: open Settings → Plugins → “Prompt Management” → create/edit a Prompt (multiple versions can be saved) → enable.
- **Supports**: version switching/rollback; A/B testing (choose A/B versions for the same Prompt and randomly match them by weight); export JSON/Markdown, one-click copy & share, import from JSON.
- **Where it is stored**: the managed block of `~/.dsh/prompts.yml`.
- **Note**: each Prompt must have at least one version, and a single version’s content must be ≤ 500KB.

![Prompt management plugin](docs/dsh-plugin-kit-promat.png)

### Profile Management (@hyzyn/dsh-profile)

- **What it does**: visually view all DSH profiles under `~/.dsh/profiles`, with create, copy, rename, and delete operations for maintaining multiple DSH environments.
- **How to use**: open Settings → Plugins → “Profile Management” → view the profile list → create / copy / rename / delete; set a port for each profile and copy a startup command with `--port`.
- **Supports**: initialization status, bundle layer and dependency display; create from basic / `web` / `headless` templates; copy excludes `node_modules` and lock files and automatically installs dependencies; rename; port configuration and startup command copy.
- **Where it is stored**: directly manages the `~/.dsh/profiles/<name>` directory.
- **Note**: deletion is recursive — confirm twice before operating; the built-in `web` default profile cannot be deleted, while `headless` can be deleted; after creating a new profile, dependencies are installed on demand when you first run `dsh plugin --profile <name> add ...`.

![Profile management configuration UI](docs/dsh-plugin-kit-profile.png)

![Example of starting a headless profile from the command line](docs/dsh-plugin-kit-profile-example-headless1.png)

### Global Search (@hyzyn/dsh-search)

- **What it does**: adds a “Global Search” entry to the Web GUI sidebar. Type a keyword to run full-text search over historical sessions and settings panels.
- **How to use**: after installing, click or focus the global search box below “New Session” in the sidebar → type a keyword → click a session result to open it and try to locate the matching text; click a settings-panel result to jump straight to the corresponding settings card.
- **Supports**: full-text session search via DSH’s built-in `sessionQuery`; settings-panel search (official panels always searchable, plugin panels filtered dynamically by what is installed); configurable result limits; keyword highlighting in results.
- **Where it is stored**: no separate config.
- **Note**: requires the host `sessionQuery` service; if absent, session search returns an empty list. If the `session-query` full-text index is configured with `openAt: "never"`, session search automatically degrades to per-session scanning; session results are filtered to currently visible/jumpable sessions.

![Global search plugin](docs/dsh-plugin-kit-search.png)

### RSS / News Aggregation (@hyzyn/dsh-rss)

- **What it does**: subscribe to multiple RSS / Atom sources and automatically compile a daily “Today’s Worth Reading” Markdown digest, injected into systemPrompt for the model to reference.
- **How to use**: after installing, click “Today’s Worth Reading” in the sidebar below “New Session” to view news directly; you can also open Settings → Plugins → “RSS / News Aggregation” to toggle built-in channels, add custom channels (validated on save), search and one-click add feeds from the [awesome-rsshub-routes](https://jackyst0.github.io/awesome-rsshub-routes/) catalog, and manage categories and aggregation settings. Saving refreshes the digest automatically.
- **Built-in channels**: Ruanyifeng, sspai, Solidot, Hacker News, Juejin, ITHome, 36Kr (36Kr’s official feed is blocked by anti-bot protection, so the built-in entry uses a third-party RSSHub mirror) — check to show, uncheck to stop fetching.
- **Custom channels**: enter any RSS / Atom URL; it is validated with a real fetch on save — homepages, non-feed pages, and empty feeds are rejected with a clear error and not saved.
- **Source catalog**: ships the awesome-rsshub-routes curated catalog (official RSS and RSSHub routes, 98 feeds / 12 categories), searchable and filterable by category with one-click add to custom channels; bundled snapshot silently refreshes from the upstream OPML every 12 hours at runtime (falling back to the snapshot when offline).
- **Categories**: a channel’s category is picked from the category list, and the digest (Markdown, systemPrompt, modal) is grouped by category; categories in use are merged into the list automatically on save.
- **Supports**: RSS 2.0 / Atom parsing, deduplication, per-source item limits, daily scheduled generation, startup catch-up generation, custom output directory, and the built-in channel library.
- **Where it is stored**: `~/.dsh/rss-digest/YYYY-MM-DD.md` (override with `DSH_RSS_DIGEST_DIR`).
- **Note**: the first startup will fetch feeds over the network; unreachable sources are listed in the digest’s “fetch failed” section and do not block the remaining sources.

![RSS / News Aggregation settings card](docs/dsh-plugin-kit-rss-setting.png)

![Sidebar “Today’s Worth Reading” modal: grouped by category, each source links to its website](docs/dsh-plugin-kit-rss-view.png)

![Query today’s news: ask the model for “Today’s Worth Reading” and it cites the daily digest](docs/dsh-plugin-kit-rss-query-news.png)

### Codegraph Integration (@hyzyn/dsh-codegraph)

- **What it does**: code-graph integration — the “Codegraph” card under Settings → Plugins shows index status, symbol search, callers / callees / impact, and one-click sync / index. On install it automatically injects a CodeGraph usage guideline into systemPrompt so the model prefers `codegraph_explore` / `codegraph explore` over grep / read in indexed projects.
- **How to use**: open Settings → Plugins → “Codegraph” → view index status, search symbols, click a result to inspect source and call chains / impact, or run Sync / rebuild index manually.
- **Supports**: index status (version, file / symbol / edge counts, last indexed time, pending changes); symbol search with node / callers / callees / impact details; **the default path follows the active session’s workspace directory** (switches when you switch projects; a manual input temporarily overrides it); one-click incremental sync and full rebuild.
- **Where it is stored**: the index lives in the project’s `.codegraph/` directory (created by `codegraph index`); the plugin has no config file of its own.
- **Note**: the target project needs a Codegraph index first; unindexed projects return guidance to fall back to regular tools. Indexing / rebuilding are local CLI operations that consume real disk and CPU.

![Codegraph settings card](docs/dsh-plugin-kit-codegraph.png)

### Terminal Panel (@hyzyn/dsh-tty)

- **What it does**: adds a “Terminal” entry to the Web GUI sidebar that opens a large modal with an embedded xterm.js interactive terminal (real PTY via node-pty), with multi-tab support, capable of running arbitrary commands and TUI programs (vim / htop / dev servers).
- **How to use**: install, then restart `dsh web`; click “Terminal” in the sidebar → the first terminal is created automatically (default `$SHELL`) → use “+” in the tab bar to open more tabs and ✕ to close; new tabs default to the current DSH session’s working directory; Ctrl+F searches inside the terminal, and the toolbar offers clear / copy / paste; closing the panel or pressing Esc ends all sessions.
- **Supports**: multi-tab sessions (multiple sessions per connection, protocol v2 with sid); working directory follows the current session (sessions client service); TERM=xterm-256color injection (via a `-c` wrapper layer so TUI apps don’t degrade); resize passthrough to node-pty’s native API; a WebSocket frame protocol (spawn/input/resize/kill ↔ ready/data/exit/error); downstream backpressure protection; loopback trust fence; concurrency cap (default 4); settings hot-reload (settings/updated); agent tools (tty_list / tty_capture / tty_send, to inspect and interact with long-running processes in the user's terminal).
- **Where it is stored**: no config file of its own; configuration lives in the “Settings → Plugins → Terminal Panel” card.
- **Note**: resize relies on DSH’s internal terminal-handle shape (known limitation); output is a UTF-8 text stream, so `cat`-ing binary files shows replacement characters. See `packages/tty/README.md` for details.

## Quick Start

### System Requirements

- DeepSeek Harness installed and `dsh web` starts normally.
- No extra requirements for npm installs; installing from this repository requires Node.js >= 22.19 and pnpm 10.

### Three-Step Setup

1. Install the aggregate package: `dsh plugin --profile web add @hyzyn/dsh-all`
2. Restart `dsh web`; all management cards appear under Settings → Plugins
3. Open “Settings > Plugins” and use the cards as needed; changes take effect immediately after saving

### Install from npm (recommended)

The plugins are published to npm (under the `@hyzyn` scope). Install everything with one command — either of these two equivalent options:

```sh
dsh plugin --profile web add @hyzyn/dsh-all              # aggregate package
dsh plugin --profile web add @hyzyn/dsh-plugin-kit       # repo root bundle (mounts the whole family too)
```

After installation, restart `dsh web` and open Settings → Plugins to see all the cards. If you only want one plugin, see “Install a Single Plugin” below.

### Install from the GitHub Repository (Development / Debugging)

The plugin packages are already on npm; installing from the repository is for development and debugging (requires Node.js >= 22.19 and pnpm 10).
The repository root is itself a DSH bundle (`package.json#dsh.bundle.patch`, generated by `pnpm aggregate`),
so `dsh plugin add link:$(pwd)` recognizes and mounts the whole family as one plugin:

```sh
# 1. Clone the repository
git clone https://github.com/hyzyn/dsh-plugin-kit.git
cd dsh-plugin-kit

# 2. Install dependencies and build
pnpm install
pnpm build

# 3. Link the family into the web profile (the root bundle is equivalent to installing @hyzyn/dsh-all)
dsh plugin --profile web add link:$(pwd)

# 4. Restart dsh web
dsh web
```

> ⚠️ If the web profile already has `@hyzyn/dsh-all` or any `@hyzyn/dsh-<pkg>` installed, do **not**
> add the root bundle (or `packages/all`) again — duplicate plugin rows cause a
> `duplicate loader entry id` error at startup.

> If you only want one subpackage, replace step 3 with `dsh plugin --profile web add link:$(pwd)/packages/<name>`, e.g. `packages/mcp`.

> With the `dsh` field declared on the root package, GitHub DSH plugin marketplaces
> (e.g. DSH-Plugins-Marketplace, which detects plugins by the `dsh` field or
> `@deepseek-ai/*` dependencies) now classify this repository as a DSH plugin
> (cordis-plugin) instead of flagging it as "non-plugin".

### Install a Single Plugin

If you do not want the whole family, you can install any plugin individually (published on npm, use the package name directly):

```sh
dsh plugin --profile web add @hyzyn/dsh-env     # Environment variables / secrets management
dsh plugin --profile web add @hyzyn/dsh-mcp     # MCP server configuration
dsh plugin --profile web add @hyzyn/dsh-prompt  # Prompt management
dsh plugin --profile web add @hyzyn/dsh-profile # Profile management
dsh plugin --profile web add @hyzyn/dsh-rss     # RSS / news aggregation
dsh plugin --profile web add @hyzyn/dsh-search  # Global search
dsh plugin --profile web add @hyzyn/dsh-codegraph # Codegraph integration
dsh plugin --profile web add @hyzyn/dsh-tty     # Terminal panel
```

### Verify and Uninstall

After installing, restart `dsh web`; the corresponding card appearing under Settings → Plugins means it worked. You can also use `dsh --profile web --dump-config` to confirm the plugin configuration layer is mounted. If a card does not appear, you probably forgot to restart `dsh web`.

Uninstall: `dsh plugin --profile web remove @hyzyn/dsh-all` (or the corresponding `@hyzyn/dsh-<package>`), then restart `dsh web`.

### Installation Troubleshooting

<details>
<summary><strong>Expand for common installation problems</strong></summary>

<br>

> **Card does not appear?** Restart `dsh web`; make sure you are using the official `dsh-web-app` settings panel (the browser half depends on the core slots service).

> **No tools appear after saving an MCP server?** Wait 1–2 seconds for HMR; check the status badge and conflict hints in the card; click “Connection Test” before saving.

> **Getting `duplicate loader entry id`?** Most likely you manually added plugin lines to `~/.dsh/cordis.patch.yml`. Remove the duplicate lines — plugin lines should only be mounted by bundle patches; the managed block is only for server configuration.

> **`npm install` / `npm view` reports EPERM?** There may be root-owned files in the local `~/.npm` cache (a historical npm bug). Run `sudo chown -R $(id -u):$(id -g) ~/.npm` to fix it. pnpm is not affected.

</details>

## Developing a New Plugin

```sh
pnpm create-plugin <name> [id]
# Example: pnpm create-plugin timer          → packages/timer (@hyzyn/dsh-timer, plugin id: timer)
# Example: pnpm create-plugin pet-tracker pt → packages/pet-tracker (plugin id: pt)
```

The script copies the `templates/hello` template, replaces the package name and plugin id, and automatically updates the aggregate package. Then:

1. Edit `packages/<name>/src/index.ts` to write your plugin logic;
2. Build and install locally for debugging:

```sh
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

## FAQ

<details>
<summary><strong>I restarted, but there is still no card under Settings → Plugins?</strong></summary>

A: First make sure the plugin was installed into the `web` profile (the `--profile web` flag), then use `dsh --profile web --dump-config` to confirm the plugin configuration layer is mounted. If it still does not work, see “Installation Troubleshooting” above. Refreshing the page is not enough — restart the `dsh web` process.

</details>

<details>
<summary><strong>Changes to plugin code do not take effect?</strong></summary>

A: Run `pnpm build` again, then restart `dsh web`. If you changed the browser half, you may also need to clear the browser cache or do a hard refresh.

</details>

<details>
<summary><strong>No tools appear after saving an MCP server?</strong></summary>

A: Wait 1–2 seconds for HMR; check the status badge and conflict hints in the card; click “Connection Test” before saving. If it still fails, check whether the server process can actually start and whether the address is reachable.

</details>

<details>
<summary><strong>Getting `duplicate loader entry id`?</strong></summary>

A: Most likely you manually added plugin lines to `~/.dsh/cordis.patch.yml`. Remove the duplicate lines — plugin lines should only be mounted by bundle patches; the managed block is only for server configuration.

</details>

<details>
<summary><strong>`npm install` / `npm view` reports EPERM?</strong></summary>

A: There may be root-owned files in the local `~/.npm` cache (a historical npm bug). Run `sudo chown -R $(id -u):$(id -g) ~/.npm` to fix it. pnpm is not affected.

</details>

## Known Limitations

- The managed block in `~/.dsh/cordis.patch.yml` is only for MCP server configuration; manually adding plugin lines can cause `duplicate loader entry id` at startup.
- Profile deletion is recursive and irreversible after the in-panel confirmation. The built-in `web` profile is protected; `headless` can be deleted.
- RSS needs network access on first startup. An unreachable source does not block other sources, but that source may be missing from the day’s digest.
- The browser half depends on the official `dsh-web-app` settings panel slots service; non-official Web GUIs may not show the management cards.
- The terminal panel (dsh-tty) resize passthrough relies on DSH’s internal terminal-handle shape, and TERM injection needs the `-c` wrapper layer (DSH hard-codes node-pty `name:"dumb"`); see `packages/tty/README.md`.
- Installing from the repository requires Node.js >= 22.19 and pnpm 10; it is for development/debugging only. npm installs are not affected.

## Contributing

- Generate new plugins with the scaffolding command: `pnpm create-plugin <name> [id]`, instead of writing boilerplate by hand.
- Follow Conventional Commits for commit messages (e.g. `fix(mcp): fix connection test timeout`). For user-visible changes, please include screenshots or verification evidence.
- Run the gates before submitting: `pnpm typecheck && pnpm build && pnpm aggregate`.
- After adding or removing plugins, run `pnpm aggregate` to regenerate the `packages/all` manifest.

## License

This repository is licensed under the [MIT](LICENSE) license.

## Contributors

<div align="center">

**Like this project? Give it a star.**

[Report Bug](https://github.com/hyzyn/dsh-plugin-kit/issues) · [Request Feature](https://github.com/hyzyn/dsh-plugin-kit/issues) · [View Releases](https://github.com/hyzyn/dsh-plugin-kit/releases)

</div>
