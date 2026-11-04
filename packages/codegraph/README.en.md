# @hyzyn/dsh-codegraph

[中文](README.md) | English

> DSH's “Codegraph” card: it brings code-graph status, symbol search, and call chains into the GUI, and aligns the project directory of the codegraph MCP server for you.

## Features

- **`status --json` fields laid out per section**: `initialized` / `version` / `projectPath` / `fileCount` / `nodeCount` / `edgeCount` / `lastIndexed` / `pendingChanges` / `languages` / `dbSizeBytes` render as cells with the raw JSON behind a `<details>`; a symbol drill-down returns its line-numbered verbatim source plus `callers` / `callees` / `impact` lists. The CLI's staleness signals (`reindexRecommended` / `builtWithVersion` / extractor version gap / `worktreeMismatch`) surface as a warning line with "rebuild index" flagged as the suggested action.
- **Two index paths, two timeout buckets**: `sync -- <path>` incremental and `index [--force] -- <path>` full rebuild run on `indexTimeoutMs` (600 s, `0` = unlimited); `status` / `query` / `callers` / `callees` / `impact` / `node` run on `cliTimeoutMs` (60 s, `0` = unlimited). Timeout and cancellation both follow a "SIGTERM → 3 s grace → SIGKILL" process-group escalation on every platform; index-class operations get a Cancel button on the card, and closing the page aborts the CLI too.
- **Managed MCP server row**: dsh-mcp-client declares no MCP roots, so `codegraph serve --mcp` resolves `.codegraph/` upward from `process.cwd()` only; the plugin maintains the `@deepseek-ai/dsh-mcp-client` row in `~/.dsh/cordis.patch.yml` with `config.cwd`, and the rewrite hot-loads through watchUserPatches to rebuild the MCP connection. One server mounts one project at a time; other projects are queried with `projectPath`.
- **Index detection reads `.codegraph/*.db` and walks upward like the CLI**: from the target directory up (stopping at the git root) it looks for the first `.codegraph/` holding an index database; the hit root is the project root, so sessions in monorepo subdirectories are no longer misread as "unindexed". Directory existence alone mistakes the CLI's own install dir `~/.codegraph` for a project index, dropping the managed row on an unindexed cwd — measured there, `codegraph_explore`'s required grows from `["query"]` to `["query","projectPath"]`. Anything short of a real index leaves the existing cwd untouched, and the card reports `indexState` plus the reason.
- **Write discipline**: every write to `~/.dsh/cordis.patch.yml` is re-verified against an mtime+size stamp (the same CAS as dsh-mcp, at most 3 re-reads); when reusing the dsh-mcp block only the codegraph row's own `cwd:` line is changed in place, leaving the block's comments, its other server rows and the loader's legitimate override entries byte-identical; if the block is corrupt it refuses to append a second one (a serverName collision would break codegraph MCP loading wholesale) and reports the reason on the card.
- **The managed row's cwd follows the active session**: `followSession` (on by default) aligns the row when a session switches to a project with a valid index, otherwise falls back to the pinned path; "Set as default project" writes that path into the `codegraph` settings namespace and sets `followSession` false (an explicit pin beats session following). A failed session report retries with backoff instead of being silently lost forever.
- **Per-agent MCP isolation by default** (`mcpScope` defaults to `'per-agent'`; write `'managed'` explicitly to roll back to the old behaviour): with per-agent, each agent mounts its own `dsh-mcp-client` inside **its own Cordis scope**, with `cwd` pinned to the index root of *that* agent's session directory — parallel multi-project work no longer shares a single global cwd, and the whole "write patch → hot reload → rebuild connection" chain disappears; the global managed row is **suspended** (`disabled: true`, restored automatically when you switch back to managed). The cost is one child process per indexed session (measured ~40MB idle Node baseline). An agent whose session directory has **no usable index is not mounted at all** (rather than falling back to the default project): a session opened in the home directory or an unindexed repo gets no `mcp__codegraph__*` at all instead of inheriting "some other project's" context.
  When the preconditions do not hold (no agent event surface on the host / a hand-written codegraph row outside the block / the MCP master switch off) the plugin **falls back to managed and states the reason on the card**, behaving like the old version. **Per-agent mounts wait for env's readiness service** (`dshEnvReady`): the child inherits the host's `scrubbedParentEnv()`, so mounting happens only after env's synchronous pre-injection (when env is not installed the wait is skipped — see `src/env-gate.ts`). The mount mode is **continuously effective** rather than decided once at startup: the `agents` service can become ready late, and the plugin re-decides and back-fills mounts when it arrives (codegraph CG69). Mechanism measurements and tradeoffs: [docs/p0-plan.md](./docs/p0-plan.md).
