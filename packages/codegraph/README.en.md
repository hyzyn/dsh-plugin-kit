# @hyzyn/dsh-codegraph

[中文](README.md) | English

> The “Codegraph” card under DSH **Settings → Plugins**: it brings code-graph status, symbol search, and call chains into the GUI, and aligns the project directory of the codegraph MCP server for you.

## Features

- **`status --json` fields laid out per section**: `initialized` / `version` / `projectPath` / `fileCount` / `nodeCount` / `edgeCount` / `lastIndexed` / `pendingChanges` / `languages` / `dbSizeBytes` render as cells with the raw JSON behind a `<details>`; a symbol drill-down returns its line-numbered verbatim source plus `callers` / `callees` / `impact` lists. The CLI's staleness signals (`reindexRecommended` / `builtWithVersion` / extractor version gap / `worktreeMismatch`) surface as a warning line with "rebuild index" flagged as the suggested action.
- **Two index paths, two timeout buckets**: `sync -- <path>` incremental and `index [--force] -- <path>` full rebuild run on `indexTimeoutMs` (600 s, `0` = unlimited); `status` / `query` / `callers` / `callees` / `impact` / `node` run on `cliTimeoutMs` (60 s, `0` = unlimited). Timeout and cancellation both follow a "SIGTERM → 3 s grace → SIGKILL" process-group escalation on every platform; index-class operations get a Cancel button on the card, and closing the page aborts the CLI too.
- **Managed MCP server row**: dsh-mcp-client declares no MCP roots, so `codegraph serve --mcp` resolves `.codegraph/` upward from `process.cwd()` only; the plugin maintains the `@deepseek-ai/dsh-mcp-client` row in `~/.dsh/cordis.patch.yml` with `config.cwd`, and the rewrite hot-loads through watchUserPatches to rebuild the MCP connection. One server mounts one project at a time; other projects are queried with `projectPath`.
- **Index detection reads `.codegraph/*.db` and walks upward like the CLI**: from the target directory up (stopping at the git root) it looks for the first `.codegraph/` holding an index database; the hit root is the project root, so sessions in monorepo subdirectories are no longer misread as "unindexed". Directory existence alone mistakes the CLI's own install dir `~/.codegraph` for a project index, dropping the managed row on an unindexed cwd — measured there, `codegraph_explore`'s required grows from `["query"]` to `["query","projectPath"]`. Anything short of a real index leaves the existing cwd untouched, and the card reports `indexState` plus the reason.
- **Write discipline**: every write to `~/.dsh/cordis.patch.yml` is re-verified against an mtime+size stamp (the same CAS as dsh-mcp, at most 3 re-reads); when reusing the dsh-mcp block only the codegraph row's own `cwd:` line is changed in place, leaving the block's comments, its other server rows and the loader's legitimate override entries byte-identical; if the block is corrupt it refuses to append a second one (a serverName collision would break codegraph MCP loading wholesale) and reports the reason on the card.
- **The managed row's cwd follows the active session**: `followSession` (on by default) aligns the row when a session switches to a project with a valid index, otherwise falls back to the pinned path; "Set as default project" writes that path into the `codegraph` settings namespace and sets `followSession` false (an explicit pin beats session following). A failed session report retries with backoff instead of being silently lost forever.
- **Optional per-agent MCP isolation** (`mcpScope: 'per-agent'`, default `'managed'`): in the default mode **one** MCP server time-shares across all projects (via `projectPath` and session following). With per-agent enabled, each agent mounts its own `dsh-mcp-client` inside **its own Cordis scope**, with `cwd` pinned to the index root of *that* agent's session directory — parallel multi-project work no longer shares a single global cwd, and the whole "write patch → hot reload → rebuild connection" chain disappears; the global managed row is **suspended** (`disabled: true`, restored automatically when you switch back to managed). The cost is one child process per agent (measured ~40MB idle Node baseline). An agent whose session directory has **no usable index is not mounted at all** (rather than falling back to the default project) — otherwise it would inherit another project's context, the exact class of error that gets claimed-but-not-implemented. Mechanism measurements and tradeoffs: [P0-PLAN.md](./P0-PLAN.md).
- **One-click initialisation**: an uninitialised directory gets an "Initialise index" button on the card that runs `codegraph init` (two-step confirm) — `index` / `sync` both require the project to be initialised first, and this was the last step that still forced users back to a terminal.
- **Two systemPrompt sections, switches and gating independent**: `plugin:dsh-codegraph` (order 150) and `plugin:dsh-codegraph:usage` (order 151), both behind a `<command> --version` probe; `announceToAgent` / `usageGuidance` add or remove the sections live through the settings namespace.

