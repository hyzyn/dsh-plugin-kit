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
  <img src="https://img.shields.io/npm/dt/@hyzyn%2Fdsh-all?style=flat-square&label=downloads" alt="Downloads">
  &nbsp;
  <img src="https://img.shields.io/badge/license-Apache--2.0-blue?style=flat-square" alt="License">
</p>

Repo gates: `pnpm typecheck` / `pnpm build` / `pnpm test` / `pnpm aggregate`.

<p align="center">
  <strong>A plugin family for the DeepSeek Harness (DSH) Web GUI</strong><br>
  <em>Environment · MCP servers · Prompt · Profile · RSS · Global search · Codegraph · Terminal panel · Container panel · Scaffolding</em>
</p>

<p align="center">

[What it is](#what-it-is) · [Packages](#packages) · [Quick start](#quick-start) · [Writing a new plugin](#writing-a-new-plugin) · [Documentation map](#documentation-map) · [Contributing](#contributing)

</p>

## What it is

dsh-plugin-kit is a general-purpose plugin collection for the DeepSeek Harness (DSH) Web GUI.
Every plugin mounts through the official profile mechanism — **DSH itself is never patched** —
and you can install them one by one or all at once with the aggregate package.

![SFTP dual pane: local on the left, remote on the right, inline transfer](https://cdn.jsdelivr.net/gh/hyzyn/dsh-plugin-kit@main/docs/dsh-plugin-kit-tty-sftp-dual.png)

![Docker container panel: docked as a sidebar tab next to the conversation](https://cdn.jsdelivr.net/gh/hyzyn/dsh-plugin-kit@main/docs/dsh-plugin-kit-docker-dock.png)

| Capability | Plain `dsh web` | The dsh-plugin-kit family |
| --- | --- | --- |
| MCP servers | edit the patch file / CLI | visual card + connection test + hot reload after saving |
| Profile management | CLI | visual create / copy / rename / delete |
| RSS aggregation | none | multi-source subscriptions + a daily digest + optional AI summaries (uses the host’s default model, zero config) |
| Global search | session titles/content only | one full-text search over past sessions, Prompts, MCP tools and settings panels |
| Codegraph integration | none | code graph card: index status / symbol search / call chain / impact / one-click sync-index |
| Terminal panel | none | real xterm.js multi-tab PTY (vim/htop/dev server); native SSH (connection book, host-key pinning, auto reconnect); SFTP single-dialog / dual-pane transfer; `tty_*` / `sftp_*` agent tools |
| Docker container panel | none | containers / images / Compose / live logs and stats / multi-target overview; **read-only by default**, mutations and exec behind explicit switches; `docker_*` agent tools |
| Environment variables | CLI / hand-edited config | Web GUI card, written into `process.env` on save |
| Prompt management | hand-edited config | visual editing + versioning / A/B testing / export & share |
| Plugin development | boilerplate by hand | `pnpm create-plugin` scaffolding + the `@hyzyn/dsh-kit` shared library |

> **Each plugin’s full feature set, screenshots and caveats live in its own README** (table below).
> This file only covers *what it is* and *what to install*.

## Packages

**1 shared library + 10 feature plugins + 1 aggregate package.** How they relate, their dependency
direction and how they cooperate: [docs/architecture.md](docs/architecture.md) (Chinese).

| Package | What it does | Docs |
|---|---|---|
| `@hyzyn/dsh-kit` | **Library** (not a plugin): shared host-half utilities — HTTP loopback fence, managed blocks, `!!js` expressions, service access | [README](packages/kit/README.md) · [DEFECTS](packages/kit/DEFECTS.md) |
| `@hyzyn/dsh-mcp` | MCP server configuration card, hot-reloaded on save | [README](packages/mcp/README.md) |
| `@hyzyn/dsh-env` | Environment variables / secrets management | [README](packages/env/README.md) |
| `@hyzyn/dsh-prompt` | systemPrompt editing / versions / A-B testing | [README](packages/prompt/README.md) |
| `@hyzyn/dsh-profile` | Graphical management of `~/.dsh/profiles` | [README](packages/profile/README.md) |
| `@hyzyn/dsh-rss` | RSS aggregation → a daily digest | [README](packages/rss/README.md) |
| `@hyzyn/dsh-search` | Sidebar global search | [README](packages/search/README.md) |
| `@hyzyn/dsh-codegraph` | Code graph card + MCP management + adoption measurement | [README](packages/codegraph/README.md) · [DEFECTS](packages/codegraph/DEFECTS.md) · [ROADMAP](packages/codegraph/ROADMAP.md) |
| `@hyzyn/dsh-tty` | Terminal panel (PTY / SSH / SFTP / tunnels) | [README](packages/tty/README.md) · [DEFECTS](packages/tty/DEFECTS.md) · [ROADMAP](packages/tty/ROADMAP.md) |
| `@hyzyn/dsh-docker` | Docker container panel (local / SSH), read-only by default | [README](packages/docker/README.md) · [DEFECTS](packages/docker/DEFECTS.md) · [ROADMAP](packages/docker/ROADMAP.md) |
| `@hyzyn/dsh-kit-settings` | Adds a “Plugin configuration” row next to “General settings” | [README](packages/kit-settings/README.md) |
| `@hyzyn/dsh-all` | Aggregate package: one bundle patch that mounts the 10 plugins above | [README](packages/all/README.md) |

## Quick start

### System requirements

- DeepSeek Harness installed and `dsh web` starts normally. **The current baseline is DSH `0.1.7-rc.2`**:
  settings now live in the current profile’s plugin-entry configuration, and compatibility is enforced
  from `peerDependencies` both before install and at startup; `0.1.6-alpha.2` and earlier are no longer
  supported.
- Every installable plugin declares `@deepseek-ai/dsh: ^0.1.7-rc.2` in `peerDependencies`, enforced
  both **before install** and **at startup**; `dsh.engines.dsh` is kept as a **marketplace display
  field** (it must match the peer floor). Mechanics, what to do when a version is rejected, and how to
  admit an exact combination → [docs/troubleshooting.md § Compatibility](docs/troubleshooting.md#兼容性校验).
- No extra requirements for npm installs; installing from this repository requires Node.js >= 22.19 and pnpm 10.

### Install from npm (recommended)

```sh
dsh plugin --profile web add @hyzyn/dsh-all              # aggregate package
dsh plugin --profile web add @hyzyn/dsh-plugin-kit       # repo root bundle (mounts the whole family too)
```

**Restart `dsh web`** afterwards; all cards appearing under Settings → Plugins means it worked.
If a card does not appear, you probably forgot to restart. You can also use
`dsh --profile web --dump-config` to confirm the plugin configuration layer is mounted.
For one plugin only, see “Install a single plugin” below.
Uninstall: `dsh plugin --profile web remove @hyzyn/dsh-all` (or the matching subpackage), then restart.

> **Which configuration entry exists in which version**: DSH ≥ `0.1.6-alpha.2` has **two** entries
> pointing at the same configuration — the sidebar **“Plugins”** → pick a plugin → its row’s
> “Configure” (the official two-pane page), and **Settings → “Plugin configuration”** (a row next to
> “General settings”, provided by `@hyzyn/dsh-kit-settings`).
> DSH ≤ `0.1.5` uses the cards inside **Settings → Plugins → “Plugin configuration”**.
> Client halves register all three slot generations (`plugins.row.config`, `settings.kit.item`,
> `settings.plugin.item`), so one build works on every generation.

### Install from the GitHub repository (development / debugging)

Requires Node.js >= 22.19 and pnpm 10. The repository root is itself a DSH bundle
(`package.json#dsh.bundle.patch`, generated by `pnpm aggregate`):

```sh
git clone https://github.com/hyzyn/dsh-plugin-kit.git
cd dsh-plugin-kit
pnpm install
pnpm build

dsh plugin --profile web add link:$(pwd)   # the root bundle is equivalent to installing @hyzyn/dsh-all
dsh web
```

> ⚠️ If the web profile already has `@hyzyn/dsh-all` or any `@hyzyn/dsh-<pkg>` installed, do **not**
> add the root bundle (or `packages/all`) again — duplicate plugin rows cause a
> `duplicate loader entry id` error at startup. For one subpackage only, replace the add step with
> `dsh plugin --profile web add link:$(pwd)/packages/<name>`.
>
> With the `dsh` field on the root package, GitHub DSH marketplaces classify this repository as a DSH
> plugin (cordis-plugin) instead of flagging it as “non-plugin”.

### Install a single plugin

Swap the package name for any entry in the table above (`@hyzyn/dsh-all` → `@hyzyn/dsh-<pkg>`):

```sh
dsh plugin --profile web add @hyzyn/dsh-env       # Environment variables / secrets management
dsh plugin --profile web add @hyzyn/dsh-tty       # Terminal panel
dsh plugin --profile web add @hyzyn/dsh-docker    # Docker container panel
```

Install failures / missing cards / HTTP 401 or 403 → [docs/troubleshooting.md](docs/troubleshooting.md).

Install failures / missing cards / HTTP 401 or 403 → [docs/troubleshooting.md](docs/troubleshooting.md) (Chinese).

## Writing a new plugin

```sh
pnpm create-plugin <name> [id]
# e.g. pnpm create-plugin timer          → packages/timer (@hyzyn/dsh-timer, plugin id: timer)
# e.g. pnpm create-plugin pet-tracker pt → packages/pet-tracker (plugin id: pt)
```

The script copies the `templates/hello` template, substitutes the package name and plugin id, and
updates the aggregate package. Then edit `packages/<name>/src/index.ts` and build for local debugging:

```sh
pnpm --filter @hyzyn/dsh-<name> build
dsh plugin --profile web add link:$(pwd)/packages/<name>
```

**Which docs a new package needs, how long they may be, and where its numbering starts** →
[docs/conventions.md](docs/conventions.md) (Chinese).
**The anatomy of a plugin package** (`dsh.bundle.patch` / `cordis.patch.yml` / `src/index.ts` /
`dsh.client`) → [docs/conventions.md § Package anatomy](docs/conventions.md#插件包解剖).
**Two rules that are easy to trip over** (where a client half may derive its host address; extracting
pure logic into modules) → [docs/conventions.md § Client half](docs/conventions.md#客户端半体两条硬规矩).

## Documentation map

| You want to know | Read |
|---|---|
| What this is, what to install | this file |
| How the 12 packages cooperate, dependency direction, who writes which config file | [docs/architecture.md](docs/architecture.md) |
| Naming / commits / doc layers / numbering / package anatomy | [docs/conventions.md](docs/conventions.md) |
| Terminology (host half, managed block, TOFU, slot generations…) | [docs/glossary.md](docs/glossary.md) |
| Install failures, missing cards, HTTP 401/403, known limits | [docs/troubleshooting.md](docs/troubleshooting.md) |
| How to run real-machine tests, and what counts as passing | [docs/agent-real-test.md](docs/agent-real-test.md) |
| Windows 11 test environment setup | [scripts/windows/README.md](scripts/windows/README.md) |
| Cross-package backlog | [ROADMAP.md](ROADMAP.md) |
| Release process | [RELEASING.md](RELEASING.md) |
| Runtime linking between plugins and the host in a dev checkout | [docs/link-dsh-runtime.md](docs/link-dsh-runtime.md) |
| How one package is used | `packages/<pkg>/README.md` |
| What a defect number means | `packages/<pkg>/DEFECTS.md` |

> The L0 documents under `docs/` are currently Chinese-only. Each package’s `README.md` is bilingual
> (see `README.en.md` next to it).

## Contributing

- Generate new plugins with the scaffolding: `pnpm create-plugin <name> [id]`.
- Commits follow Conventional Commits (e.g. `fix(mcp): …`); user-visible changes should come with
  screenshots or verification evidence.
- Run the gates before committing: `pnpm typecheck && pnpm build && pnpm test && pnpm aggregate`.
- After adding or removing a plugin, re-run `pnpm aggregate` to regenerate the `packages/all` manifest.
- Full conventions: [docs/conventions.md](docs/conventions.md).

## License

Licensed under the [Apache License 2.0](LICENSE).

## Contributors

<div align="center">

**Like this project? Give it a star.**

[Report a bug](https://github.com/hyzyn/dsh-plugin-kit/issues) · [Request a feature](https://github.com/hyzyn/dsh-plugin-kit/issues) · [See releases](https://github.com/hyzyn/dsh-plugin-kit/releases)

</div>
