# @hyzyn/dsh-loglens

[中文](README.md) | English

> DSH's log query panel: **one query surface** normalized over Elasticsearch / OpenSearch / Docker — query, read the trend and drill down by field in the same card; the agent side is the read-only `loglens_*` tools.

Queryable backends: **Elasticsearch**, **OpenSearch**. Docker is not given its own adapter — it is a
**collection source** pointing at the existing `docker_logs` / `docker_logs_grep`. **Loki is not offered
by the UI in this version** (the adapter and its real-machine acceptance are in the tree, but its
capability gate was never verified on a real machine) — see [§ Known limitations](#known-limitations).

![The query card on an ES source: query string with dialect-specific clickable examples, filter chips, time distribution (with axis labels and the peak), and result rows colored by level with identity tags](https://cdn.jsdelivr.net/gh/hyzyn/dsh-plugin-kit@main/docs/dsh-plugin-kit-loglens-query.png)

## Features

- **Thin adapters over a single execution layer**: [src/backends/](./src/backends/) holds three adapters
  (Loki / ES / OpenSearch; ES and OpenSearch share one implementation, split by `flavor`), and Docker is a
  collection source rather than an adapter. Normalization and clamping live in [src/query.ts](./src/query.ts)
  alone (timestamp units, window caps, `limit`, direction, cursor pass-through) and adapters must not clamp
  again; the panel and the agent tools share [src/execute.ts](./src/execute.ts), so both use one row model.
- **Capability self-description drives behaviour**: adapters implement `capabilities(): BackendCaps`
  (`queryLanguage` / `pagination` / `aggregations` / `follow` / `maxPageSize` / `maxWindowMs` / `fields`).
  UI rendering and parameter clamping follow that description; the panel never infers chart capability from
  the type. A flag declared `true` must have an implementation, reconciled per adapter by
  [test/capabilities.test.ts](./test/capabilities.test.ts) (hence Loki declares `follow` as `false`).
- **Counts and truncation are contract fields**: `LogCounts.totalKnown` is true only when an exact total
  exists (the ES side must enable `track_total_hits`, and `relation === 'gte'` sets it false). Truncation is
  expressed by the `Truncation.reasons` enum: `hit_limit` ("definitely more") and `hit_limit_maybe`
  ("possibly more") are two independent reasons, and `cursor_expired` is separate from both.
- **Cursors are backend-private encodings**: the Loki cursor uses the **complete ts group** as its coordinate
  (rows sharing one nanosecond cannot be split; see `loglens D03`); ES / OS use PIT + `search_after` (paging
  over the same snapshot, reporting `cursor_expired` on expiry without silently reopening). `decode` validates
  version and source and raises on failure rather than treating it as "no cursor".
- **A normalized row model**: time is epoch milliseconds throughout; levels are normalized to trace…fatal while
  keeping "the level stated by the document" distinct from "the level inferred from the body" (`levelInferred`),
  since the two carry different confidence and are not merged; nested fields become dotted tags; body
  highlighting uses the backend's **character ranges** (`line.highlights`), never a literal match of the query.
- **Read-only by default, egress limited to configured sources**: all five `loglens_*` tools are in the
  **read** tier; the fence in [src/net.ts](./src/net.ts) judges the **resolved IP** (link-local and cloud
  metadata addresses refused), never follows redirects, and caps one request at 8 MiB with a 20s default
  timeout (`NET_MAX_RESPONSE_BYTES` / `NET_DEFAULT_TIMEOUT_MS`). The full boundary is in "Known limitations".

## Installation

```bash
dsh plugin --profile web add @hyzyn/dsh-loglens              # install from npm (once published)
dsh plugin --profile web add link:$(pwd)/packages/loglens    # develop against this repo
```

The aggregate package `@hyzyn/dsh-all` (or the repo-root bundle) already contains this plugin, so there is no
need to add it separately. Restart `dsh web` afterwards; a "Log query" card appears under Settings → Plugin
config (**saved changes take effect live**, no restart needed).

> If `@hyzyn/dsh-all` or the root bundle is already installed in the web profile, **do not** add this package
> on top — the plugin row would be mounted twice and startup fails with `duplicate loader entry id`.

## Usage

Configuration lives on the current profile's plugin entry (the volatile path of `settings.update('loglens', …)`).
The **source configuration** collapses by default into one summary line on the plugin's full page
(`2 sources · current: 一` plus an "edit sources" button) and is expanded by default in the settings card. When
collapsed those rows are **not rendered**.

### Querying

- **Source**, **query string**, **time window** (15m · 1h · 6h · 24h, plus a "custom" tier when a bar is
  zoomed), **level** and **row count** all live in the query area; the query string takes the full remaining
  width of its row, everything else sits on the second row.
- **Enter runs the query**: pressing Enter in the query string or row count box is the same as clicking
  "query" (and Enter cannot fire while the button is greyed — the same condition as the button).
- **The query string supports field-name completion**: while typing, a candidate popup lists this source's
  fields (prefix matches first, at most 20, `FIELD_COMPLETION_MAX`); clicking one completes it in place to
  `field:` with the caret after the colon. Completion never fires a query; the field list is cached per source
  (fetched once per session). The candidates are a **popup drawn by the card itself**, not the native `datalist`.
- **Level** has seven entries (`any` / `trace+` … `fatal`), going through the host's **existing** `level` input.
  `warn+` means "warn and above" — the `+` only shortens the label, and the full wording lives in the boundary
  note on the same row. Note that it is a **page-level filter**: the host filters on the page it returned, while
  the count and truncation hints remain those of the **unfiltered whole page**, and the UI says this. Seeing
  levels across everything requires the backend to **actually have a level field**: on ES `log.level` is often
  entirely empty (the level is inferred from the body, carried as `levelInferred`), so such a source cannot
  even give levels to the group board.
- ES / OpenSearch query strings are handed to `query_string` **as written**, with no rewriting: empty means
  everything (`match_all`); `"phrase"`, `a OR b` (**space-separated words default to "or"**; "and" must be
  uppercase `AND`), and `name*` all follow Lucene's rules. `level:ERROR` often returns 0 rows and that is not
  breakage — in this index family `log.level` is mostly empty, so filter by level with the level dropdown.
- **Three spellings that silently change the meaning** (a wrong one **does not error, it just changes the count**):
  - **Square brackets are range syntax**, not a literal: `[ERROR]` becomes a range expression to Lucene, which
    is **not** the same as "contains the word ERROR". To match the word exactly write `"ERROR"` (a phrase) or
    `message:ERROR`.
  - **`=` has no special meaning**: `level=error` is not "field equals value"; it is usually read as two
    ordinary words (OR by default). For a real field filter use `field:value` or the panel's filter row.
  - **Only uppercase `AND` / `OR` / `NOT` are operators**; lowercase ones are ordinary words.
  Together these explain why `[ERROR]` and `level=error` differ by 2x in one window: **it is not tokenization**,
  neither spelling means "match ERROR exactly". For a reproducible denominator use `"ERROR"` (a phrase).
- **The placeholder and the clickable examples follow the source dialect**: LogQL for Loki, Lucene
  (`query_string`) for ES / OpenSearch. The ES examples are `error` / `"Failed to"` / `error AND failed` /
  `stream:stderr`, the Loki ones are things like `{job="app"} |= "error"` — clicking one **fills it into the box
  and does not run the query**. The examples are not translated (they are code, not copy).
  Note that **Kibana's Discover defaults to KQL, not Lucene**: this panel is Lucene, where "and" is uppercase `AND`.
- **A malformed query string tells you why**: ES returns `HTTP 200` for shard-level errors, with the reason in
  `_shards.failures[].reason` — it is carried as one `[shard] <ES original wording>` line above the results
  (`q=level:(ERROR` → `Failed to parse query [level:(ERROR]`).
- **When conditions changed but results have not been re-queried, the UI says so**: the result area carries a
  line saying "the below is still the previous query" and simultaneously collapses "next page" and disables
  "group" — the ES / OpenSearch cursor is PIT + `search_after`, so paging with an old cursor under new
  conditions **raises no error, it just silently loses rows**. Click "query" to align both sides.

### The result area

- The result list shows timestamp to the millisecond · level · body, with matching spans highlighted; when there
  is a cursor you get "next page" (deduplicated by id).
- **Rows with no level are marked `↳`**: without `multiline` on the collection side, one exception becomes
  several documents and only the first carries a level — the rest are continuation lines like `\tat …` /
  `Caused by:` / `### Error querying`. They belong to no level, so the row is marked `↳`, and **filtering by
  level reports "N of them are stack continuation lines"** — otherwise they vanish silently and the error count
  looks smaller than it is. The criterion only recognises stack syntax, so under-marking is preferred.
- **Level inference covers the shapes seen on a real machine**: `[ERROR]` prefixes, `level=ERROR` and
  `"log.level":"info"` (logfmt and JSON), logback's `18:31:54,850 |-INFO in …`, and logback's
  `14:00:00.123 ERROR 12345 ---`.
- **A row carries only one identity tag** (the first in host order, usually the container name) and shows only
  the **value** — the field name lives in the row hover / the ＋N popup / the field panel. The remaining tags
  collect in a **"＋N"** at the end of the row: opening it lists **all** tags and clicking any one filters
  immediately (background / × / Esc / any scroll collapses it). Values are never truncated.
- Clicking the **whole row** (or the leading chevron) expands details: full message + all tags + the raw
  original; a raw original over 20,000 characters (`RAW_PREVIEW_MAX`) is truncated **and its original length reported**.
- **Levels are colored by severity**: error/fatal red, warn orange, info normal, debug/trace grey, with a
  hairline separator between rows. The default is "full" mode (bodies fully expanded); "compact" keeps each
  entry to 3 lines.
- The meta line carries four action buttons: `☰ fields` / `☰ compact` / `⇅ sort` / `🗑 clear results`.
  **Sorting only affects the page already returned** (the host has no server-side sorting, and the entry's
  hover text says so), cycling through time / level / body. The default "time" is the **host's original order**
  (the only order sharing a source with the paging cursor — do not re-sort by ts, since rows within one
  nanosecond are an inseparable group).
- Both the "compact" and "sort" choices are remembered in the local browser (`localStorage`: `loglens.density` /
  `loglens.sort`) and do not follow you across devices; sorting **sends no request**. The result area's height
  is `min(720px, 72vh)` with a 300px lower bound, so taller windows show more rows.

### Time distribution and the group board

- Both are drawn **above** the result list (see the trend first, then the rows), and are drawn **only for
  sources with aggregation capability** (currently ES / OpenSearch). Both charts **come from backend
  aggregations**, not from counting this page — that page may have been truncated by `limit`, and counting it
  would only yield a fake distribution / ranking.
- **Time distribution**: under the bars there is a time scale (one cell at each end plus divisions across the
  window, at most 4 cells; precision follows the window span). Hovering a bar puts a bubble **directly above
  that bar** reading `19:22 · 315 rows · 1%`; with no hover it is not drawn. **Clicking a bar that has data
  zooms into that bucket** (the window is clamped to that span and re-queried; rows, distribution and board
  narrow together), the zoomed bucket stays highlighted, and the dropdown turns into a "custom" entry computed
  from the **real range**; clicking it again cancels the zoom. **Empty buckets are not clickable**; the zoomed
  window has a **1-minute lower bound**, and being clamped by it is stated explicitly. Gaps between adjacent
  buckets are **filled with 0**.
- **When the data flattens into a level band, baseline cropping is used instead**: max / min ≥ 3 goes linear,
  < 3 starts from `min × 0.9` and **says so explicitly** ("bar height only shows relative height, not a
  proportion of the row count"); when everything is equal it neither crops nor prints that sentence. The rule is
  in the head comment of `histogramScale` in [pure.js](./client-src/pure.js).
- **The group field is supplied by the user** (the panel has **no default field** — field names differ across
  index families, and guessing one would be forging a scope on the user's behalf). Opening that cell shows this
  source's field-name candidates: the host **lists at most the first 200 by default** (when truncated,
  `truncated: true` and the "first 200 of N" warning are copied verbatim into the footer; the same source is
  not re-fetched). Only usable names appear: container rows such as `object` / `nested` are not listed; a field
  whose **type differs** across indices is marked "type conflict".
- **The board writes no total**: the listed buckets do not add up to the total matches, and what is not listed
  is reported in the host's own words ("N more rows fall in buckets that are not listed"); approximate bucket
  counts are copied the same way. An empty-value key is shown as "(empty)" rather than a nameless bar.

### The field panel

- The "fields" button on the meta line opens a **340px popup** (`FIELD_PANEL_WIDTH`; height follows the result
  area, the field list scrolls on its own), so the result table stays at full row width. Clicking anywhere
  outside the panel, or clicking "fields" again, collapses it. **Collapsed, it does not call `/fields`**;
  expanding fetches it once (cached per source).
- The panel counts the fields **hit on this page** from the current page's `labels` (with per-field row counts)
  and **that is the only section drawn** (a column can only be added from fields hit on this page).
- **Filtering is multi-word AND**: split on spaces, every word must hit, so both `cont name` and `container name`
  find `container.name`. While searching, the top right reports **how many hit** and **auto-expands every group**.
- **Fields are grouped by parent path**: each group has a collapsible header (parent path plus count) and the row
  shows only the last segment, with the full name in the row's `title`. Long last segments break after
  `_` / `-` / `.` rather than down the middle of a word.
- **Each field is a checkbox**: the whole row is clickable, up to 4 columns (`RESULT_COLUMN_MAX`), and once full
  the unselected rows turn grey and are disabled (selected ones can still be deselected). With extra columns the
  result table lays out by column width: the body has a 198px lower bound, and a narrow window **scrolls horizontally**.
- The panel also has a **selected columns** cell: column chips are drawn above the result table while the panel
  floats over it, so this cell places the same column set inside the panel.

### Filtering and drill-down

- **Clicking a row on the board drills down by it**: it adds a structured filter (the host contract's `filters`)
  and re-queries, so rows, time distribution and the board **narrow together to the same subset**; clicking again
  cancels. Clicking an identity tag on a row takes the same `drillDown` path — no need to fill in the group field.
- Filtering is **one two-cell input**, with the chips further left:

  ```
  filter  [container.name ▾] = [prometheus ▾] [apply]
  ```

- After the left cell picks a field, the right cell auto-opens and fetches that field's top 8 values
  (`FIELD_VALUES_SIZE`; each row a bar of **relative** length, the exact count in the hover — it is measured at a
  different instant from the page's hit count, so putting them side by side would be read as arithmetic error).
- **Changing the field clears the right cell** (a value belongs to a field, not to this cell: otherwise `node-1`
  typed for `host.name` would be pinned onto `container.name` and Enter would silently filter the wrong thing).
- When a field **is already being filtered** and you open its value dropdown, other values are still listed — the
  request drops that field's own filter, and the top of the dropdown says so. Picking an entry immediately
  re-queries as "field = value"; filters can also be removed one at a time with `×` on their chip. **One entry per
  field**; values are **not trimmed** (whitespace in a key name is part of the content, and trimming it silently
  matches nothing).
- **The empty-value bucket is not clickable**: a filter cannot express "field missing", and a clickable entry
  would only filter out something else.
- **Loki does not support structured filtering** (the host reports it verbatim) — with it, write the condition
  into the LogQL query string; the UI line says so too.

### Docker sources

Selecting a Docker source turns the whole card into a **container-logs area**: **selecting this source auto-fetches
the containers** (changing the Docker target re-fetches, the same target is not fetched twice). Pick a container /
time window / row count → view logs, going through the Docker panel plugin's own routes (relative paths).

- The list only changes when containers start or stop, so the main row carries **no** refresh button — the
  re-fetch entry plus the "retry" / "refresh" states live in the container-candidate popup footer. A failed fetch
  **stays in that cell only** (it does not touch the error line at the top of the card, and a failure caches
  nothing, so the next trigger retries).
- **Switching containers does not re-fetch the logs automatically** (that is one `docker logs`, a heavy call): a
  line **above the logs** says what is on screen is still the previous pull.
- This path has no `until`, a capped `tail`, and no grep — for precise searching use the agent-side `docker_logs_grep`.

![A Docker source: the whole card becomes the container-logs area — pick a container / time window / row count, with the weak surface (no until, capped tail, no grep) stated inline](https://cdn.jsdelivr.net/gh/hyzyn/dsh-plugin-kit@main/docs/dsh-plugin-kit-loglens-docker.png)

## How to write a source address

| Kind | Address | Notes |
|---|---|---|
| `loki` | `http://127.0.0.1:3100` | May include a gateway prefix (e.g. `https://gw.example/loki`); queries go to `/loki/api/v1/query_range` |
| `elasticsearch` / `opensearch` | `http://user:pass@127.0.0.1:9200/logs-*` | **Index expression**: the "index" filled into the third cell of that row takes precedence; if empty, the address path is used (backwards compatible); with neither it is `*,-.*` (all indices **but excluding dotted system indices** such as `.kibana_1` / `.infini_*`). `loglens_sources` **echoes the resolved result**, and probe also reports "N rows in the last 15 minutes"; credentials become a Basic header and never enter the URL; paging uses PIT + `search_after`; **ES 7.10 / 7.11 are supported too** (differences in [ROADMAP](./ROADMAP.md)) |
| Public address | Same as above, fill it in directly | **The connection surface = the sources you configure**: loopback / private / public are all allowed; only the link-local / cloud-metadata tier is unconditionally refused |
| `docker` | The third cell takes a **Docker panel target name** (e.g. `local`), **not** a URL | A collection source: the agent side uses the existing `docker_logs` / `docker_logs_grep`; the panel side goes through the Docker plugin's own `/api/dsh-docker/config` (target list) + `/containers` + `/logs` (relative paths), a weak surface: no `until`, a capped `tail`, no grep |

## Agent tools

Once sources are configured, the agent queries through these tools (**the authoritative list is the registration
site in [src/tools.ts](./src/tools.ts)**). They are **all** in the **read** tier (the tier table is in
[docs/permission-tier-plan.md](../../docs/permission-tier-plan.md) §2.1). The registration surface narrows with the
configuration: **with zero sources only `loglens_sources` registers** (the other four would just throw at call
time); when every configured source is Loki / Docker, `loglens_facets` is skipped too. Any source-list change
(panel add/remove, settings hot update) rebuilds the registration.

| Tool | Purpose |
|---|---|
| `loglens_sources` | List sources (with the **resolved index expression** and a probe count); other `loglens_*` tools take their `target` from here |
| `loglens_search` | Query: supports `filters` structured filtering and `level` (**and-above** semantics), `from` / `to` / `limit` / `direction` / `cursor` |
| `loglens_fields` | Show which fields exist. **Lists at most the first 200 by default** (the full count sits in `total`; when truncated `truncated: true` plus a warning with the next step; pass `limit` in segments for more). On the ES / OpenSearch side it **does not list `object` / `nested` container rows**, and a name whose **type differs** across indices is marked `conflict: true` with `esTypes` / `conflictDescriptions` |
| `loglens_facets` | Group by field / bucket by time ("which service is erroring"); currently only ES / OpenSearch have it — **when every configured source is Loki / Docker this tool is not registered at all**. **On zero buckets it says which cause it is** — using "how many rows this window holds" to tell "this field is a shell" from "nothing matched in this window", whose next steps are opposite |
| `loglens_context` | Fetch the context around one row (**two segments**, each filling its own `before`/`after`, so the anchor row itself is always included even in dense windows). The anchor is matched by **priority**: exact id → the variant with one leading `#` stripped → exact message → equal after whitespace normalization → one-way whitespace-normalized substring → `ts` alone (a **fallback** tier; a higher tier always wins, within a tier the row nearest the `ts` wins, ties broken by id then message). The `#id` right after the message on each rendered row is that exact coordinate; a non-id hit says in `warnings` which tier it used |

**Shape of the rendered row** (shared by `loglens_search` and `loglens_context`): time · level · message · `#id` ·
labels. Three details, all in service of reading it comfortably:

- **The timestamp carries an explicit offset**: `2026-10-18T22:01:43.123+08:00`, not `…Z`. With the offset,
  `Date.parse` still resolves the same instant (machine-usable) while the human sees the same clock as the
  message. The zone is the **host process's** local zone.
- **Multi-line messages (stack traces) keep their shape**: continuation lines get a `    | ` prefix (the message
  content is untouched), and past 20 lines it truncates and **reports** the total and the number not shown, plus a
  next step ("pass `expand: true` and query again" — `expand` only affects rendering; the returned message stays full).
- **Pagination has guidance**: when the adapter provides a `nextCursor`, both the result and the rendered text say
  "pass `nextCursor` back as `cursor` (same window, same `direction`)".
- **Only the identity keys are laid out** (`LABEL_PRIORITY` in `src/line.ts`, the first 3: container → host →
  stream); the rest collapse into `+N labels` — **collapsing is not dropping**: the full labels live in the
  result's `lines[].labels`.

**Model-facing announcement**: on mount the plugin injects a named section into the system prompt
(`plugin:dsh-loglens`, order 151, ≤300 characters) carrying only the recommended query chain (sources → search →
context → facets), the facets capability gate, and where to go with zero sources; the `announce` switch governs
both it and the startup log (off = the plugin stays silent on both surfaces). The five tools' schema descriptions
are ≤120 characters each; details live in the result-side warnings.

## HTTP surface (loopback)

| Action | Request | Notes |
|---|---|---|
| Read config | `GET /api/dsh-loglens/config` | Returns `{ ok, config: { enabled, targets }, plugins: { docker: true\|false } }` — `plugins.docker` is the freshly computed "is the docker plugin here" verdict ([src/plugins.ts](./src/plugins.ts)); the panel uses it to decide whether the Docker cell gets an entry |
| Toggle | `POST {"action":"enabled","enabled":false}` | **Exempt from the same-origin proof** (once disabled, the settings card is the only way back) |
| Add source | `POST {"action":"targets.add","target":{"kind":"elasticsearch","label":"Local ES","url":"http://127.0.0.1:9200"}}` | `kind` is `elasticsearch` / `opensearch` / `docker`; `loki` is **still accepted by the host** but not offered by the UI — see [§ Known limitations](#known-limitations) |
| Update source | `POST {"action":"targets.update","id":"<id>","patch":{"url":"…"}}` | The id cannot be changed (it is the only way the browser side references it) |
| Remove source | `POST {"action":"targets.remove","id":"<id>"}` | |
| Query once | `POST /api/dsh-loglens/query` `{"target":"<id>","q":"…","from":…,"to":…,"limit":…}` | Used by the panel; returns rows + counts + truncation signals, **the same shape as `loglens_search`** (one execution layer). May carry `filters` — that is how the panel drills down, and `/facets` carries the same copy |
| List fields | `POST /api/dsh-loglens/fields` `{"target":"<id>"}` (may carry `"limit":80` to narrow) | Fetched when the group-field cell is opened (the panel **passes no `limit`** → the host caps at the **first 200**); when truncated it returns `truncated: true` plus the warning, which the UI copies verbatim |
| Aggregate | `POST /api/dsh-loglens/facets` `{"target":"<id>","by":"container.name","interval":"5m"}` | Group by field / bucket by time (currently only ES / OpenSearch have it) |

Fence ([docs/design.md](./docs/design.md) §4): the whole route set goes through the **hardened tier**
`isLoopbackRequestStrict`; `/config` is exempt **per action** — only `enabled` is exempt from the same-origin proof,
while adding / removing / updating targets requires `hasSameOriginProof`. **`/query` / `/fields` / `/facets` require
it too**: they are read-only yet they **reach the configured internal targets on the requester's behalf**. When the
plugin is disabled only `/config` remains; addresses accept http / https absolute URLs only.

```bash
# read
curl -s http://127.0.0.1:3080/api/dsh-loglens/config
# add a local ES: the command line has no browser same-origin proof, so bring an Origin header
curl -s -X POST http://127.0.0.1:3080/api/dsh-loglens/config -H 'content-type: application/json' -H 'origin: http://127.0.0.1:3080' -d '{"action":"targets.add","target":{"kind":"elasticsearch","label":"Local ES","url":"http://127.0.0.1:9200"}}'
```

## Anatomy

| File | Notes |
|---|---|
| `package.json` | `dsh.bundle.patch` points at `cordis.patch.yml`; `main` / `exports["."]` point at `lib/index.js` |
| `cordis.patch.yml` | Bundle patch: `insert: { id: loglens, name: '@hyzyn/dsh-loglens' }` |
| `src/index.ts` | Host half: the four routes `/config` / `/query` / `/fields` / `/facets` plus settings persistence |
| `src/config.ts` | The **pure** rules for the source list (id generation / address validation / lenient reads / add-remove-update), touching neither cordis nor the network |
| `src/net.ts` | **Outbound fence**: verdict on the resolved IP + no redirects + size and timeout caps; every outbound call of both adapters goes through it |
| `src/line.ts` | Row **observability**: nested fields flattened into dotted tags + level normalization and body inference (marking `levelInferred`) |
| `src/execute.ts` | Find the source / normalize / shape the response: the layer **shared by the agent tools and the panel routes** |
| `src/backends/registry.ts` | kind → adapter (Loki / ES / OS; Docker does not go here by design) |
| `src/backends/types.ts` | The **shape** of the backend contract (`LogBackend` / `BackendCaps` / `LogCounts` / `Truncation`…), with no implementation |
| `src/backends/loki.ts` | Loki adapter: `query_range` / `labels` / `ready`, flattening, merge order and counts |
| `src/backends/elastic.ts` | ES / OpenSearch adapter (split by `flavor`): `_search` / PIT paging / `_field_caps` / health |
| `src/plugins.ts` | The host-side "is a given plugin installed" rule, used to decide whether the Docker cell gets an entry |
| `src/tools.ts` | Agent tools + the tier table |
| `src/query.ts` | Normalization and clamping: timestamp units, window caps, limit clamping, count and truncation merging |
| `src/cursor.ts` | Both cursors share the version constant; a cursor from the wrong adapter is rejected at decode, and an undecodable one raises |
| `client-src/index.js` → `client.js` | Build-type client half: the settings card, with the i18n catalog inlined in the source |
| `client-src/pure.js` | The client's pure logic (draft validity / submit payload / time window and the "custom" tier / histogram and board layouting / click-to-zoom clamping / axis ticks / the three page-sort tiers), covered by vitest |
| `scripts/build-client.mjs` · `client-smoke.mjs` | The first bundles the client (strips imports + inlines pure.js, `exit(1)` on a leftover import); the second is the **render regression without a browser** (minimal DOM / React / fetch stubs) |
| `test/` | vitest cases (the repo root's `pnpm test` collects `packages/<pkg>/test/`) |

## Development

```bash
pnpm --filter @hyzyn/dsh-loglens build       # tsc → lib/, and rebuilds client.js
pnpm --filter @hyzyn/dsh-loglens typecheck   # tsc + client-lint (the six hard rules for client halves)
pnpm --filter @hyzyn/dsh-loglens lint:client
pnpm --filter @hyzyn/dsh-loglens smoke        # load + render regression for the client half (no browser)
```

Read these three before changing code (each is the single home for its subject; this README does not restate them):

| To learn | Read |
|---|---|
| The design and the contract (row model / counts and truncation / cursors / security and credentials) | [docs/design.md](./docs/design.md) |
| Phasing, open work, and **every real-machine acceptance conclusion** | [ROADMAP.md](./ROADMAP.md) |
| Defect numbers (`Dxx`: why a piece of code looks the way it does) | [DEFECTS.md](./DEFECTS.md) |

## Known limitations

- **Outbound fence: the connection surface = the sources you configure** ([src/net.ts](./src/net.ts)): loopback /
  private / public are all allowed; **link-local and cloud-metadata addresses** (such as `169.254.169.254`) are
  **always refused with no exemption**; **redirects are not followed** (a 3xx raises an error and echoes the
  `Location`). One request is capped at 8 MiB / 20s (`NET_MAX_RESPONSE_BYTES` / `NET_DEFAULT_TIMEOUT_MS`); the
  window and row-count caps are clamped by the host and reported honestly.
- **The fence judges the IP after DNS resolution**, and resolution and connection are two steps: between them a
  flipping DNS (rebinding) still leaves a window. This layer stops accidents and stale names, not an adversary who
  owns a domain.
- **The paging trade-off**: rows within the same nanosecond are **an inseparable group** — the last group makes the
  page **slightly exceed `limit`**; when it is too large to complete, **no cursor is given** and it only reports
  that matches may be incomplete.
- **`tail` (follow) is not implemented**: Loki's `capabilities().follow` is therefore declared **`false`**
  (`stream()` is unimplemented); declaring it true would point at a nonexistent entry. The maintainer **deferred**
  it (not blocked): there is no consumer, and the reasoning and "how to do it when we do" are in [ROADMAP.md](./ROADMAP.md).
  Guard: [test/capabilities.test.ts](./test/capabilities.test.ts).
- **Both aggregations are drawn only for sources with aggregation capability** (currently ES / OpenSearch): the host
  sends it with the `/query` response and the panel does not guess by type. When the host **does not provide** the
  self-description (an older host) it **says nothing** — "unknown" is not "unsupported".
- **Sorting only affects the page already returned**: the host has no server-side sorting (that would mean changing
  `NormalizedQuery`, which is P8-D).
- **One source per query** (v1 does not fan out across backends).
- The query area inside the panel is **controlled duplication** (the final position of design §5's three-way choice,
  option 1); the reasoning is in [docs/design.md](./docs/design.md) §5.
- **Real-machine acceptance status**: Loki pagination is verified (real Loki 3.7.8, including `loglens D02` /
  `D03`); its capability gate is not (see the next item); ES / OpenSearch have had several read-only review
  rounds; **click-to-zoom on a bar** is covered by static checks, unit tests and render regressions, but has
  not been clicked on real hardware. Per-item conclusions are in [ROADMAP.md](./ROADMAP.md).
- **Loki is not offered by the UI in this version** (maintainer's decision; rule in [ROADMAP.md](./ROADMAP.md) § Loki).
  What is missing is the **real-machine acceptance of its capability gate**, not the implementation — the adapter,
  the cursor, the `D02`/`D03` fixes and that acceptance run are all in the tree, and the host still accepts
  `kind: loki`, so **an existing Loki row still displays and queries faithfully**. To restore: add `'loki'` back to
  `KIND_OPTIONS` in `client-src/pure.js` (do not delete `KNOWN_KINDS` with it). Guard:
  [test/client-pure.test.ts](./test/client-pure.test.ts) pins both facts.