![Codegraph console: target project, 8-cell index status with a header refresh, maintenance actions tiered by kind, search & query with a tabbed result area, agent integration](https://cdn.jsdelivr.net/gh/hyzyn/dsh-plugin-kit@main/docs/dsh-plugin-kit-codegraph.png)

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

## CLI surface

The card used to cover only `status`/`query`/`callers`/`callees`/`impact`/`node`/`sync`/`index`/`init`; every other subcommand meant going to a terminal. The **flagship and everyday** ones are now covered too:

- **`explore`**: the same output as the MCP `codegraph_explore` tool (relevant symbol source plus call paths). The model reached this through MCP while a human on the card could not get at the same capability — a bit absurd, and now fixed.
- **`context`**: assembles context for a **task** (as opposed to `explore`, which targets an area).
- **`files`**: the file structure inside the index (language / symbol count / size).
- **`affected`**: maps changed files back to the **tests they affect** (measured in this repo: touching `src/index.ts` → 5 test files). Useful precisely for "I changed this, which tests should I run". The plugin **deliberately does not guess the change list for you** (it does not read `git status` and does not guess editor state): where the list of files to test comes from is an upstream concern, and the card only hands the list you give it to the CLI.
- **`uninit`**: deletes `.codegraph/` — the inverse of `init`, and the card's second destructive action, likewise behind a two-step confirm. Measured: **`-f` is mandatory** — without it the CLI asks `Continue? (y/N)`, and the runner has no TTY, so it reads EOF and aborts without deleting (safe but useless); the card therefore owns the confirmation.
- **`telemetry`**: a read-only relay of the upstream anonymous-usage telemetry status. **Deliberately no toggle** — that is the user's global preference (`~/.codegraph/telemetry.json`, owned by the CLI's own `telemetry on|off`), and flipping it for them would mean overreaching into someone else's global setting.
- **Query-parameter panel**: `query -k/--kind` (a kind filter) and `callers|callees -l/--limit` (the CLI defaults to 20, which truncates large symbols and the card had no way to know).

`kind` is **free text** rather than a dropdown enumeration: when upstream adds a new kind the plugin does not have to change along with it, and a wrong value simply gets an empty result back from the CLI.

## Project list (one-click switch)

One codegraph MCP server mounts one project at a time, so *switching projects* is a frequent action — and the card used to require typing an absolute path by hand. `GET /projects` plus a row of pill buttons on the card solves it.

Candidates use **in-scope data sources only**: the active sessions' `header.cwd` from the host's `sessions.list()`, plus paths the plugin observed itself (`/follow` reports, directories whose `/status` was queried, the current default project). It **deliberately does not read `~/.dsh/sessions/`** — that does hold historical project paths, but in DSH's internal storage format (session bucket names are path-encoded, logs are multi-frame zstd), so parsing it would silently break the day DSH changes that format; measured, decoding 51 directories from bucket names got **not a single one right**. Better a few projects short of the user's memory than a list that is right only sometimes.

Every candidate recomputes `locateIndex` live: only a **real index** qualifies as a switch target; unindexed ones are still listed but **disabled** (a user wants to know "this project is not indexed yet") and clicking them does nothing. The list is sorted by most recently seen, capped at 50 entries, evicting the least recently seen. Switching reuses the "Set as default project" chain (persist `defaultPath` → turn following off → hot-switch the MCP).

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
| `/api/dsh-codegraph/default-path` | GET | Pinned `defaultPath` + `effectivePath` + `sessionPath` + `followSession` + prompt toggles + `cliAvailable` / `cliProbeError` / `cliProbeAt` + MCP managed state (`indexState` describes the **effective** path) |
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

All routes are loopback-only, to prevent remote access. `diagnose` is GET-only (read-only), but it may run a probe, so it is never reachable as a side effect of a write path.

