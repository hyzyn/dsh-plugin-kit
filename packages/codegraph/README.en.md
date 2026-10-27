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
- **Per-agent MCP isolation by default** (`mcpScope` defaults to `'per-agent'`; write `'managed'` explicitly to roll back to the old behaviour): with per-agent, each agent mounts its own `dsh-mcp-client` inside **its own Cordis scope**, with `cwd` pinned to the index root of *that* agent's session directory — parallel multi-project work no longer shares a single global cwd, and the whole "write patch → hot reload → rebuild connection" chain disappears; the global managed row is **suspended** (`disabled: true`, restored automatically when you switch back to managed). The cost is one child process per indexed session (measured ~40MB idle Node baseline). An agent whose session directory has **no usable index is not mounted at all** (rather than falling back to the default project) — that is now the **default behaviour**: a session opened in the home directory or an unindexed repo gets no `mcp__codegraph__*` at all instead of inheriting "some other project's" context (the managed row lives in the root scope and is exactly where that drift came from). When the preconditions do not hold (no agent event surface on the host / a hand-written codegraph row outside the block / the MCP master switch off) the plugin still **falls back to managed and states the reason on the card**; the fallback behaves exactly like the old version (the global row serves every session) and is never silent. **Per-agent mounts wait for env's readiness service** (`dshEnvReady`): per-agent spawns an MCP child process that inherits the host's `scrubbedParentEnv()`, so mounting happens only after env's synchronous pre-injection and the child actually sees the variables env injected; when env is not installed the wait is skipped (see `src/env-gate.ts`, which also records this gate's measured scope — **it is not about auth headers**: per-agent uses stdio with no `headers` in its config, and credential-shaped variables are blocked by the host's scrub regardless). Mechanism measurements and tradeoffs: [docs/p0-plan.md](./docs/p0-plan.md).
  The mount mode is **continuously effective** rather than decided once at startup: the host loader creates plugin entries concurrently, so the `agents` service can become ready after this plugin does — the plugin re-decides and back-fills mounts when it arrives (codegraph CG69), instead of staying on managed forever because of one startup ordering.
- **One-click initialisation**: an uninitialised directory gets an "Initialise index" button on the card that runs `codegraph init` (two-step confirm) — `index` / `sync` both require the project to be initialised first, and this was the last step that still forced users back to a terminal.
- **Two systemPrompt sections with deliberately unequal gates**: `plugin:dsh-codegraph` (order 150, ≤70 characters: only "this machine has the plugin, point the user at the card") and `plugin:dsh-codegraph:usage` (order 151, ≤600 characters: when to use it / the two entry points / what to do on failure). The announcement block is gated **only** by the `announceToAgent` switch — it is about the card, and the card routes are registered unconditionally, so it keeps being injected while the CLI probe is pending or failing; the usage block needs `CLI probe available && usageGuidance && effective path indexed` all three. Both switches write the settings namespace and add/remove the sections live.

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
| `/api/dsh-codegraph/default-path` | GET | Pinned `defaultPath` + `effectivePath` + `sessionPath` + `followSession` + prompt toggles + `cliAvailable` / `cliProbeError` / `cliProbeAt` + MCP managed state `mcp` + **`mcpTools`** (`{ tools, reason, nextStep? }`: whether this session actually has `mcp__codegraph__*` — a managed row present does **not** mean tools exist; an empty `- insert: []` placeholder gets a reason and a next step) (`indexState` describes the **effective** path) |

`mcp` is an **on-disk snapshot** (it never guesses the next write): `mode` / `cwd` / `disabled` / `indexed` / `cwdExists` plus `note`. The two known empty states explain themselves through `note` — an `- insert: []` placeholder with an unindexed default project reports "no indexed default project… set one and it will be written automatically", while per-agent reports "the managed row is suspended (tools mount per agent)"; when a real row is managed no `note` is written (cwd / disabled already say it all, and a repeat on every refresh would just be noise).
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
- **Measured numbers: see [docs/adoption-audit.md](./docs/adoption-audit.md)**: traced back over 177 real historical sessions — 23% session-level, 28.8% narrow, 47% over the last three days — plus a quality sample of the `query` calls codegraph received (34/47 carried a concrete symbol name).
- **A zero denominator reads "no exploratory calls yet", not 0%**: "never explored" and "explored but grepped everything" are different facts.
- **The project key is the index root** (`resolveIndexedRoot`) — the same criterion as the managed row's cwd and the injection gate, so several sessions in one repository (new session, subagent, host restart) merge into one row instead of scattering into samples too small to mean anything. Unindexed projects are recorded too, but the wording states that the number says nothing about prompt effectiveness, and `/metrics` additionally reports `grouped.indexed` / `grouped.unindexed` subtotals — the model should not be using codegraph in an unindexed project at all, and mixing those into the overall figure would produce a meaningless number.
- **In-memory only; a host restart resets it**, and `since` reports the starting point honestly. Not persisting is deliberate: this is an observation for deciding whether to tune the prompt, not an audit log, and persisting would leave tool names and project paths on disk indefinitely.
- The same data also goes into the diagnostics bundle (`/diagnose`), because the first thing to separate when someone reports "codegraph doesn't seem to help" is "the model never used it" from "it used it and the results were wrong".

