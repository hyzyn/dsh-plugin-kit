# @hyzyn/dsh-codegraph

[中文](README.md) | English

> The “Codegraph” card under DSH **Settings → Plugins**: it brings code-graph status, symbol search, and call chains into the GUI, and aligns the project directory of the codegraph MCP server for you.

## Features

- **Search through indexing, all in the card**: `status --json` is laid out as compact fields (state / version / project / scale / last indexed / pending / languages / index size) with the raw JSON behind a collapsible row; a symbol result shows its line-numbered source plus the `callers` / `callees` / `impact` lists, raw JSON still collapsible, without leaving the GUI.
- **Two index paths**: `sync -- <path>` for incremental, `index [--force] -- <path>` for a full rebuild; query commands use `cliTimeoutMs` (60 s) while `sync` / `index` use `indexTimeoutMs` (600 s by default).
- **Managed MCP working directory**: dsh-mcp-client declares no MCP roots capability, so `codegraph serve --mcp` can only look upward for `.codegraph/` from `process.cwd()`. The plugin manages that server row in `~/.dsh/cordis.patch.yml` and aligns `config.cwd` with the default project; the rewrite hot-loads through watchUserPatches, so the MCP connection is rebuilt without a host restart.
- **Index detection shares the CLI's `initialized` semantics**: an index database (`*.db`) must exist under `.codegraph/`. A directory-existence check treats the codegraph CLI's own install dir `~/.codegraph` as an indexed project, leaving the MCP server on an unindexed cwd — measured there, `codegraph_explore`'s required fields grow from `query` to `query` + `projectPath`, so every call needs an explicit path. Anything short of a real index leaves the existing cwd untouched, and the card reports `indexState` plus the reason.
- **Follows the current project (on by default)**: when a session switches to an **indexed** project the managed MCP row's cwd aligns with it, no click needed; a session directory without a usable index falls back to the pinned path. "Set as default project" persists that pinned path into the `codegraph` settings namespace **and turns following off** (an explicit choice should not be overridden by the next session switch); the card's "follow the current project" checkbox turns it back on.
- **Two independently switchable systemPrompt sections**: `plugin:dsh-codegraph` (order 150, capability announcement) and `plugin:dsh-codegraph:usage` (order 151, usage guideline), both gated behind a `<command> --version` probe (no injection on failure); the card's checkboxes write `announceToAgent` / `usageGuidance` into the settings namespace, adding or removing the sections live.