Redaction policy for the diagnostics bundle: `~/.dsh/cordis.patch.yml` is shared by every MCP server, so other entries may carry credentials under `headers` / `env`. The report therefore excerpts **only the two codegraph-related blocks** (this plugin's block and the dsh-mcp card block) and redacts **by key name**: `id` / `name` / `serverName` / `transport` / `command` / `args` / `cwd` / `disabled` keep their values (exactly what you need for diagnosis), every other key becomes `<redacted>`, and a sensitive key such as `headers:` / `env:` taints its whole subtree (the `authorization:` value is wiped while its name stays). Newly added fields are redacted by default (fail-closed).

## Adoption metrics

The adoption row on the card answers the question that comes *after* configuration: once it is set up, does the model actually use it?

- **Source**: the host's existing `session/event` stream (counting `tool/call` only — the same public subscription surface `dsh-agent-instructions` and `dsh-acp` use). `tool/result` is deliberately not counted: adoption asks whether the model *wants* to use it, and a failed call still counts as wanting to (whether it worked is a different question, answered by the diagnostics bundle).
- **Numerator/denominator (two denominators; the narrow one is primary)**: `codegraph` matches `mcp__codegraph__*`; the **narrow** denominator is *discovery* calls (`grep` / `glob` / `search` / `find` / `list_dir`) and the **wide** denominator additionally includes `read` / `view` / `open`. Both are reported because in real history `read` accounts for 1956 calls against only 100 for `grep`, and `read` is mostly "open the file I already know I need to change" — codegraph replaces *finding things*, so counting `read` in the primary denominator would pin the number in the single digits forever (measured: 2.2% wide vs 28.8% narrow).
- **`bash` / media / network tools are excluded from the denominator**: most of what a model does with bash (running tests, installing deps, git) has nothing to do with code exploration, and `read_image` / `read_pdf` / `web_search` are the same (this bullet was added after measuring real history — see below).
- **Measured numbers: see [ADOPTION-AUDIT.md](./ADOPTION-AUDIT.md)**: traced back over 177 real historical sessions — 23% session-level, 28.8% narrow, 47% over the last three days — plus a quality sample of the `query` calls codegraph received (34/47 carried a concrete symbol name).
- **A zero denominator reads "no exploratory calls yet", not 0%**: "never explored" and "explored but grepped everything" are different facts.
- **The project key is the index root** (`resolveIndexedRoot`) — the same criterion as the managed row's cwd and the injection gate, so several sessions in one repository (new session, subagent, host restart) merge into one row instead of scattering into samples too small to mean anything. Unindexed projects are recorded too, but the wording states that the number says nothing about prompt effectiveness, and `/metrics` additionally reports `grouped.indexed` / `grouped.unindexed` subtotals — the model should not be using codegraph in an unindexed project at all, and mixing those into the overall figure would produce a meaningless number.
- **In-memory only; a host restart resets it**, and `since` reports the starting point honestly. Not persisting is deliberate: this is an observation for deciding whether to tune the prompt, not an audit log, and persisting would leave tool names and project paths on disk indefinitely.
- The same data also goes into the diagnostics bundle (`/diagnose`), because the first thing to separate when someone reports "codegraph doesn't seem to help" is "the model never used it" from "it used it and the results were wrong".

Request semantics (since v0.4.2):

- **POST routes answer 400 for malformed / oversized / non-object bodies** — an unreadable body is never treated as "no path given" and silently executed against the default project.
- **Paths must exist and be directories**: `status` / `query` / `callers` / `callees` / `impact` / `node` return 400 for a nonexistent path (the CLI exits 0 with empty results there, which reads like "no matches"); `--limit` / `--depth` accept positive integers only (`limit` is capped at 10000; `depth`'s upper bound is clamped by the CLI itself to 10).
- **Ancestor semantics**: `POST /default-path` binds the **repository root that holds the index** when invoked on a monorepo subdirectory; `/init` on such a subdirectory answers 409 (the ancestor already has an index, avoiding a nested one); `/follow` rejects reports of nonexistent directories.

## Compatibility (DSH / codegraph CLI)

- **DSH**: the host version matrix (every tier states **how it was verified** — do not dress a regression run up as a compatibility claim):
  - **`0.1.7-rc.1` (the current baseline, measured 2026-09-23)**: `node scripts/verify-codegraph-host-contract.mjs --profile test --port 3087 --dsh-bin <separately installed rc.1 dsh> --runtime-store <that install's .pnpm/node_modules/@deepseek-ai>` — **42/42 passed**: all 25 routes present (including `/projects`, `/metrics`, `/diagnose`, `/unlock`, `/files`, `/affected`, `/explore`, `/context`, `/uninit`, `/telemetry`, `/agents`), the POST and loopback gates hold, `/diagnose` output is complete in every section, the browser-half artifact is servable and carries the latest UI, the managed MCP row is written into the home patch according to the real index, and the `mcpScope` switch ("per-agent → the global row is suspended → back to managed restores it") is fully reversible with the real `~/.dsh/cordis.patch.yml` byte-identical. **Two new checks** specifically cover the 0.1.7 settings migration: switching `mcpScope` back to the managed baseline through the plugin's own write path after startup, and switching the default project to a temporary one — both must answer HTTP 200 (under the old API these two steps only produced 500s).
    - How to verify: if the machine's global dsh is not rc.1, point `--dsh-bin` at a separately installed rc.1 and use `--runtime-store` to re-point the **copied** temporary profile's `node_modules/@deepseek-ai/*` at that install's runtime — otherwise those links still point at the global old install, and the new cohort's compatibility preflight disables the whole old-runtime row as incompatible (the host then never starts at all, which has nothing to do with this plugin).
    - Another piece of live evidence already collected: starting the test profile with an isolated `DSH_HOME` (with the same runtime re-pointing) → all 10 plugins mounted, 0 lines of `disabling profile plugin row`, and `POST /api/dsh-codegraph/settings` answering 200 in both directions between `per-agent` and `managed`.
  - **`0.1.6-alpha.2` / `0.1.5-rc.2` / `0.1.0-rc.7` (historical baselines, no longer supported)**: those tiers still had the old `register(ns, schema)` API for the `settings` service, whereas the 0.1.7 line replaced it with `SettingsForms` (`describe/update` plus a volatile exported Config); this package's `peerDependencies` lower bound `^0.1.7-rc.1` also makes a new host refuse to load it onto an old one, both before install and at startup. The evidence collected for those tiers at the time (`0.1.6-alpha.2` 40/40, `0.1.5-rc.2` no script, `0.1.0-rc.7` audit baseline) stays in git history for reference only.
  - `package.json` declares `peerDependencies: { "@deepseek-ai/dsh": "^0.1.7-rc.1" }` (with `optional` in `peerDependenciesMeta`, purely to quiet pnpm's unmet-peer noise). From DSH 0.1.7-rc.1 on, compatibility is judged from this **before install** and **at startup**: an incompatible pair throws `incompatible-version` on install, and at startup the whole row is marked `disabled`. `dsh.engines.dsh: ">=0.1.7-rc.1"` is kept as well, as the **market display slot** (an rc.1 host does not read it — see the next bullet), and `scripts/check-dsh-peers.mjs` asserts that the two lower bounds agree.
  - **Why peer rather than `engines.dsh`**: 0.1.7-rc.1's `dsh-app-boot` walks only `peerDependencies` entries named `@deepseek-ai/dsh` or starting with `@deepseek-ai/dsh-`, judging them with `semver.satisfies(runtime, range, { includePrerelease: true })` (**prereleases take part in range matching**). **`engines.dsh` is still declared, though** — the host does not read it, but the plugin market / community entries display compatibility from it, so it is kept in the standard form `>=0.1.7-rc.1` (the market resolver only accepts `>=X.Y.Z[-prerelease]`) and made to agree with the peer lower bound. Evidence: `evaluatePluginCompatibility` in `dsh-app-boot/lib/index.js`, and the app-boot README's own wording that these checks use the peer declaration rather than `engines.dsh`.
  - **Why the range is `^0.1.7-rc.1`**: with prereleases taking part in matching, `^0.1.7-rc.1` = `>=0.1.7-rc.1 <0.2.0`, so `0.1.7` final and later `0.1.7-rc.N` / `0.1.8` all pass, while `0.1.7-alpha.2` and `0.1.6-*` do not — consistent with the "0.1.7-rc.1 and later only" policy. To temporarily admit another version combination, write the exemption into the profile's own `compatibility.json` (`dsh plugin --profile <p> allow-version <pkg@ver> --dsh-version <ver> --accept-risk`) rather than loosening the range here.
- **Codegraph CLI**: version matrix — the full chain has been verified on `1.5.0` (macOS) and `1.6.0` (Windows / macOS); the subcommands used are `status` / `query` / `callers` / `callees` / `impact` / `node` / `sync` / `index`, with every flag checked one by one. `codegraph serve --mcp` still works (it is not listed in the top-level help, but `codegraph serve --help` has it), so the managed row needs no change. Re-verify after upgrading the CLI: flags such as `-y` are version-dependent (this plugin deliberately omits it, see below).
- **URL shape of the browser half**: DSH currently goes through client-modules' combo route, so the single-package direct link `/plugins/@hyzyn/dsh-codegraph/client.js` is no longer directly usable; the browser only uses `/plugins/??<id>/client.js&rev=…` handed down by the boot graph (`window.__DSH_BOOT__`), and the plugin side needs no change.
- **Operating systems**: Windows / macOS / Linux run the same code path, and CI is a three-platform matrix (`pnpm -r build` + `typecheck` + `test`).
  - **Windows**: the CLI goes through `%COMSPEC% /d /s /c` with cmd escaping (a global npm / pnpm install only ships a `.cmd` shim, which `execFile` cannot start directly — `ENOENT`); a timeout kills the whole tree with `taskkill /pid <pid> /T /F`, **including the grandchild CLI inside the shim** (killing only cmd.exe lets a large `index` run to completion); rewriting the patch file keeps the file's own line endings (a CRLF file is not turned into mixed endings, and a rewrite does not change the line count).
  - **`index` will not initialise for you**: `codegraph index --help` says "same result as a fresh init", but that describes the **result of a full rebuild** being equivalent to a fresh init — not that `index` performs initialisation. On a directory without `.codegraph/`, both `index` and `sync` fail with `CodeGraph not initialized in <path>` plus `Run "codegraph init" first`. The card's "Initialise index" button therefore uses `init`.
    - Arguments are fixed to `init -- <path>`: **`-y` is not passed** — that flag only exists in CLI 1.6.0 and 1.5.0 fails with `error: unknown option '-y'`; omitting it does not hang either (the runner has no TTY, and both 1.5.0 and 1.6.0 were verified to take the defaults and finish). **`-f` is deliberately not passed** (the CLI uses it to guard against accidentally initialising your home directory or a filesystem root, and the plugin should not bypass that for the user).
    - This is the plugin's **only** action that writes into the user's project: it creates `codegraph.db` and a self-ignoring `.gitignore` (containing `*` and `!.gitignore`) under `.codegraph/`. It **touches no source file and does not modify the project's root `.gitignore`**; `codegraph uninit` removes it entirely. The card uses a two-step confirm and it is **never triggered automatically**.
    - `init` / `index` trigger the codegraph CLI's own anonymous usage statistics (upstream prints a notice; disable with `codegraph telemetry off` or `CODEGRAPH_TELEMETRY=0`). The plugin does not change that switch — it is the user's preference.
  - **PATH**: both the probe and the calls use the plugin's `command` config (default `codegraph`, resolved through PATH). When the host is started from an entry point that does not inherit the shell environment (Dock / Start menu), the CLI may be missing from PATH — neither prompt block is injected and the card cannot resolve a working command.
    - **PATH is read once, when the host process starts**, so refreshing the page or reopening the card cannot change it, and the host will not pick it up on its own. Two fixes: (1) point `command` at the CLI's absolute path (editing the profile patch triggers a hot reload and re-probes); (2) restart the host from a freshly opened terminal so the new environment block applies.
    - Afterwards, click **re-probe** on the card (`POST /reprobe`) to confirm in place — no host restart needed. The card shows the **actual** probe failure (`spawn codegraph ENOENT`, a non-zero exit's stderr, a timeout), which distinguishes "not installed" from "installed but off PATH".
    - On Chinese (and other non-UTF-8 code-page) Windows, the CLI and cmd.exe write stderr in the console code page; the plugin decodes it with the `@hyzyn/dsh-kit` tolerant decoder (UTF-8 first, falling back to the code page on invalid bytes), so the card shows the original Chinese instead of `���`.
  - **MCP row**: `dsh-mcp-client` uses the official SDK's `StdioClientTransport` (the SDK depends on `cross-spawn`), which resolves `.cmd` shims on Windows itself, so the managed row needs no platform branch.
  - The upstream CLI ships official builds for all three platforms × x64/arm64 (bundled Node runtime); the plugin's index detection only looks for a `*.db` under `.codegraph/` rather than a fixed filename, so an upstream rename does not affect it.

## Development

```bash
pnpm --filter @hyzyn/dsh-codegraph build
pnpm --filter @hyzyn/dsh-codegraph typecheck
pnpm test                                   # repository-wide vitest (or: vitest run packages/codegraph)
pnpm --filter @hyzyn/dsh-codegraph test     # this package only (managed-row matrix + CLI knobs + route regressions)
node packages/codegraph/scripts/preview-card.mjs        # render the card preview HTML into .preview/ (--png needs a normal terminal: Chrome cannot start under a restricted sandbox)
                                                        # also --per-agent / --fallback: view the per-agent "active" and "fell back to managed" states offline
node scripts/verify-codegraph-indexforce.mjs --profile test --port 3086   # live end-to-end: does indexForce really spawn with --force (requires a local DSH)
node scripts/verify-codegraph-host-contract.mjs --profile test --port 3087  # live end-to-end: host contract (25 routes + gates + served artifact + managed row + per-agent mode switch); needs a local DSH
```

### per-agent: three layers of acceptance

Each layer proves one thing; missing a layer leaves a real gap uncovered — gap-closing, not padding:

| Script | Layer | What it proves |
| --- | --- | --- |
| `verify-codegraph-agent-scope.mjs` | mechanism | Minimal Cordis root: scopes can mount mcp-client, the same `serverName` does not collide across scopes, the global layer stays clean, disposal reclaims only its own |
| `verify-codegraph-host-contract.mjs` | routes / switch | Real host: 25 routes, `mcpScope` switching, the global managed row getting suspended and restored, real patch byte-identical |
| `verify-codegraph-agent-integration.mjs` | **integration** | Mounts the **real plugin**, drives a real `agent/created` through the real `AgentRegistry`, and asserts the tool lands on **that agent**, that an unindexed agent is not mounted, and that `agent/disposed` reclaims it |

The third layer was added because the first two being green still could **not** prove "MCP actually mounts when a user opens a session": the mechanism script uses fake agents, and the host script's host never creates an agent (every `/agents` round reported `mounted=0`). That path is the entire value of per-agent.

All three build their own temp projects, reclaim their own child processes, and assert the real `~/.dsh/cordis.patch.yml` is byte-identical; the latter two also give the system under test an isolated `DSH_HOME` (the earlier lesson: without isolation the plugin writes straight into the user's real config, CG45).


The browser half's source lives in `client-src/index.js`; `build` produces the package-root `client.js` via `scripts/build-client.mjs` — it drops index.js's import of `client-src/pure.js` and inlines pure.js (the DOM-free logic, unit-tested directly in `test/client-pure.test.ts`) into the factory with its `export` prefixes stripped, so the artifact stays a single import-free file. CI's artifact diff gates on byte-for-byte equality, so editing the source without rebuilding turns CI red.

After upgrading the local DSH, re-link first and then typecheck — otherwise `packages/*/node_modules/@deepseek-ai/*` is still the old copy from the repository's
`.pnpm`, and the plugin and the host each hold a different version of the library, so compatibility problems are masked:

```bash
node scripts/link-dsh-runtime.mjs     # link packages/*'s @deepseek-ai/* and @hyzyn/dsh-kit to the dsh runtime / this repository's workspace
```

Planning and defect records (neither ships with the package; both are Chinese-only and live in the repository, hence absolute links):

- [ROADMAP.md](https://github.com/hyzyn/dsh-plugin-kit/blob/main/packages/codegraph/ROADMAP.md): enhancement roadmap — P0–P3 tiers, cost, architectural items (per-agent mount / adoption metrics / diagnostics bundle) and the suggested order of work.
- [DEFECTS.md](https://github.com/hyzyn/dsh-plugin-kit/blob/main/packages/codegraph/DEFECTS.md): defect audit and fix log — `CG01`–`CG38`, acceptance records and the raw backlog.
- [ADOPTION-AUDIT.md](https://github.com/hyzyn/dsh-plugin-kit/blob/main/packages/codegraph/ADOPTION-AUDIT.md): adoption measurements — the numbers computed from 177 real historical sessions, the tradeoffs between the two denominators, and what they imply for the roadmap.

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
  /**
   * Whether the managed row's cwd follows the active session. On by default; "Set as default
   * project" turns it off (an explicit pin). Meaningless while `mcpScope: 'per-agent'` is in
   * effect (each agent talks to its own process, so there is nothing to follow).
   */
  followSession?: boolean
  /**
   * MCP mounting mode, default `'managed'`.
   * - `'managed'`: a single managed row plus session-driven hot switching (time-shared).
   * - `'per-agent'`: each agent mounts its own dsh-mcp-client in its own scope, cwd = that
   *   session's index root.
   *
   * `managed` stays the default: per-agent is a behaviour change, and per measurements it only
   * helps the narrow "multiple projects at once" case (3.1% of the time). When a precondition
   * fails (no agent event surface / a hand-written codegraph row outside the managed blocks /
   * the MCP master switch off) it falls back to managed and says so on the card — never
   * silently. Cost: one child process per agent (~40MB).
   */
  mcpScope?: 'managed' | 'per-agent'
  /** Timeout in milliseconds for query commands (status/query/callers/callees/impact/node). Defaults to 60000; 0 = unlimited. */
  cliTimeoutMs?: number
  /** Timeout in milliseconds for index commands (sync/index). Defaults to 600000; 0 = unlimited. A full rebuild of a large repository exceeds the query budget. */
  indexTimeoutMs?: number
  /** Append `--force` to `codegraph index` (used when the CLI refuses to index a home directory / filesystem root). Off by default. */
  indexForce?: boolean
  /**
   * **Automatically rebuild** when a stale index is detected (checked on the first `user/message` of a
   * `session/event`, at most once per project per host run). Off by default — a rebuild is a
   * minutes-long operation on a large repository. The semantics are rebuild, not sync: measured,
   * `codegraph sync` answers `Already up to date` for an "extractor version behind" signal and does
   * not clear it.
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

After installation, two prompt sections are injected into systemPrompt automatically (at most ~310 tokens in total; the usage section appears only when the effective path is indexed):

- `plugin:dsh-codegraph` (order 150): the capability announcement (Chinese, ~130 characters) — only that the card exists and can be pointed at; which buttons the card has is UI detail and does not spend model context.
- `plugin:dsh-codegraph:usage` (order 151): the CodeGraph usage guideline (the CODEGRAPH_START block). It fills the role upstream assigns to `CODEGRAPH_INSTRUCTIONS_BLOCK` (the short block for subagents and non-MCP harnesses, while the long playbook rides the MCP `initialize` `instructions`) — **but DSH's MCP client never reads `instructions`**, so upstream's "no root index → query per project via `projectPath`" variant never reaches the model. This block carries exactly that, plus three more: the **shell fallback** (the command name renders from the `command` config instead of a hardcoded `codegraph`, and `--path` is spelled out), **per-project `projectPath`**, and **skip unindexed projects without running `codegraph init`**. Its trigger condition matches the host's `indexState`: `.codegraph/` must contain an index database — upstream's own wording only checks that the directory exists, which mistakes the CLI's `~/.codegraph` install dir for a project index, so this block deliberately tightens it.

Both blocks sit behind two gates, and the usage block behind a third:

1. **CLI probe**: `<command> --version` runs once at mount; on failure neither block is injected (a `console.warn` carries the failure text) — the prompt never advertises a capability that cannot work. The result is not latched: the card's re-probe button or `POST /reprobe` re-runs it and refreshes both sections immediately (useful after installing the CLI or switching `command` to an absolute path, with no host restart).
2. **Toggles**: the card's two checkboxes write the settings namespace (`POST /api/dsh-codegraph/settings`) and add/remove the sections immediately; installation-level config can also disable them (`announceToAgent: false` / `usageGuidance: false`).
3. **Index gate (usage block only)**: the usage guideline is injected only when the effective path (the directory the managed row actually uses) is a **valid index** — the same `indexState` criterion the host uses, where the mere existence of `.codegraph/` does not count. An unindexed repository therefore spends none of the ~300 tokens that guideline costs (it is, after all, telling the model what to do *when this repo has an index*) and the model is not pushed toward a tool that must fail. The criterion is recomputed on every `refreshGuidance`, so following the active session, "set as default project", a successful `init`, and `uninit` all change injection immediately. **The announcement block (order 150) is exempt**: it is about the card existing, not about the index.