- **One-click initialisation**: an uninitialised directory gets an "Initialise index" button on the card that runs `codegraph init` (two-step confirm) — `index` / `sync` both require the project to be initialised first.
- **Two systemPrompt sections with deliberately unequal gates**: `plugin:dsh-codegraph` (order 150, ≤70 characters: only "this machine has the plugin, point the user at the card") and `plugin:dsh-codegraph:usage` (order 151, ≤600 characters: when to use it / the two entry points / what to do on failure). The announcement block is gated **only** by the `announceToAgent` switch — it is about the card, and the card routes are registered unconditionally, so it keeps being injected while the CLI probe is pending or failing; the usage block needs `CLI probe available && usageGuidance && effective path indexed` all three. Both switches write the settings namespace and add/remove the sections live.

![Codegraph console: target project, 8-cell index status with a header refresh, maintenance actions tiered by kind, search & query with a tabbed result area, agent integration](https://cdn.jsdelivr.net/gh/hyzyn/dsh-plugin-kit@main/docs/dsh-plugin-kit-codegraph.png)

## Why the MCP working directory is managed

DSH's MCP client does not declare the MCP roots capability, so `codegraph serve --mcp` can only search upward
for `.codegraph/` from its **process working directory**; when `dsh web` is started from the home directory,
model calls to `mcp__codegraph__*` always return `No CodeGraph project is loaded for this session.`. The plugin
therefore manages one codegraph MCP server row in `~/.dsh/cordis.patch.yml` (`codegraph serve --mcp`, cwd = the
default project path) and rewrites it whenever the default project changes; watchUserPatches then hot-reloads it
onto the new project. Details:

- It prefers reusing an existing codegraph row in the `@hyzyn/dsh-mcp` managed block (only the cwd is filled in; other fields, including the disabled state, are untouched) and only writes its own block otherwise, avoiding a serverName collision; manual rows outside the block are only detected, never touched. A target path is only managed when it holds a **real index** (a `.db` inside `.codegraph/`): bare directory existence mistakes the CLI's own install data `~/.codegraph` for a project index, and when that happens the plugin leaves the existing cwd alone, creates no row, and shows the one-click fix on the card.
- Multiple projects: one server mounts one default project at a time, and other indexed projects are queried with `projectPath` or switched to from the card. Follow semantics: the cwd is the session directory when following is on and that directory holds a valid index, otherwise the pinned path; following is reported by the **browser half**, so it only works while a GUI page is open. Turn it off with `mcpIntegration: false` (which reverts the managed row). Full mechanism: [docs/p0-plan.md](./docs/p0-plan.md).

## CLI surface

The card covers `status` / `query` / `callers` / `callees` / `impact` / `node` / `sync` / `index` / `init`, plus:

- **`explore`** (the same output as the MCP `codegraph_explore` tool), **`context`** (assembles context for a **task**, as opposed to `explore`'s area focus), **`files`** (the file structure inside the index: language / symbol count / size).
- **`affected`**: maps changed files back to the **tests they affect**; the plugin **deliberately does not guess the change list** (it does not read `git status` and does not guess editor state).
- **`uninit`**: deletes `.codegraph/` (the inverse of `init`, the card's second destructive action, behind a two-step confirm). **`-f` is mandatory**: without it the CLI asks `Continue? (y/N)` and the runner has no TTY, so it reads EOF and aborts without deleting.
- **`telemetry`**: a read-only relay of the upstream anonymous-usage status; **deliberately no toggle** (that is the user's global preference, owned by the CLI's own `telemetry on|off`).
- **Query-parameter panel**: `query -k/--kind` (a kind filter) and `callers|callees -l/--limit` (the CLI defaults to 20, truncating large symbols).

`kind` is **free text** rather than a dropdown enumeration: when upstream adds a new kind the plugin does not have to change, and a wrong value simply gets an empty result back.

## Project list (one-click switch)

One codegraph MCP server mounts one project at a time, so *switching projects* is a frequent action: `GET /projects` plus a row of pill buttons on the card solves it. Candidates use **in-scope data sources only**: the active sessions' `header.cwd` from the host's `sessions.list()` plus paths the plugin observed itself (`/follow` reports, directories whose `/status` was queried, the current default project); it **deliberately does not read `~/.dsh/sessions/`** (DSH's internal storage format — parsing it would silently break when the format changes). Every candidate recomputes `locateIndex` live: only a **real index** qualifies as a switch target; unindexed ones are still listed but **disabled**. The list is sorted by most recently seen, capped at 50 entries, and switching reuses the "Set as default project" chain (persist `defaultPath` → turn following off → hot-switch the MCP).

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
| `/api/dsh-codegraph/index` | POST | Full rebuild `{ path }` (requires the project to be **already initialised**, see below) |
| `/api/dsh-codegraph/init` | POST | Runs `codegraph init` in a **not yet initialised** directory (creates `.codegraph/` plus the initial index) and then recomputes the managed MCP row; returns 409 for an already-indexed directory |
| `/api/dsh-codegraph/default-path` | GET | Pinned `defaultPath` + `effectivePath` + `sessionPath` + `followSession` + prompt toggles + `cliAvailable` / `cliProbeError` / `cliProbeAt` + MCP managed state `mcp` + **`mcpTools`** (`{ tools, reason, nextStep? }`: whether this session actually has `mcp__codegraph__*` — a managed row present does **not** mean tools exist; an empty `- insert: []` placeholder gets a reason and a next step) (`indexState` describes the **effective** path) |
| `/api/dsh-codegraph/follow` | POST | Report the active session directory `{ path }` (empty = no active session); the host aligns the managed cwd and falls back for unindexed directories |
| `/api/dsh-codegraph/settings` | POST | Write toggles `{ announceToAgent?, usageGuidance?, mcpIntegration?, followSession? }` (booleans) and `{ mcpScope? }` (`'managed'` / `'per-agent'`, 400 otherwise), effective immediately |
| `/api/dsh-codegraph/agents` | GET | Per-agent MCP mount ledger `{ mode, requested, effective, reason, fallback, mounted, live, agents }` — which agents mounted, on which index root, and why not (read-only) |
| `/api/dsh-codegraph/default-path` | POST | Set as default project `{ path }` (requires an index database inside `.codegraph/`), hot-switches the MCP at the same time |
| `/api/dsh-codegraph/reprobe` | POST | Re-runs the `<command> --version` probe, returns `{ cliAvailable, cliProbeError, cliProbeAt }` and refreshes the systemPrompt gate |
| `/api/dsh-codegraph/files` | GET | File structure `{ path, files, raw }` (`codegraph files --json`); knobs `filter` / `pattern` / `maxDepth` |
| `/api/dsh-codegraph/affected` | GET | Affected tests `{ path, affected, raw }` (`codegraph affected --json -- <files…>`); `files` may repeat |
| `/api/dsh-codegraph/explore` | GET | Exploration `{ path, query, output }` (`codegraph explore`, same output as the MCP `codegraph_explore` tool, markdown); knob `maxFiles` |
| `/api/dsh-codegraph/context` | GET | Task context `{ path, task, output }` (`codegraph context`, markdown); knob `maxNodes` |
| `/api/dsh-codegraph/uninit` | POST | **Deletes `.codegraph/`** `{ path }` (`codegraph uninit -f`); 409 for an unindexed directory; undoes the index **root** |
| `/api/dsh-codegraph/telemetry` | GET | Read-only relay of upstream anonymous-usage telemetry status `{ enabled, output }` |
| `/api/dsh-codegraph/projects` | GET | Known-projects list `{ projects, indexedCount, effectivePath }` — candidates come from live sessions plus paths the plugin observed (`/follow` reports, directories whose `/status` was queried, the default project), each re-checked for index state; monorepo subdirectories collapse to the index root |
| `/api/dsh-codegraph/unlock` | POST | Clears stale lock files blocking indexing `{ path }` (`codegraph unlock`; idempotent — exits 0 when there is no lock) |
| `/api/dsh-codegraph/cancel` | POST | Cancels in-flight CLI calls `{ path? }` (omit = cancel all); a disconnecting page also aborts its call |
| `/api/dsh-codegraph/diagnose` | GET | Collects a diagnostics bundle `{ path?, report }`: `report` is plain text covering versions/platform, the raw CLI probe failure, index state, the managed row plus the **redacted** patch blocks, the `~/.codegraph` daemon registrations and log tail, the most recent CLI failure, and the adoption rate |
| `/api/dsh-codegraph/metrics` | GET | Adoption rate `{ path? }`: without `path` returns every project as `{ summaries, since }`; with `path` returns `{ project, summary, text, since }` for that project |

`mcp` is an **on-disk snapshot** (it never guesses the next write): `mode` / `cwd` / `disabled` / `indexed` / `cwdExists` plus `note`. The two known empty states explain themselves through `note` — an `- insert: []` placeholder with an unindexed default project reports "no indexed default project… set one and it will be written automatically", while per-agent reports "the managed row is suspended (tools mount per agent)"; when a real row is managed no `note` is written (cwd / disabled already say it all, and a repeat on every refresh would just be noise).

All routes are loopback-only, to prevent remote access. `diagnose` is GET-only (read-only), but it may run a probe, so it is never reachable as a side effect of a write path.

Redaction policy for the diagnostics bundle: `~/.dsh/cordis.patch.yml` is shared by every MCP server, so other entries may carry credentials under `headers` / `env`. The report therefore excerpts **only the two codegraph-related blocks** (this plugin's block and the dsh-mcp card block) and redacts **by key name**: `id` / `name` / `serverName` / `transport` / `command` / `args` / `cwd` / `disabled` keep their values (exactly what you need for diagnosis), every other key becomes `<redacted>`, and a sensitive key such as `headers:` / `env:` taints its whole subtree (the `authorization:` value is wiped while its name stays). Newly added fields are redacted by default (fail-closed).

## Adoption metrics

The adoption row on the card answers the question that comes *after* configuration: once it is set up, does the model actually use it?

- **Source**: the host's existing `session/event` stream (counting `tool/call` only — the same public subscription surface `dsh-agent-instructions` and `dsh-acp` use). `tool/result` is deliberately not counted: adoption asks whether the model *wants* to use it, and a failed call still counts as wanting to (whether it worked is answered by the diagnostics bundle).
- **Numerator/denominator (two denominators; the narrow one is primary)**: `codegraph` matches `mcp__codegraph__*`; the **narrow** denominator is *discovery* calls (`grep` / `glob` / `search` / `find` / `list_dir`) and the **wide** one additionally includes `read` / `view` / `open`. Both are reported because `read` is mostly "open the file I already know I need to change" while codegraph replaces *finding things*, so counting `read` in the primary denominator would pin the number in the single digits forever.
- **`bash` / media / network tools are excluded from the denominator**: running tests, installing deps and git have nothing to do with code exploration, and `read_image` / `read_pdf` / `web_search` are the same. **The measured numbers and the tradeoffs between the two denominators are in [docs/adoption-audit.md](./docs/adoption-audit.md)**.
- **A zero denominator reads "no exploratory calls yet", not 0%** ("never explored" and "explored but grepped everything" are different facts); **the project key is the index root** (`resolveIndexedRoot` — the same criterion as the managed row's cwd and the injection gate), so several sessions in one repository merge into one row. Unindexed projects are recorded too, but the wording states that the number says nothing about prompt effectiveness, and `/metrics` reports `grouped.indexed` / `grouped.unindexed` subtotals.
- **In-memory only; a host restart resets it**, and `since` reports the starting point honestly (an observation, not an audit log — persisting would leave tool names and project paths on disk). The same data also goes into the diagnostics bundle (`/diagnose`), because the first thing to separate when someone reports "codegraph doesn't seem to help" is "the model never used it" from "it used it and the results were wrong".

Request semantics (since v0.4.2):

- **POST routes answer 400 for malformed / oversized / non-object bodies** — an unreadable body is never treated as "no path given" and silently executed against the default project.
- **Paths must exist and be directories**: `status` / `query` / `callers` / `callees` / `impact` / `node` return 400 for a nonexistent path (the CLI exits 0 with empty results there, which reads like "no matches"); `--limit` / `--depth` accept positive integers only (`limit` is capped at 10000; `depth`'s upper bound is clamped by the CLI itself to 10).
- **Ancestor semantics**: `POST /default-path` binds the **repository root that holds the index** when invoked on a monorepo subdirectory; `/init` on such a subdirectory answers 409 (the ancestor already has an index, avoiding a nested one); `/follow` rejects reports of nonexistent directories.

## Compatibility (DSH / codegraph CLI)

- **DSH**: **eleven supported tiers**: `0.1.7-rc.2`, `0.2.0-rc.1`, `0.2.0-rc.2`, `0.2.1-alpha.1`, `0.2.1-alpha.2`, `0.2.1-alpha.5`, `0.2.1-rc.1`, `0.2.1-rc.2`, `0.2.1-rc.3`, `0.2.1-rc.4`, `0.2.1-rc.5`. **`0.2.1-alpha.5` is the only tier that carried real host behaviour changes** (evaluator field name, how `engines.dsh` is read, credential precedence, the macOS picker); `0.2.0-rc.1` is the only tier that needed a **range boundary** added; every other tier is either zero-diff or merely a range-coverage matter.
  - **Per-tier evidence does not live here**: how each tier was verified, the measurements, the API-surface diffs and the "not run" lists are in the [ROADMAP § completed](./ROADMAP.md#已完成042-之后的工作树) section "host cohort 逐档实测证据" (Chinese). README keeps the declaration only; the same fact written out twice is debt (see [docs/conventions.md](../../docs/conventions.md#文档分层)).
  - **`0.1.6-alpha.2` / `0.1.5-rc.2` / `0.1.0-rc.7` (historical baselines, no longer supported)**: those tiers used the old `register(ns, schema)` API for `settings`, which the 0.1.7 line replaced with `SettingsForms`; the `peerDependencies` floor `^0.1.7-rc.2` also makes a new host refuse to load it onto an old one. Their evidence stays in git history for reference only.
  - `package.json` declares `peerDependencies: { "@deepseek-ai/dsh": "^0.1.7-rc.2 || ^0.2.0-rc.1 || ^0.2.0-rc.2 || ^0.2.1-alpha.1 || ^0.2.1-alpha.2 || ^0.2.1-alpha.5 || ^0.2.1-rc.1 || ^0.2.1-rc.2 || ^0.2.1-rc.3 || ^0.2.1-rc.4 || ^0.2.1-rc.5" }` (with `optional` in `peerDependenciesMeta`, purely to quiet pnpm's unmet-peer noise). From DSH 0.1.7-rc.1 on, compatibility is judged from it **before install** and **at startup**: an incompatible pair throws `incompatible-version`, and at startup the whole row is `disabled` (an incompatible bundle is skipped outright). `dsh.engines.dsh: ">=0.1.7-rc.2"` is kept as the **market display slot** (the host does not read it; the market resolver accepts one segment only, so it carries the lowest cohort), and `scripts/check-dsh-peers.mjs` asserts the peer floor agrees with it.
  - **Why peer rather than `engines.dsh`**: `dsh-app-boot` walks only `peerDependencies` entries named `@deepseek-ai/dsh` or starting with `@deepseek-ai/dsh-`, judging them with `semver.satisfies(runtime, range, { includePrerelease: true })`. `engines.dsh` is still declared — the host does not read it, but the plugin market / community entries display compatibility from it (the resolver only accepts `>=X.Y.Z[-prerelease]`; an `||` range is judged "unverifiable" and fails closed), and it agrees with the peer floor.
  - **Why the range has multiple segments**: with prereleases taking part in matching, `^0.1.7-rc.2` = `>=0.1.7-rc.2 <0.2.0-0` — a single segment kills the whole 0.2 line. The later segments declare each adapted tier explicitly (this repo's rule is "declare every cohort you adapt to and leave the measured evidence"; `RELEASING.md`'s tier rule states that "zero difference is the norm, not the definition"). Matching any segment admits the host, and all eleven tiers' API surfaces have been compared file by file (evidence in ROADMAP's cohort section). To temporarily admit another combination, write the exemption into the profile's own `compatibility.json` (`dsh plugin --profile <p> allow-version <pkg@ver> --dsh-version <ver> --accept-risk`) rather than adding segments ad hoc — every added segment must be a cohort that was really tested and whose API surface was compared.
- **Codegraph CLI**: version matrix — the full chain has been verified on `1.5.0` (macOS) and `1.6.0` (Windows / macOS); the subcommands used are `status` / `query` / `callers` / `callees` / `impact` / `node` / `sync` / `index`, with every flag checked one by one. `codegraph serve --mcp` still works (it is not listed in the top-level help, but `codegraph serve --help` has it), so the managed row needs no change. Re-verify after upgrading the CLI: flags such as `-y` are version-dependent (this plugin deliberately omits it, see below).
- **URL shape of the browser half**: DSH currently goes through client-modules' combo route, so the single-package direct link `/plugins/@hyzyn/dsh-codegraph/client.js` is no longer directly usable; the browser only uses `/plugins/??<id>/client.js&rev=…` handed down by the boot graph (`window.__DSH_BOOT__`), and the plugin side needs no change.
- **Operating systems**: Windows / macOS / Linux run the same code path, and CI is a three-platform matrix (`pnpm -r build` + `typecheck` + `test`).
  - **Windows**: the CLI goes through `%COMSPEC% /d /s /c` with cmd escaping (a global npm / pnpm install only ships a `.cmd` shim, which `execFile` cannot start directly — `ENOENT`); a timeout kills the whole tree with `taskkill /pid <pid> /T /F`, **including the grandchild CLI inside the shim** (killing only cmd.exe lets a large `index` run to completion); rewriting the patch file keeps the file's own line endings (a CRLF file is not turned into mixed endings, and a rewrite does not change the line count).
  - **`index` will not initialise for you**: `codegraph index --help` says "same result as a fresh init", but that describes the **result of a full rebuild** being equivalent to a fresh init — not that `index` performs initialisation. On a directory without `.codegraph/`, both `index` and `sync` fail with `CodeGraph not initialized in <path>` plus `Run "codegraph init" first`. The card's "Initialise index" button therefore uses `init`.
    - Arguments are fixed to `init -- <path>`: **`-y` is not passed** (it only exists in CLI 1.6.0; 1.5.0 fails with `error: unknown option '-y'`; omitting it does not hang either, since the runner has no TTY and both versions take the defaults). **`-f` is deliberately not passed** (the CLI uses it to guard against initialising your home directory or a filesystem root, and the plugin should not bypass that). This is the plugin's **only** action that writes into the user's project: it creates `codegraph.db` and a self-ignoring `.gitignore` (containing `*` and `!.gitignore`) under `.codegraph/`, **touches no source file and does not modify the project's root `.gitignore`**; `codegraph uninit` removes it entirely. The card uses a two-step confirm and it is **never triggered automatically**.
    - `init` / `index` trigger the codegraph CLI's own anonymous usage statistics (disable with `codegraph telemetry off` or `CODEGRAPH_TELEMETRY=0`). The plugin does not change that switch — it is the user's preference.
  - **PATH**: both the probe and the calls use the plugin's `command` config (default `codegraph`, resolved through PATH). When the host is started from an entry point that does not inherit the shell environment (Dock / Start menu), the CLI may be missing from PATH — the usage block is not injected (the announcement block stays) and the card cannot resolve a working command. **PATH is read once, when the host process starts**, so two fixes: point `command` at the CLI's absolute path (editing the profile patch triggers a hot reload and re-probes), or restart the host from a freshly opened terminal; afterwards click **re-probe** on the card (`POST /reprobe`) to confirm in place, and the card shows the **actual** probe failure (`spawn codegraph ENOENT`, a non-zero exit's stderr, a timeout).
    - On Chinese (and other non-UTF-8 code-page) Windows, the CLI and cmd.exe write stderr in the console code page; the plugin decodes it with the `@hyzyn/dsh-kit` tolerant decoder (UTF-8 first, falling back to the code page on invalid bytes), so the card shows the original Chinese instead of `���`.
    - **MCP row**: `dsh-mcp-client` uses the official SDK's `StdioClientTransport` (which depends on `cross-spawn`), resolving `.cmd` shims on Windows itself, so the managed row needs no platform branch. The upstream CLI ships official builds for all three platforms × x64/arm64; the plugin's index detection only looks for a `*.db` under `.codegraph/` rather than a fixed filename.

## Development

```bash
pnpm --filter @hyzyn/dsh-codegraph build
pnpm --filter @hyzyn/dsh-codegraph typecheck
pnpm test                                   # repository-wide vitest (or: vitest run packages/codegraph)
pnpm --filter @hyzyn/dsh-codegraph test     # this package only (managed-row matrix + CLI knobs + route regressions)
node packages/codegraph/scripts/preview-card.mjs        # render the card preview HTML into .preview/ (--png needs a normal terminal: Chrome cannot start under a restricted sandbox)
                                                        # also --per-agent / --fallback: view the per-agent "active" and "fell back to managed" states offline
node scripts/verify-codegraph-indexforce.mjs --profile test --port 3086   # live end-to-end: does indexForce really spawn with --force (requires a local DSH)
node scripts/verify-codegraph-host-contract.mjs --profile test --port 3087  # live end-to-end: host contract green (routes + gates + served artifact + managed row + per-agent mode switch; counts as reported by the script); needs a local DSH
```

### per-agent: three layers of acceptance

Each layer proves one thing; missing a layer leaves a real gap uncovered:

| Script | Layer | What it proves |
| --- | --- | --- |
| `verify-codegraph-agent-scope.mjs` | mechanism | Minimal Cordis root: scopes can mount mcp-client, the same `serverName` does not collide across scopes, the global layer stays clean, disposal reclaims only its own |
| `verify-codegraph-host-contract.mjs` | routes / switch | Real host: all routes, `mcpScope` switching, the global managed row getting suspended and restored, real patch byte-identical |
| `verify-codegraph-agent-integration.mjs` | **integration** | Mounts the **real plugin**, drives a real `agent/created` through the real `AgentRegistry`, and asserts the tool lands on **that agent**, that an unindexed agent is not mounted, and that `agent/disposed` reclaims it |

The third layer was added because the first two being green still could **not** prove "MCP actually mounts when a user opens a session" (the mechanism script uses fake agents; the host script's host never creates an agent). All three build their own temp projects, reclaim their own child processes, and assert the real `~/.dsh/cordis.patch.yml` is byte-identical; the latter two also give the system under test an isolated `DSH_HOME` (without isolation the plugin writes straight into the user's real config, CG45).


The browser half's source lives in `client-src/index.js`; `build` produces the package-root `client.js` via `scripts/build-client.mjs` — it drops index.js's import of `client-src/pure.js` and inlines pure.js (the DOM-free logic, unit-tested directly in `test/client-pure.test.ts`) into the factory with its `export` prefixes stripped, so the artifact stays a single import-free file. CI's artifact diff gates on byte-for-byte equality, so editing the source without rebuilding turns CI red.

After upgrading the local DSH, re-link first and then typecheck — otherwise `packages/*/node_modules/@deepseek-ai/*` is still the old copy from the repository's
`.pnpm`, and the plugin and the host each hold a different version of the library, so compatibility problems are masked:

```bash
node scripts/link-dsh-runtime.mjs     # link packages/*'s @deepseek-ai/* and @hyzyn/dsh-kit to the dsh runtime / this repository's workspace
```

Planning and defect records (neither ships with the package; both are Chinese-only and live in the repository, hence absolute links):

- [DEFECTS.md](https://github.com/hyzyn/dsh-plugin-kit/blob/main/packages/codegraph/DEFECTS.md): the defect number dictionary — an index of `CG01`–`CG73` (symptom + fix / design intent); the full write-ups, acceptance records and the raw backlog are frozen in git history (see its §4).
- [ROADMAP.md](https://github.com/hyzyn/dsh-plugin-kit/blob/main/packages/codegraph/ROADMAP.md): enhancement roadmap — P0–P3 tiers, cost, architectural items (per-agent mount / adoption metrics / diagnostics bundle) and the suggested order of work.
- [docs/p0-plan.md](https://github.com/hyzyn/dsh-plugin-kit/blob/main/packages/codegraph/docs/p0-plan.md): the full plan and measurements for per-agent scoped MCP mounting (the design doc of a shipped item, **moved into the package's `docs/`**).
- [docs/adoption-audit.md](https://github.com/hyzyn/dsh-plugin-kit/blob/main/packages/codegraph/docs/adoption-audit.md): adoption measurements — the numbers computed from 177 real historical sessions, the tradeoffs between the two denominators, and what they imply for the roadmap (**moved into the package's `docs/`**).

## Install into DSH

```bash
dsh plugin --profile web add link:$(pwd)
```

## Configuration

Where the settings surface lives changes with the DSH version, but it is **always the same form** — the
per-generation landing spots and the four registration contracts live in
[conventions.md § client settings surface](../../docs/conventions.md#客户端设置面内联优先).

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
  /** Whether the managed row's cwd follows the active session. On by default; "Set as default project" turns it off. Meaningless while `mcpScope: 'per-agent'` is in effect. */
  followSession?: boolean
  /**
   * MCP mounting mode, default `'per-agent'`.
   * - `'managed'`: a single managed row plus session-driven hot switching; that row lives in the root
   *   scope, so sessions without an index inherit it too (semantics drift with the global cwd).
   * - `'per-agent'`: each agent mounts its own dsh-mcp-client in its own scope, cwd = that
   *   session's index root; a session with **no usable index is not mounted** (no fallback).
   * When a precondition fails (no agent event surface / a hand-written codegraph row outside the
   * managed blocks / the MCP master switch off) it falls back to managed and says so on the card,
   * never silently. Roll back by writing `'managed'` explicitly. Cost: one child process per
   * indexed session (~40MB).
   */
  mcpScope?: 'managed' | 'per-agent'
  /** Timeout in milliseconds for query commands (status/query/callers/callees/impact/node). Defaults to 60000; 0 = unlimited. */
  cliTimeoutMs?: number
  /** Timeout in milliseconds for index commands (sync/index). Defaults to 600000; 0 = unlimited. */
  indexTimeoutMs?: number
  /** Append `--force` to `codegraph index` (used when the CLI refuses to index a home directory / filesystem root). Off by default. */
  indexForce?: boolean
  /**
   * **Automatically rebuild** when a stale index is detected (checked on the first `user/message` of a
   * `session/event`, at most once per project per host run). Off by default. The semantics are rebuild,
   * not sync: measured, `codegraph sync` answers `Already up to date` for an "extractor version behind"
   * signal and does not clear it.
   */
  autoReindex?: boolean
}
```

`defaultPath` / `mcpIntegration` / `followSession` / `mcpScope` / `announceToAgent` / `usageGuidance` saved in the `codegraph` settings namespace take precedence over the plugin config: “Set as default project” writes `defaultPath` and turns `followSession` off, and the remaining checkboxes plus the mode switch write the rest (`POST /api/dsh-codegraph/settings`).

`command` / `cliTimeoutMs` / `indexTimeoutMs` / `indexForce` are **install-level knobs**: they only read the plugin config and never enter the settings namespace. Just override them by id in the profile patch, for example:

```yaml
- id: codegraph
  config:
    indexTimeoutMs: 1800000
    indexForce: true
```

When a timeout is hit, the error shown in the card names the corresponding config option (`cliTimeoutMs` / `indexTimeoutMs`) directly, so you do not have to dig through logs.

## System prompt

After installation, two prompt sections are injected into systemPrompt automatically (at most ~220 tokens in total):

- `plugin:dsh-codegraph` (order 150): the capability announcement (Chinese, ≤70 characters) — only that this machine has the plugin and that the model should point the user at the card when they mention code graphs / indexes / call chains; which buttons the card has is UI detail and does not spend model context.
- `plugin:dsh-codegraph:usage` (order 151): the CodeGraph usage guideline (the CODEGRAPH_START block, ≤600 characters). **DSH's MCP client never reads `instructions`**, so this block fills the role upstream assigns to `CODEGRAPH_INSTRUCTIONS_BLOCK`, plus three things: **when to use it** (`.codegraph/` must contain an index database), **the two entry points** (the MCP tool, and the shell fallback whose command name renders from the `command` config with `--path` for another project), and **what to do on failure** (fall back to normal search; never run `codegraph init` for the user).

The two sections sit behind **deliberately unequal** gates:

1. **Toggles**: the card's two checkboxes write the settings namespace (`POST /api/dsh-codegraph/settings`) and add/remove the sections immediately; installation-level config can also disable them (`announceToAgent: false` / `usageGuidance: false`). This gate applies to both sections.
2. **CLI probe (usage block only)**: `<command> --version` runs once at mount; while it is pending or after it fails the usage block is not injected (a `console.warn` carries the failure text) — the prompt never advertises a capability that cannot work. **The announcement block does not follow it**: the card routes are registered unconditionally, and swallowing the announcement while the probe is pending means "the card is usable but the model does not know it exists". The result is not latched: the card's re-probe button or `POST /reprobe` re-runs it and refreshes both sections immediately.
3. **Index gate (usage block only)**: the usage guideline is injected only when the effective path (`effectivePath`) is a **valid index** — the same `indexState` criterion the host uses, where the mere existence of `.codegraph/` does not count. An unindexed repository therefore spends none of those 600 characters and the model is not pushed toward a tool that must fail; the criterion is recomputed on every `refreshGuidance`. **The announcement block is exempt**.