![Codegraph settings card: index status / symbol search / one-click sync](https://cdn.jsdelivr.net/gh/hyzyn/dsh-plugin-kit@main/docs/dsh-plugin-kit-codegraph.png)

## Why the MCP working directory is managed

DSH's MCP client does not declare the MCP roots capability, so once `codegraph serve --mcp` starts it can only search upward for `.codegraph/` from its **process working directory**. And `dsh web` is often started from the home directory — in that case model calls to `mcp__codegraph__*` always return:

```
No CodeGraph project is loaded for this session.
Searched for a .codegraph/ directory starting from: /Users/you
```

This plugin solves that: it manages one codegraph MCP server row in `~/.dsh/cordis.patch.yml` (`codegraph serve --mcp`, cwd = the default project path). When the default project path changes (the card's “Set as default project” or a config edit), that row is rewritten, and DSH's watchUserPatches hot reload mounts the MCP server onto the new project automatically.

Behavior details:

- It prefers reusing an existing codegraph row in the `@hyzyn/dsh-mcp` managed block (only the cwd is filled in; other fields, including the disabled state, are left untouched); only when there is none does it write this plugin's own block, avoiding a serverName collision.
- Manual rows outside the block are only detected, never touched (to avoid conflicts).
- A target path is only managed when it holds a **real index**: a `.db` index file must exist inside `.codegraph/`. A bare `.codegraph/` directory is not enough — the codegraph CLI keeps its own install data in `~/.codegraph` (`current -> versions/<v>`, `bundles/`, `codegraph.lock`, no index database), so the **home directory** used to be mistaken for an indexed project: the plugin pinned the MCP cwd to it and reported everything as fine, while `codegraph status --json -- ~` actually returns `initialized:false` and the tools keep answering "No CodeGraph project is loaded". When that happens the plugin leaves the existing cwd alone, creates no row, and the card shows "default project X is not a valid index" plus the one-click fix.
- Multiple projects: one codegraph MCP server mounts one default project at a time; other indexed projects can be queried by passing `projectPath` on the tool call, or by switching with one click in the card.
- Follow semantics: the managed cwd is the session directory when following is on **and** that directory holds a valid index, otherwise the pinned path. A valid index means an index database inside `.codegraph/` (not merely the directory existing), so the CLI's own `~/.codegraph` install dir cannot drag the cwd off; after `codegraph uninit` the cwd falls back automatically instead of going stale.
- Following is reported by the **browser half** (it subscribes to the active session at page load, whether or not the settings panel is open): the host has no "current session" signal of its own, so following works while a GUI page is open and uses the pinned path otherwise.
- How to turn it off: the plugin config `mcpIntegration: false` (this reverts the managed row written by this plugin).

## API

| Route | Method | Description |
| --- | --- | --- |
| `/api/dsh-codegraph/status?path=` | GET | Index status (JSON) |
| `/api/dsh-codegraph/query?q=&path=&limit=` | GET | Search symbols |
| `/api/dsh-codegraph/callers?symbol=&path=` | GET | Look up callers |
| `/api/dsh-codegraph/callees?symbol=&path=` | GET | Look up callees |
| `/api/dsh-codegraph/impact?symbol=&path=&depth=` | GET | Look up impact |
| `/api/dsh-codegraph/node?name=&path=` | GET | Look up symbol / file details |
| `/api/dsh-codegraph/sync` | POST | Incremental sync `{ path }` |
| `/api/dsh-codegraph/index` | POST | Full rebuild `{ path }` |
| `/api/dsh-codegraph/default-path` | GET | Pinned `defaultPath` + `effectivePath` + `sessionPath` + `followSession` + prompt toggles + `cliAvailable` + MCP managed state (`indexState` describes the **effective** path) |
| `/api/dsh-codegraph/follow` | POST | Report the active session directory `{ path }` (empty = no active session); the host aligns the managed cwd and falls back for unindexed directories |
| `/api/dsh-codegraph/settings` | POST | Write toggles `{ announceToAgent?, usageGuidance?, mcpIntegration?, followSession? }` (booleans), effective immediately |
| `/api/dsh-codegraph/default-path` | POST | Set as default project `{ path }` (requires an index database inside `.codegraph/`), hot-switches the MCP at the same time |

All routes are loopback-only, to prevent remote access.

## Compatibility (DSH / codegraph CLI)

- **DSH**: the whole chain has been verified on `0.1.5-rc.2` — host routes (status/query/callers/callees/impact/node all return 200), the browser half (the client module enters the boot graph and is served correctly by the combo route), both systemPrompt injections, and the shape of the managed MCP row (`@deepseek-ai/dsh-mcp-client`'s `stdio` config). `package.json` declares `dsh.engines.dsh: ">=0.1.2-rc.1"`, and the plugin market derives its compatibility verdict from that.
  - Why the lower bound is written as `>=0.1.2-rc.1` rather than the shorter `^0.1.2`: the dsh-web resolver only accepts the single form `>=X.Y.Z[-prerelease]`, while `^` / `~` / a bare version number are all read as "cannot verify"; and `^` itself does not include **the lower bound version's own prerelease**, so a host that is already verified as working, such as `0.1.2-rc.1`, is judged incompatible, and the market's update path **refuses installation outright** once it confirms incompatibility (bypassing that requires `force`); `^0.1.5` would even wrongly kill `0.1.5-rc.2` as well. DSH has long shipped as `-rc.N`, so the range must explicitly carry the RC lower bound.
  - Why no upper bound `<0.2.0` is declared: the resolver only supports a single `>=` comparison operator, so a two-part range (`>=0.1.2-rc.1 <0.2.0`) as a whole is read as "cannot verify", and per that module's contract a declared-but-unverifiable requirement is fail-closed — the update is blocked outright, which is worse than declaring nothing. When crossing to the 0.2 line, re-verify by hand and then decide whether to relax the lower bound.
- **Codegraph CLI**: verified on `1.5.0`; the subcommands used are `status` / `query` / `callers` / `callees` / `impact` / `node` / `sync` / `index`, with every flag checked one by one. `codegraph serve --mcp` still works (it is not listed in the top-level help, but `codegraph serve --help` has it), so the managed row needs no change.
- **URL shape of the browser half**: DSH currently goes through client-modules' combo route, so the single-package direct link `/plugins/@hyzyn/dsh-codegraph/client.js` is no longer directly usable; the browser only uses `/plugins/??<id>/client.js&rev=…` handed down by the boot graph (`window.__DSH_BOOT__`), and the plugin side needs no change.
- **Operating systems**: Windows / macOS / Linux run the same code path, and CI is a three-platform matrix (`pnpm -r build` + `typecheck` + `test`).
  - **Windows**: the CLI goes through `%COMSPEC% /d /s /c` with cmd escaping (a global npm / pnpm install only ships a `.cmd` shim, which `execFile` cannot start directly — `ENOENT`); a timeout kills the whole tree with `taskkill /pid <pid> /T /F`, **including the grandchild CLI inside the shim** (killing only cmd.exe lets a large `index` run to completion); rewriting the patch file keeps the file's own line endings (a CRLF file is not turned into mixed endings, and a rewrite does not change the line count).
  - **PATH**: both the probe and the calls use the plugin's `command` config (default `codegraph`, resolved through PATH). When the host is started from an entry point that does not inherit the shell environment (Dock / Start menu), the CLI may be missing from PATH — neither prompt block is injected and the card cannot resolve a working command; pointing `command` at an absolute path fixes it (the card names the command it probed).
  - **MCP row**: `dsh-mcp-client` uses the official SDK's `StdioClientTransport` (the SDK depends on `cross-spawn`), which resolves `.cmd` shims on Windows itself, so the managed row needs no platform branch.
  - The upstream CLI ships official builds for all three platforms × x64/arm64 (bundled Node runtime); the plugin's index detection only looks for a `*.db` under `.codegraph/` rather than a fixed filename, so an upstream rename does not affect it.

## Development

```bash
pnpm --filter @hyzyn/dsh-codegraph build
pnpm --filter @hyzyn/dsh-codegraph typecheck
pnpm vitest run packages/codegraph          # managed-row decision matrix + CLI knobs + follow/gating routes
node packages/codegraph/scripts/preview-card.mjs        # render the card preview HTML into .preview/ (--png needs a normal terminal: Chrome cannot start under a restricted sandbox)
node packages/codegraph/scripts/verify-sync.mjs   # managed-row sync logic verification (requires a build first)
```

After upgrading the local DSH, re-link first and then typecheck — otherwise `packages/*/node_modules/@deepseek-ai/*` is still the old copy from the repository's
`.pnpm`, and the plugin and the host each hold a different version of the library, so compatibility problems are masked:

```bash
node scripts/link-dsh-runtime.mjs     # link packages/*'s @deepseek-ai/* and @hyzyn/dsh-kit to the dsh runtime / this repository's workspace
```

## Install into DSH

```bash
dsh plugin --profile web add link:$(pwd)
```

## Configuration

```ts
export interface Config {
  /** Disable the whole plugin. On by default. */
  enabled?: boolean
  /** Whether to inject the plugin capability announcement into the agent. On by default. */
  announceToAgent?: boolean
  /** Whether to inject the CodeGraph usage guideline (the CODEGRAPH_START block) into systemPrompt. On by default. */
  usageGuidance?: boolean
  /** The codegraph CLI command. Defaults to `codegraph`. */
  command?: string
  /** The default project path. Defaults to `process.cwd()`. */
  defaultPath?: string
  /** Whether to manage the codegraph MCP server row. On by default; turning it off reverts the managed row written by this plugin. */
  mcpIntegration?: boolean
  /** Timeout in milliseconds for query commands (status/query/callers/callees/impact/node). Defaults to 60000. */
  cliTimeoutMs?: number
  /** Timeout in milliseconds for index commands (sync/index). Defaults to 600000. A full rebuild of a large repository exceeds the query budget. */
  indexTimeoutMs?: number
  /** Append `--force` to `codegraph index` (used when the CLI refuses to index a home directory / filesystem root). Off by default. */
  indexForce?: boolean
}
```

`defaultPath` / `mcpIntegration` / `followSession` / `announceToAgent` / `usageGuidance` saved in the `codegraph` settings namespace take precedence over the plugin config: “Set as default project” writes `defaultPath` and turns `followSession` off, and the three checkboxes write the rest (`POST /api/dsh-codegraph/settings`).

`command` / `cliTimeoutMs` / `indexTimeoutMs` / `indexForce` are **install-level knobs**: they only read the plugin config and never enter the settings namespace. Just override them by id in the profile patch, for example:

```yaml
- id: codegraph
  config:
    indexTimeoutMs: 1800000
    indexForce: true
```

When a timeout is hit, the error shown in the card names the corresponding config option (`cliTimeoutMs` / `indexTimeoutMs`) directly, so you do not have to dig through logs.

## System prompt

After installation, two prompt sections are injected into systemPrompt automatically (~310 tokens in total):

- `plugin:dsh-codegraph` (order 150): the capability announcement (Chinese, ~130 characters) — only that the card exists and can be pointed at; which buttons the card has is UI detail and does not spend model context.
- `plugin:dsh-codegraph:usage` (order 151): the CodeGraph usage guideline (the CODEGRAPH_START block). It fills the role upstream assigns to `CODEGRAPH_INSTRUCTIONS_BLOCK` (the short block for subagents and non-MCP harnesses, while the long playbook rides the MCP `initialize` `instructions`) — **but DSH's MCP client never reads `instructions`**, so upstream's "no root index → query per project via `projectPath`" variant never reaches the model. This block carries exactly that, plus three more: the **shell fallback** (the command name renders from the `command` config instead of a hardcoded `codegraph`, and `--path` is spelled out), **per-project `projectPath`**, and **skip unindexed projects without running `codegraph init`**. Its trigger condition matches the host's `indexState`: `.codegraph/` must contain an index database — upstream's own wording only checks that the directory exists, which mistakes the CLI's `~/.codegraph` install dir for a project index, so this block deliberately tightens it.

Both blocks sit behind two gates:

1. **CLI probe**: `<command> --version` runs once at mount; on failure neither block is injected (a `console.warn` explains it) — the prompt never advertises a capability that cannot work.
2. **Toggles**: the card's two checkboxes write the settings namespace (`POST /api/dsh-codegraph/settings`) and add/remove the sections immediately; installation-level config can also disable them (`announceToAgent: false` / `usageGuidance: false`).
