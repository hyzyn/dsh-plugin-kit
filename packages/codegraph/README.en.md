# @hyzyn/dsh-codegraph

[中文](README.md) | English

> The “Codegraph” card under DSH **Settings → Plugins**: it brings code-graph status, symbol search, and call chains into the GUI, and aligns the project directory of the codegraph MCP server for you.

## Features

- **Index status at a glance**: whether it is initialized, version, file / symbol / edge counts, last indexed time, and pending changes.
- **Call chains and impact**: click a search result to inspect the source plus callers / callees / impact, without going back to the command line.
- **One-click sync / index**: incremental sync and full rebuild both live in the card.
- **Fixes "No CodeGraph project is loaded"**: it manages the MCP server row and aligns the cwd with the default project; saving hot-restarts the MCP server (no host restart needed); when the target path has no `.codegraph/`, the existing config is never touched.
- **Follows the current project**: by default it follows the active session's working directory and switches when you switch project sessions; a manually typed path temporarily overrides it.

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
- When the target path has no `.codegraph/`, it never rewrites the existing cwd and never creates a row out of thin air — a working config is not broken.
- Multiple projects: one codegraph MCP server mounts one default project at a time; other indexed projects can be queried by passing `projectPath` on the tool call, or by switching with one click in the card.
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
| `/api/dsh-codegraph/default-path` | GET | Default project path + MCP managed state |
| `/api/dsh-codegraph/default-path` | POST | Set as default project `{ path }` (requires an existing `.codegraph/`), hot-switches the MCP at the same time |

All routes are loopback-only, to prevent remote access.

## Compatibility (DSH / codegraph CLI)

- **DSH**: the whole chain has been verified on `0.1.5-rc.2` — host routes (status/query/callers/callees/impact/node all return 200), the browser half (the client module enters the boot graph and is served correctly by the combo route), both systemPrompt injections, and the shape of the managed MCP row (`@deepseek-ai/dsh-mcp-client`'s `stdio` config). `package.json` declares `dsh.engines.dsh: ">=0.1.2-rc.1"`, and the plugin market derives its compatibility verdict from that.
  - Why the lower bound is written as `>=0.1.2-rc.1` rather than the shorter `^0.1.2`: the dsh-web resolver only accepts the single form `>=X.Y.Z[-prerelease]`, while `^` / `~` / a bare version number are all read as "cannot verify"; and `^` itself does not include **the lower bound version's own prerelease**, so a host that is already verified as working, such as `0.1.2-rc.1`, is judged incompatible, and the market's update path **refuses installation outright** once it confirms incompatibility (bypassing that requires `force`); `^0.1.5` would even wrongly kill `0.1.5-rc.2` as well. DSH has long shipped as `-rc.N`, so the range must explicitly carry the RC lower bound.
  - Why no upper bound `<0.2.0` is declared: the resolver only supports a single `>=` comparison operator, so a two-part range (`>=0.1.2-rc.1 <0.2.0`) as a whole is read as "cannot verify", and per that module's contract a declared-but-unverifiable requirement is fail-closed — the update is blocked outright, which is worse than declaring nothing. When crossing to the 0.2 line, re-verify by hand and then decide whether to relax the lower bound.
- **Codegraph CLI**: verified on `1.5.0`; the subcommands used are `status` / `query` / `callers` / `callees` / `impact` / `node` / `sync` / `index`, with every flag checked one by one. `codegraph serve --mcp` still works (it is not listed in the top-level help, but `codegraph serve --help` has it), so the managed row needs no change.
- **URL shape of the browser half**: DSH currently goes through client-modules' combo route, so the single-package direct link `/plugins/@hyzyn/dsh-codegraph/client.js` is no longer directly usable; the browser only uses `/plugins/??<id>/client.js&rev=…` handed down by the boot graph (`window.__DSH_BOOT__`), and the plugin side needs no change.

## Development

```bash
pnpm --filter @hyzyn/dsh-codegraph build
pnpm --filter @hyzyn/dsh-codegraph typecheck
pnpm vitest run packages/codegraph          # managed-row decision matrix + CLI knobs
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

A `defaultPath` / `mcpIntegration` saved in the `codegraph` settings namespace takes precedence over the plugin config; that is exactly what the card's “Set as default project” writes.

`command` / `cliTimeoutMs` / `indexTimeoutMs` / `indexForce` are **install-level knobs**: they only read the plugin config and never enter the settings namespace. Just override them by id in the profile patch, for example:

```yaml
- id: codegraph
  config:
    indexTimeoutMs: 1800000
    indexForce: true
```

When a timeout is hit, the error shown in the card names the corresponding config option (`cliTimeoutMs` / `indexTimeoutMs`) directly, so you do not have to dig through logs.

## System prompt

After installation, two prompt sections are injected into systemPrompt automatically:

- `plugin:dsh-codegraph` (order 150): the plugin capability announcement (in Chinese), so the model knows that a Codegraph card and MCP tools are available.
- `plugin:dsh-codegraph:usage` (order 151): the CodeGraph usage guideline (the CODEGRAPH_START block), which tells the model to prefer `codegraph_explore` / `codegraph explore` over grep/read in indexed projects, and gives the self-healing path of retrying with `projectPath` when the "No CodeGraph project" error appears.

Both can be turned off via config (`announceToAgent: false` / `usageGuidance: false`).