Request semantics (since v0.4.2):

- **POST routes answer 400 for malformed / oversized / non-object bodies** — an unreadable body is never treated as "no path given" and silently executed against the default project.
- **Paths must exist and be directories**: `status` / `query` / `callers` / `callees` / `impact` / `node` return 400 for a nonexistent path (the CLI exits 0 with empty results there, which reads like "no matches"); `--limit` / `--depth` accept positive integers only (`limit` is capped at 10000; `depth`'s upper bound is clamped by the CLI itself to 10).
- **Ancestor semantics**: `POST /default-path` binds the **repository root that holds the index** when invoked on a monorepo subdirectory; `/init` on such a subdirectory answers 409 (the ancestor already has an index, avoiding a nested one); `/follow` rejects reports of nonexistent directories.

## Compatibility (DSH / codegraph CLI)

- **DSH**: the host version matrix — **ten supported tiers**: `0.1.7-rc.2`, `0.2.0-rc.1`, `0.2.0-rc.2`, `0.2.1-alpha.1`, `0.2.1-alpha.2`, `0.2.1-alpha.5`, `0.2.1-rc.1`, `0.2.1-rc.2`, `0.2.1-rc.3`, `0.2.1-rc.4`.
  **`0.2.1-alpha.5` is the only tier that carried real host behaviour changes** (evaluator field name, how `engines.dsh` is read,
  credential precedence, the macOS picker); every other tier was either change-free or only a range-coverage issue
  (`0.2.0-rc.1` is the one that actually needed a new segment).
  - **Per-tier evidence does not live here**: how each tier was verified, the measurements, the API-surface diffs and the
    "not run" lists are in the [ROADMAP § completed](./ROADMAP.md#已完成042-之后的工作树) section "host cohort 逐档实测证据" (Chinese).
    README keeps the declaration only; the same fact written out twice is debt
    (see [docs/conventions.md](../../docs/conventions.md#文档分层)).
  - **`0.1.6-alpha.2` / `0.1.5-rc.2` / `0.1.0-rc.7` (historical baselines, no longer supported)**: those tiers still had the old `register(ns, schema)` API for the `settings` service, whereas the 0.1.7 line replaced it with `SettingsForms` (`describe/update` plus a volatile exported Config); this package's `peerDependencies` floor `^0.1.7-rc.2` also makes a new host refuse to load it onto an old one, both before install and at startup. The evidence collected for those tiers at the time (`0.1.6-alpha.2` 40/40, `0.1.5-rc.2` no script, `0.1.0-rc.7` audit baseline) stays in git history for reference only.
  - `package.json` declares `peerDependencies: { "@deepseek-ai/dsh": "^0.1.7-rc.2 || ^0.2.0-rc.1 || ^0.2.0-rc.2 || ^0.2.1-alpha.1 || ^0.2.1-alpha.2 || ^0.2.1-alpha.5 || ^0.2.1-rc.1" }` (with `optional` in `peerDependenciesMeta`, purely to quiet pnpm's unmet-peer noise). From DSH 0.1.7-rc.1 on, compatibility is judged from this **before install** and **at startup**: an incompatible pair throws `incompatible-version` on install, and at startup the whole row is marked `disabled` (an incompatible bundle is skipped outright). `dsh.engines.dsh: ">=0.1.7-rc.2"` is kept as well, as the **market display slot** (the host does not read it — see the next bullet; the market resolver only accepts one segment, so it carries the **lowest** cohort), and `scripts/check-dsh-peers.mjs` asserts the peer floor agrees with it.
  - **Why peer rather than `engines.dsh`**: `dsh-app-boot` walks only `peerDependencies` entries named `@deepseek-ai/dsh` or starting with `@deepseek-ai/dsh-`, judging them with `semver.satisfies(runtime, range, { includePrerelease: true })` (**prereleases take part in range matching**). **`engines.dsh` is still declared, though** — the host does not read it, but the plugin market / community entries display compatibility from it, so it is kept in the standard form `>=0.1.7-rc.2` (the market resolver only accepts `>=X.Y.Z[-prerelease]`; an `||` range is judged "unverifiable" and fails closed) and made to agree with the peer floor. Evidence: `evaluatePluginCompatibility` in `dsh-app-boot/lib/index.js`, and the app-boot README's own wording that these checks use the peer declaration rather than `engines.dsh`.
  - **Why the range is ten segments, `^0.1.7-rc.2 || ^0.2.0-rc.1 || ^0.2.0-rc.2 || ^0.2.1-alpha.1 || ^0.2.1-alpha.2 || ^0.2.1-alpha.5 || ^0.2.1-rc.1 || ^0.2.1-rc.2 || ^0.2.1-rc.3 || ^0.2.1-rc.4`**: with prereleases taking part in matching, `^0.1.7-rc.2` = `>=0.1.7-rc.2 <0.2.0-0` — a single segment kills the whole 0.2 line, which is exactly why this repo's plugins showed as "abnormal / contains no components" in the desktop app once 0.2.0-rc.1 shipped. The second segment admits the 0.2.0-rc.1 tier and, with it, the whole 0.2.0 rc line and 0.2.x finals; the third, `^0.2.0-rc.2`, the fourth, `^0.2.1-alpha.1`, and the fifth, `^0.2.1-alpha.2`, are all **explicit declarations** (an earlier segment already covers them; each has its own measurements and API-surface comparison, see the cohort evidence in ROADMAP) — those three really are **zero behavioral difference** for a host; **the sixth, `^0.2.1-alpha.5`, is not**: that tier really changed the evaluator field name, how `engines.dsh` is read, and the credential precedence, so it was compared at "boundary fix" strength against both the API surface and this repo's reference surface (the cohort evidence in ROADMAP); the seventh, `^0.2.1-rc.1`, is an **explicit declaration** again and is **zero-difference** for a host (the 14 host packages and the evaluator's `lib/` are byte-identical; only 5 client artifacts differ, and only in their version strings — the cohort evidence in ROADMAP); the eighth, `^0.2.1-rc.2`, is likewise **zero-difference** (all 9 differing files were traced and none relates to this repo); the ninth, `^0.2.1-rc.3`, is **zero-difference** too, and that comparison was the most thorough yet — **all 22 host packages this repo imports are byte-identical in `lib/`**, and the 17 packages that do differ all fall outside this repo's reference surface (the cohort evidence in ROADMAP); the tenth, `^0.2.1-rc.4`, is **zero-difference** as well — 26 of the 27 host packages this repo references are byte-identical in `lib/`, the single one that changed (`dsh-mcp-client`) sits on a path this repo never touches (the MCP `resources/*` handlers; this repo only uses `mcp__*` tools), and the client slot catalog is unchanged at 103 → 103 (the cohort evidence in ROADMAP). `RELEASING.md`'s tier rule now states explicitly that "zero difference is the norm, not the definition". They are kept because this repo's rule is "declare every cohort you adapt to and leave the measured evidence", not "a range that is just barely sufficient". Matching any branch admits the host, and all ten tiers' API surfaces have been compared file by file (the cohort evidence in ROADMAP). `0.1.7` final and later `0.1.7-rc.N` / `0.1.8` still ride the first segment, while `0.1.7-rc.1`, `0.1.7-alpha.2` and `0.1.6-*` still do not pass. To temporarily admit another version combination, write the exemption into the profile's own `compatibility.json` (`dsh plugin --profile <p> allow-version <pkg@ver> --dsh-version <ver> --accept-risk`) rather than adding segments ad hoc — every added segment must be a cohort that was really tested and whose API surface was compared.
- **Codegraph CLI**: version matrix — the full chain has been verified on `1.5.0` (macOS) and `1.6.0` (Windows / macOS); the subcommands used are `status` / `query` / `callers` / `callees` / `impact` / `node` / `sync` / `index`, with every flag checked one by one. `codegraph serve --mcp` still works (it is not listed in the top-level help, but `codegraph serve --help` has it), so the managed row needs no change. Re-verify after upgrading the CLI: flags such as `-y` are version-dependent (this plugin deliberately omits it, see below).
- **URL shape of the browser half**: DSH currently goes through client-modules' combo route, so the single-package direct link `/plugins/@hyzyn/dsh-codegraph/client.js` is no longer directly usable; the browser only uses `/plugins/??<id>/client.js&rev=…` handed down by the boot graph (`window.__DSH_BOOT__`), and the plugin side needs no change.
- **Operating systems**: Windows / macOS / Linux run the same code path, and CI is a three-platform matrix (`pnpm -r build` + `typecheck` + `test`).
  - **Windows**: the CLI goes through `%COMSPEC% /d /s /c` with cmd escaping (a global npm / pnpm install only ships a `.cmd` shim, which `execFile` cannot start directly — `ENOENT`); a timeout kills the whole tree with `taskkill /pid <pid> /T /F`, **including the grandchild CLI inside the shim** (killing only cmd.exe lets a large `index` run to completion); rewriting the patch file keeps the file's own line endings (a CRLF file is not turned into mixed endings, and a rewrite does not change the line count).
  - **`index` will not initialise for you**: `codegraph index --help` says "same result as a fresh init", but that describes the **result of a full rebuild** being equivalent to a fresh init — not that `index` performs initialisation. On a directory without `.codegraph/`, both `index` and `sync` fail with `CodeGraph not initialized in <path>` plus `Run "codegraph init" first`. The card's "Initialise index" button therefore uses `init`.
    - Arguments are fixed to `init -- <path>`: **`-y` is not passed** — that flag only exists in CLI 1.6.0 and 1.5.0 fails with `error: unknown option '-y'`; omitting it does not hang either (the runner has no TTY, and both 1.5.0 and 1.6.0 were verified to take the defaults and finish). **`-f` is deliberately not passed** (the CLI uses it to guard against accidentally initialising your home directory or a filesystem root, and the plugin should not bypass that for the user).
    - This is the plugin's **only** action that writes into the user's project: it creates `codegraph.db` and a self-ignoring `.gitignore` (containing `*` and `!.gitignore`) under `.codegraph/`. It **touches no source file and does not modify the project's root `.gitignore`**; `codegraph uninit` removes it entirely. The card uses a two-step confirm and it is **never triggered automatically**.
    - `init` / `index` trigger the codegraph CLI's own anonymous usage statistics (upstream prints a notice; disable with `codegraph telemetry off` or `CODEGRAPH_TELEMETRY=0`). The plugin does not change that switch — it is the user's preference.
  - **PATH**: both the probe and the calls use the plugin's `command` config (default `codegraph`, resolved through PATH). When the host is started from an entry point that does not inherit the shell environment (Dock / Start menu), the CLI may be missing from PATH — the usage block is not injected (the announcement block does not depend on the CLI and stays) and the card cannot resolve a working command.
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
node scripts/verify-codegraph-host-contract.mjs --profile test --port 3087  # live end-to-end: host contract green (routes + gates + served artifact + managed row + per-agent mode switch; counts as reported by the script); needs a local DSH
```

### per-agent: three layers of acceptance

Each layer proves one thing; missing a layer leaves a real gap uncovered — gap-closing, not padding:

| Script | Layer | What it proves |
| --- | --- | --- |
| `verify-codegraph-agent-scope.mjs` | mechanism | Minimal Cordis root: scopes can mount mcp-client, the same `serverName` does not collide across scopes, the global layer stays clean, disposal reclaims only its own |
| `verify-codegraph-host-contract.mjs` | routes / switch | Real host: all routes, `mcpScope` switching, the global managed row getting suspended and restored, real patch byte-identical |
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

- [DEFECTS.md](https://github.com/hyzyn/dsh-plugin-kit/blob/main/packages/codegraph/DEFECTS.md): the defect number dictionary — an index of `CG01`–`CG73` (symptom + fix / design intent); the full write-ups, acceptance records and the raw backlog are frozen in git history (see its §4).
- [ROADMAP.md](https://github.com/hyzyn/dsh-plugin-kit/blob/main/packages/codegraph/ROADMAP.md): enhancement roadmap — P0–P3 tiers, cost, architectural items (per-agent mount / adoption metrics / diagnostics bundle) and the suggested order of work.
- [docs/p0-plan.md](https://github.com/hyzyn/dsh-plugin-kit/blob/main/packages/codegraph/docs/p0-plan.md): the full plan and measurements for per-agent scoped MCP mounting (the design doc of a shipped item, **moved into the package's `docs/`**).
- [docs/adoption-audit.md](https://github.com/hyzyn/dsh-plugin-kit/blob/main/packages/codegraph/docs/adoption-audit.md): adoption measurements — the numbers computed from 177 real historical sessions, the tradeoffs between the two denominators, and what they imply for the roadmap (**moved into the package's `docs/`**).

## Install into DSH

```bash
dsh plugin --profile web add link:$(pwd)
```

## Configuration

Where the settings surface lives depends on the DSH version, but it is always the **same form**: from
`0.2.0-rc.1` it is registered as `plugins.bundle.config` — **inline on the plugin detail page, directly
below the description**, with no extra ">" step; older hosts (the 0.1.6 line) fall back to the row's ">"
sub-page under the Plugins sidebar, and `≤0.1.5` uses the settings-page card.

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
   * MCP mounting mode, default `'per-agent'`.
   * - `'managed'`: a single managed row plus session-driven hot switching (time-shared); that
   *   row lives in the **root scope**, so sessions without an index inherit it too (same tool
   *   name, semantics drifting with the global cwd).
   * - `'per-agent'`: each agent mounts its own dsh-mcp-client in its own scope, cwd = that
   *   session's index root; a session with **no usable index is not mounted** (no fallback), so
   *   "no index, no tools" becomes the default behaviour.
   *
   * Per-agent became the default on 2026-10-24 (flipped from managed) to close the disclosure
   * surface: tools should neither appear in a session without an index nor point at another
   * project. When a precondition fails (no agent event surface / a hand-written codegraph row
   * outside the managed blocks / the MCP master switch off) it falls back to managed and says so
   * on the card — never silently; the fallback behaves exactly like the old version. Roll back by
   * writing `'managed'` explicitly. Cost: one child process per indexed session (~40MB).
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

After installation, two prompt sections are injected into systemPrompt automatically (at most ~220 tokens in total: the announcement block is ≤70 characters, the usage block ≤600 characters and only appears when the effective path is indexed and the CLI probe succeeded):

- `plugin:dsh-codegraph` (order 150): the capability announcement (Chinese, ≤70 characters) — only that this machine has the plugin and that the model should point the user at the card when they mention code graphs / indexes / call chains; which buttons the card has is UI detail and does not spend model context (an older version listed six of them in 327 characters).
- `plugin:dsh-codegraph:usage` (order 151): the CodeGraph usage guideline (the CODEGRAPH_START block, ≤600 characters). It fills the role upstream assigns to `CODEGRAPH_INSTRUCTIONS_BLOCK` (the short block for subagents and non-MCP harnesses, while the long playbook rides the MCP `initialize` `instructions`) — **but DSH's MCP client never reads `instructions`**, so upstream's "no root index → query per project via `projectPath`" variant never reaches the model. This block carries exactly that, plus: **when to use it** (`.codegraph/` must contain an index database — checking only that the directory exists mistakes the CLI's `~/.codegraph` install dir for a project index), **the two entry points** (the MCP tool, and the shell fallback whose command name renders from the `command` config with `--path` for another project), and **what to do on failure** (fall back to normal search; never run `codegraph init` for the user).

The two sections sit behind **deliberately unequal** gates:

1. **Toggles**: the card's two checkboxes write the settings namespace (`POST /api/dsh-codegraph/settings`) and add/remove the sections immediately; installation-level config can also disable them (`announceToAgent: false` / `usageGuidance: false`). This gate applies to both sections.
2. **CLI probe (usage block only)**: `<command> --version` runs once at mount; while it is pending or after it fails the usage block is not injected (a `console.warn` carries the failure text) — the prompt never advertises a capability that cannot work. **The announcement block does not follow it**: the card routes are registered unconditionally (the plugin is installed, so the card works), and swallowing the announcement while the probe is pending means "the card is usable but the model does not know it exists". The result is not latched: the card's re-probe button or `POST /reprobe` re-runs it and refreshes both sections immediately (useful after installing the CLI or switching `command` to an absolute path, with no host restart).
3. **Index gate (usage block only)**: the usage guideline is injected only when the effective path (the directory the managed row actually uses) is a **valid index** — the same `indexState` criterion the host uses, where the mere existence of `.codegraph/` does not count. An unindexed repository therefore spends none of those 600 characters (it is, after all, telling the model what to do *when this repo has an index*) and the model is not pushed toward a tool that must fail. The criterion is recomputed on every `refreshGuidance`, so following the active session, "set as default project", a successful `init`, and `uninit` all change injection immediately. **The announcement block is exempt**: it is about the card existing, not about the index.
