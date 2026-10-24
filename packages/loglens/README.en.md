# @hyzyn/dsh-loglens

[中文](README.md) | English

> DSH's log query panel: **one query surface** normalized over Elasticsearch / OpenSearch / Docker — query, read the trend and drill down by field in the same card; the agent side is the read-only `loglens_*` tools.

Queryable backends: **Elasticsearch**, **OpenSearch**. Docker is not given its own adapter — it is a
**collection source** pointing at the existing `docker_logs` / `docker_logs_grep`. **Loki is not offered
by the UI in this version** (the adapter and its real-machine acceptance are in the tree, but its
capability gate was never verified on a real machine) — see
[§ Known limitations](#known-limitations) for the rule and how to restore it.

![The query card on an ES source: query string with dialect-specific clickable examples, filter chips, time distribution (with axis labels and the peak), and result rows colored by level with identity tags](https://cdn.jsdelivr.net/gh/hyzyn/dsh-plugin-kit@main/docs/dsh-plugin-kit-loglens-query.png)

## Features

- **Thin adapters over a single execution layer**: [src/backends/](./src/backends/) contains three adapters
  (Loki / ES / OpenSearch; ES and OpenSearch share one implementation, split by `flavor`). Docker is not part
  of the adapter layer: it is a collection source that reuses `docker_logs` / `docker_logs_grep`. Normalization
  and clamping are performed by [src/query.ts](./src/query.ts) alone (timestamp units, window caps, `limit`,
  direction, cursor pass-through) and adapters must not clamp again; the panel and the agent tools share
  [src/execute.ts](./src/execute.ts), so both operate on the same row model and truncation signals.
- **Capability self-description drives behaviour**: adapters implement `capabilities(): BackendCaps`
  (`queryLanguage` / `pagination` / `aggregations` / `follow` / `maxPageSize` / `maxWindowMs` / `fields`).
  Both UI rendering and parameter clamping follow that description; the panel does not infer chart capability
  from the source type. A flag declared `true` must have a corresponding implementation, reconciled per adapter
  by `test/capabilities.test.ts` (hence Loki declares `follow` as `false`: `stream()` is unimplemented).
- **Counts and truncation are contract fields**: `LogCounts.totalKnown` is true only when an exact total
  exists (the ES side must enable `track_total_hits`, and a `relation === 'gte'` response sets it false).
  Truncation is expressed by the `Truncation.reasons` enum, where `hit_limit` ("definitely more") and
  `hit_limit_maybe` ("possibly more") are two independent reasons, and `cursor_expired` is separate from both
  (an expired cursor does not imply further results). The UI presents these verdicts directly.
- **Cursors are backend-private encodings**: the Loki cursor uses the **complete ts group** as its coordinate
  (rows sharing one nanosecond cannot be split; see `loglens D03`); the ES / OpenSearch cursor is PIT +
  `search_after`, paging over the same snapshot, reporting `cursor_expired` on expiry without silently
  reopening (reopening would change the snapshot semantics). `decode` validates version and source; a failed
  decode raises rather than being treated as "no cursor".
- **A normalized row model**: time is epoch milliseconds throughout; levels are normalized to trace…fatal while
  keeping "the level stated by the document" distinct from "the level inferred from the body"
  (`levelInferred`), since the two carry different confidence and are not merged; nested fields are flattened
  into dotted tags; body highlighting uses the **character ranges** returned by the backend
  (`line.highlights`), and the UI does not literal-match the query string (`stream:stderr` / `-failed` /
  `error*` each follow their own matching rules; literal matching produces false marks).
- **Read-only by default, egress limited to configured sources**: all five `loglens_*` tools are in the
  **read** tier; the fence in [src/net.ts](./src/net.ts) judges the **resolved IP** (link-local and cloud
  metadata addresses refused), does not follow redirects, and caps a single request at 8 MiB with a 20s
  default timeout (`NET_MAX_RESPONSE_BYTES` / `NET_DEFAULT_TIMEOUT_MS`). The full boundary is in "Known limitations".


## Installation

```bash
dsh plugin --profile web add @hyzyn/dsh-loglens              # install from npm (once published)
dsh plugin --profile web add link:$(pwd)/packages/loglens    # develop against this repo
```

The aggregate package `@hyzyn/dsh-all` (or the repo-root bundle) already contains this plugin, so there is no
need to add it separately. Restart `dsh web` afterwards; a "Log query" card appears under
Settings → Plugin config (**saved changes take effect live**, no restart needed).

> If `@hyzyn/dsh-all` or the root bundle is already installed in the web profile, **do not** add this package
> on top — the plugin row would be mounted twice and startup fails with `duplicate loader entry id`.

## Usage

Configuration lives on the current profile's plugin entry (the volatile path of
`settings.update('loglens', …)`).
The **source configuration** collapses by default into one summary line on the plugin's full page
(`2 sources · current: 一` plus an "edit sources" button) and is expanded by default in the settings card
(configuring sources is that page's main job). When collapsed those rows are **not rendered** (not
`display:none`).

### Querying

- **Source**, **query string**, **time window** (15m · 1h · 6h · 24h, plus a "custom" tier when a bar is
  zoomed), **level** and **row count** all live in the query area; the query string takes the full remaining
  width of its row, everything else is gathered on the second row.
- **Enter runs the query**: pressing Enter in the query string or row count box is the same as clicking
  "query" (and Enter cannot fire while the button is greyed — the same condition as the button).
- **The query string supports field-name completion**: while typing, a candidate popup lists this source's
  fields (prefix matches first, at most 20, `FIELD_COMPLETION_MAX`); clicking one completes it in place to `field:` with the caret
  after the colon. Completion never fires a query; the field list is **fetched on first need** (cached per
  source, so one source is fetched once per session). The candidates are a **popup drawn by the card itself**,
  not the browser's native `datalist`.
- **Level** has seven entries (`any` / `trace+` … `fatal`), going through the host's **existing** `level`
  input. `warn+` means "warn and above" — the `+` only shortens the label, and the full wording lives in the
  boundary note right below it. Note that it is a **page-level filter**: the host filters on the page it
  returned, while the count and truncation hints remain those of the **unfiltered whole page** — the UI says
  this. Seeing levels across everything requires the backend to **actually have a level field**: on ES
  `log.level` is often entirely empty (the level is inferred from the body, carried as `levelInferred`), and
  such a source cannot even give levels to the group board.
- ES / OpenSearch query strings are handed to `query_string` **as written**, with no rewriting: empty means
  everything (`match_all`); `"phrase"`, `a OR b` (**space-separated words default to "or"**; "and" must be
  uppercase `AND`), and `name*` all follow Lucene's rules. `level:ERROR` often returns 0 rows and that is not
  breakage — in this index family `log.level` is mostly empty, so filter by level with the level dropdown.
- **Three spellings that silently change the meaning** (measured on a real machine; a wrong one **does not
  error, it just changes the count**):
  - **Square brackets are range syntax**, not a literal: `[ERROR]` becomes a range expression to Lucene, which
    is **not** the same as "contains the word ERROR". To match the word exactly write `"ERROR"` (a phrase) or
    `message:ERROR`.
  - **`=` has no special meaning**: `level=error` is not "field equals value"; it is usually read as two
    ordinary words (OR by default). For a real field filter use `field:value` (`log.level:ERROR`) or the
    panel's filter row.
  - **Only uppercase `AND` / `OR` / `NOT` are operators**; lowercase ones are ordinary words.
  Together these explain a common confusion: in the same window `[ERROR]` and `level=error` differ by 2x.
  **It is not tokenization** — neither spelling means "match ERROR exactly". For a reproducible denominator
  use `"ERROR"`, and when comparing counts across spellings suspect one of the three first.
- **The placeholder and the clickable examples follow the source dialect**: LogQL for Loki, Lucene
  (`query_string`) for ES / OpenSearch. The ES examples are `error` / `"Failed to"` / `error AND failed` /
  `stream:stderr`, the Loki ones are things like `{job="app"} |= "error"` — clicking one **fills it into the
  box and does not run the query** (look at it first, adjust if needed). The examples are not translated
  (they are code, not copy).
  Note that **Kibana's Discover defaults to KQL, not Lucene**: this panel is Lucene, where "and" is uppercase
  `AND` (lowercase is treated as an ordinary word — writing it wrong raises no error, only the numbers come
  out wrong).
- **A malformed query string tells you why**: ES returns `HTTP 200` for shard-level errors, with the reason in
  `_shards.failures[].reason` — it is carried as a single `[shard] <ES original wording>` line above the
  results (`q=level:(ERROR` → `Failed to parse query [level:(ERROR]`). A missing parenthesis and a genuinely
  broken cluster need different people.
- **When conditions changed but results have not been re-queried, the UI says so**: after any change to the
  query string / time window / level / row count / filters / source, the result area carries a line saying
  "the below is still the previous query" and simultaneously collapses "next page" and disables "group" — the
  ES / OpenSearch paging cursor is PIT + `search_after`, so paging with an old cursor under new conditions
  **raises no error, it just silently loses rows**. Click "query" to align both sides.

### The result area

- The result list shows timestamp to the millisecond · level · body, with the matching spans inside the body
  highlighted; when there is a cursor you get "next page" (deduplicated by id).
- **Rows with no level are marked `↳`**: without `multiline` on the collection side, one exception becomes
  several documents (measured: MyBatis splits a single failure into 11), and only the first carries a level —
  the rest are continuation lines like `\tat …` / `Caused by:` / `### Error querying`. They have no level and
  belong to none, so the row is marked `↳`, and **filtering by level reports "N of them are stack continuation
  lines"** — otherwise they would vanish silently and the error count would look smaller than it is. The
  criterion only recognises stack syntax (never "looks like one"): a false positive would exclude a real log
  from every level, so under-marking is preferred.
- **Level inference covers the shapes seen on a real machine**: `[ERROR]` prefixes, `level=ERROR` and
  `"log.level":"info"` (logfmt and JSON), logback's `18:31:54,850 |-INFO in …`, and logback's
  `14:00:00.123 ERROR 12345 ---`. Over a fixed 300-row sample, unclassified dropped from 139 to 3 (the rest
  being startup banners that genuinely have no level).
- **A row carries only one identity tag** (the first in host order, usually the container name) and shows
  only the **value** — the field name lives in the row hover / the ＋N popup / the field panel. The remaining
  tags are collected in a **"＋N"** at the end of the row: opening it lists **all** tags, and clicking any one
  filters immediately (clicking the background / × / Esc / any scroll collapses it). Values are never
  truncated (what is delivered is always the original value).
- Clicking the **whole row** (or the leading chevron) expands details: the full message + all tags + the raw
  original; a raw original over 20,000 characters (`RAW_PREVIEW_MAX`) is truncated **and its original length reported**.
- **Levels are colored by severity**: error/fatal red, warn orange, info normal, debug/trace grey, with a
  hairline separator between rows — a sweep of the eye tells you which row to look at. The default is "full"
  mode (bodies fully expanded); the "compact" toggle keeps each entry to 3 lines, for scanning for anomalies.
- The meta line carries four action buttons: `☰ fields` / `☰ compact` / `⇅ sort` / `🗑 clear results`.
  **Sorting only affects the page already returned** (the host has no server-side sorting, and the entry's
  hover text says so), cycling through three tiers: time / level / body. The default "time" is the **host's
  original order** (the only order sharing a source with the paging cursor — do not re-sort by ts, since
  multiple rows within the same nanosecond are an inseparable group).
- Both the "compact" and "sort" choices are remembered in the local browser (`localStorage`:
  `loglens.density` / `loglens.sort`) and do not follow you across devices; sorting **sends no request**.
- **The result area's height follows the window**: `min(720px, 72vh)` with a 300px lower bound, so taller
  windows show more rows.

### Time distribution and the group board

- Both are drawn **above** the result list (see the trend first, then the rows — the same order as Kibana),
  and are drawn **only for sources with aggregation capability** (currently ES / OpenSearch). Both charts
  **come from backend aggregations**, not from counting this page — that page may have been truncated by
  `limit`, and counting it would only yield a fake distribution / a fake ranking.
- **Time distribution**: under the bars there is a time scale (one cell at each end plus divisions across the
  window snapped to the bar grid, at most 4 cells; the precision follows the window span). Hovering a bar
  puts a bubble **directly above that bar** reading `19:22 · 315 rows · 1%`; with no hover it is not drawn.
  **Clicking a bar that has data zooms into that bucket** (the window is clamped to that span and re-queried;
  rows, distribution and board narrow together), the zoomed bucket stays highlighted, and the dropdown turns
  into a "custom" entry computed from the **real range**; clicking it again cancels the zoom.
  **Empty buckets are not clickable** (clicking into a 0-row window only yields "no matches", with nothing to
  tell you it was your own click). The zoomed window has a **1-minute lower bound**, and being clamped by it
  is stated explicitly (a silent narrowing is harder to diagnose than an error — the finest bucket step is
  10 seconds, so such a window usually comes back empty and all you would see is "no matches").
  Gaps between adjacent buckets are **filled with 0** — otherwise "nothing at all during that stretch" looks
  like "it kept streaming".
- **When the data flattens into a level band, baseline cropping is used instead**: log volume is usually
  steady, and after linear normalization the whole chart is a flat band, while **the point of a chart is to
  see differences**. When max / min ≥ 3 it goes linear; when < 3 it starts from `min × 0.9` to spread the
  differences out and **says so explicitly** ("bar height only shows relative height, not a proportion of the
  row count"); when everything is equal it neither crops nor prints that sentence. The rule and its cost are
  in the head comment of `histogramScale` in [pure.js](./client-src/pure.js).
- **The group field is supplied by the user** (the panel has **no default field** — field names differ
  across index families, and guessing one would be forging a scope on the user's behalf). Opening that cell
  shows this source's field-name candidates: the host **lists at most the first 200 by default** (when
  truncated, `truncated: true` and the "first 200 of N" warning are copied verbatim into the footer; the
  same source is not re-fetched). Only "usable names" appear among the
  candidates: container rows such as `object` / `nested` that have no value of their own are not listed; a
  field whose **type differs** across indices is marked "type conflict" at the end of its row (hovering lists
  both types).
- **The board writes no total**: the listed buckets do not add up to the total matches, and what is not
  listed is reported in the host's own words ("N more rows fall in buckets that are not listed"); when
  bucket counts are approximate, that warning is copied too. An empty-value key (the document lacks this
  field) is shown as "(empty)" rather than a nameless bar.

### The field panel

- The "fields" button on the meta line opens a **340px popup** (`FIELD_PANEL_WIDTH`; height follows the result area, the field
  list scrolls on its own), so the result table stays at full row width — the body does not narrow because
  of it. Clicking anywhere outside the panel, or clicking "fields" again, collapses it. **Collapsed, it does
  not call `/fields`**; expanding is what fetches it, once (cached per source).
- The panel counts the fields **hit on this page** from the current page's `labels` (with per-field row
  counts) and **that is the only section drawn** (a column can only be added from fields hit on this page).
- **Filtering is multi-word AND**: split on spaces, every word must hit, so both `cont name` and
  `container name` find `container.name`. While searching, the top right reports **how many hit** and
  **auto-expands every group**.
- **Fields are grouped by parent path**: each group has a collapsible header (parent path plus count) and the
  row shows only the last segment, with the full name in the row's `title`. Long last segments break after
  `_` / `-` / `.` rather than down the middle of a word.
- **Each field is a checkbox**: the whole row is clickable, up to 4 columns (`RESULT_COLUMN_MAX`), and once full the unselected rows
  turn grey and are disabled (selected ones can still be deselected). With extra columns the result table
  lays out by column width: the body has a 198px lower bound, and if the window is too narrow it **scrolls
  horizontally**.
- The panel also has a **selected columns** cell: column chips are drawn above the result table while the
  panel floats over it — this cell places the same column set inside the panel, so adding and removing happen
  in one place.

### Filtering and drill-down

- **Clicking a row on the board drills down by it**: it adds a structured filter (the host contract's
  `filters`) and re-queries, so rows, time distribution and the board **narrow together to the same subset**;
  clicking again cancels. Clicking an identity tag on a row takes the same `drillDown` path — no need to fill
  in the group field first, and no need to know the field name.
- Filtering is **one two-cell input**, with the chips further left:

  ```
  filter  [container.name ▾] = [prometheus ▾] [apply]
  ```

- After the left cell picks a field, the right cell auto-opens and fetches that field's top 8 values (`FIELD_VALUES_SIZE`; each row a
  bar of **relative** length, the exact count in the hover — it is measured at a different instant from the
  page's hit count, so putting them side by side would necessarily be read as arithmetic error).
- **Changing the field clears the right cell** (a value belongs to a field, not to this cell: otherwise
  `node-1` typed for `host.name` would be pinned onto `container.name`, and Enter would silently filter the
  wrong thing).
- When a field **is already being filtered** and you open its value dropdown, other values are still listed —
  the request drops that field's own filter (otherwise the aggregation only computes within "= current
  value" and the candidates would only ever be itself); once dropped, those numbers are not constrained by
  this field, and the top of the dropdown says so.
- Picking an entry immediately re-queries as "field = value" (the same `drillDown` as the board drill-down and
  the row tag); filters can also be removed one at a time with `×` on their chip. **One entry per field** (it
  goes through the same `Record`, and two entries would silently overwrite one); values are **not trimmed**
  (whitespace in a key name is part of the content, and trimming it silently matches nothing).
- **The empty-value bucket is not clickable**: a filter cannot express "field missing", and a clickable entry
  would only filter out something else.
- **Loki does not support structured filtering** (the host reports it verbatim) — with it, write the
  condition into the LogQL query string; the UI line says so too, because "switched source, filter still
  there" is possible.

### Docker sources

Selecting a Docker source turns the whole card into a **container-logs area**: **selecting this source
auto-fetches the containers** (no button needed; changing the Docker target re-fetches, the same target is
not fetched twice). Pick a container / time window / row count → view logs, going through the Docker panel
plugin's own routes (relative paths).

- The list only changes when containers start or stop, so the main row carries **no** refresh button — the
  re-fetch entry lives in the container-candidate popup footer (the same recipe as the field popup's
  "N fields in total + refresh"), and the failure / empty states get "retry" / "refresh" there.
- A failed container-list fetch **stays in that cell only** (it does not touch the error line at the top of
  the card, and a failure caches nothing, so the next trigger retries).
- **Switching containers does not re-fetch the logs automatically** (that is one `docker logs`, a heavy
  call): what is on screen is still the previous pull, and a line **above the logs** says so.
- This path has no `until`, a capped `tail`, and no grep — the UI says so, and for precise searching use the
  agent-side `docker_logs_grep`.

![A Docker source: the whole card becomes the container-logs area — pick a container / time window / row count, with the weak surface (no until, capped tail, no grep) stated inline](https://cdn.jsdelivr.net/gh/hyzyn/dsh-plugin-kit@main/docs/dsh-plugin-kit-loglens-docker.png)

## How to write a source address

| Kind | Address | Notes |
|---|---|---|
| `loki` | `http://127.0.0.1:3100` | May include a gateway prefix (e.g. `https://gw.example/loki`); queries go to `/loki/api/v1/query_range` |
| `elasticsearch` / `opensearch` | `http://user:pass@127.0.0.1:9200/logs-*` | **Index expression**: the "index" filled into the third cell of that row takes precedence; if empty, the address path is used (backwards compatible); with neither it is `*,-.*` (all indices **but excluding dotted system indices** such as `.kibana_1` / `.infini_*`). `loglens_sources` **echoes the resolved result**, and probe also reports "N rows in the last 15 minutes"; credentials become a Basic header and never enter the URL; paging uses PIT + `search_after`; **ES 7.10 / 7.11 are supported too** (the PIT key name and `_shard_doc` differences are in [ROADMAP](./ROADMAP.md)) |
| Public address | Same as above, fill it in directly | **The connection surface = the sources you configure**: loopback / private / public are all allowed (hosted logging services, and using public ranges internally, are both normal usage); only the link-local / cloud-metadata tier is unconditionally refused |
| `docker` | The third cell takes a **Docker panel target name** (e.g. `local`), **not** a URL | A collection source ("option 0" in the design): the agent side uses the existing `docker_logs` / `docker_logs_grep`; the panel side goes through the Docker plugin's own `/api/dsh-docker/config` (to fetch the target list) + `/containers` + `/logs` (relative paths), a weak surface: no `until`, a capped `tail`, no grep |

## Agent tools

Once sources are configured, the agent queries through these tools (**the authoritative list is the
registration site in [src/tools.ts](./src/tools.ts)**). They are **all** in the **read** tier (the tier table
is in [docs/permission-tier-plan.md](../../docs/permission-tier-plan.md) §2.1). The registration surface
narrows with the configuration (since 2026-10-24): **with zero sources only `loglens_sources` registers**
(it is the only entry that says "go configure a source"; the other four would just throw at call time);
when every configured source is Loki / Docker, `loglens_facets` is skipped too. Any source-list change
(panel add/remove, settings hot update) rebuilds the registration.

| Tool | Purpose |
|---|---|
| `loglens_sources` | List sources (with the **resolved index expression** and a probe count); other `loglens_*` tools take their `target` from here |
| `loglens_search` | Query: supports `filters` structured filtering and `level` (**and-above** semantics), `from` / `to` / `limit` / `direction` / `cursor` |
| `loglens_fields` | Show which fields exist. **Lists at most the first 200 by default** (the full count sits in `total`; when truncated `truncated: true` plus a warning with the next step; pass `limit` in segments for more). On the ES / OpenSearch side it **does not list `object` / `nested` container rows**, and a name whose **type differs** across indices is marked `conflict: true` with `esTypes` / `conflictDescriptions` |
| `loglens_facets` | Group by field / bucket by time ("which service is erroring"); currently only ES / OpenSearch have it — **when every configured source is Loki / Docker this tool is not registered at all**. **On zero buckets it says which cause it is** — using "how many rows this window holds" to tell "this field is a shell" from "nothing matched in this window", whose next steps are opposite |
| `loglens_context` | Fetch the context around one row (**two segments**: one counting back from the anchor, one counting forward, each filling its own `before`/`after` — so the anchor row itself is always included even in dense windows). The anchor is matched by **priority**: exact id → the variant with one leading `#` stripped → exact message → equal after whitespace normalization → one-way whitespace-normalized substring → `ts` alone (a **fallback** tier that applies whether or not a message was given; a higher tier always wins, within a tier the row nearest the `ts` wins, ties broken by id then message). The `#id` right after the message on each rendered row is that exact coordinate (labels may follow it); a non-id hit says in `warnings` which tier it used |

**Shape of the rendered row** (shared by `loglens_search` and `loglens_context`): time · level · message ·
`#id` · labels. Three details, all in service of reading it comfortably:

- **The timestamp carries an explicit offset**: `2026-10-18T22:01:43.123+08:00`, not `…Z`. Times inside log
  messages are almost always local, so a UTC stamp up front gives one row two different clocks and any
  epoch conversion goes wrong; with the offset, `Date.parse` still resolves the same instant (machine-usable)
  while the human sees the same clock as the message. The zone is the **host process's** local zone.
- **Multi-line messages (stack traces) keep their shape**: a `log.flags=multiline` stack trace is one document
  whose `message` already contains newlines, and echoing it raw yields flat "newline inside a line" text.
  Continuation lines now get a `    | ` prefix (the message content is untouched), and past 20 lines it
  truncates and **reports** the total and the number not shown, plus an executable next step ("pass
  `expand: true` and query again" — both paths take `expand`, which only affects rendering while the
  returned message stays full).
- **Pagination has guidance**: when the adapter provides a `nextCursor` (ES's PIT / Loki's full-ts-group),
  both the result and the rendered text say "pass `nextCursor` back as `cursor` (same window, same
  `direction`)" instead of leaving only "(truncated: hit_limit)" for the model to decode.
- **Only the identity keys are laid out** (`LABEL_PRIORITY` in `src/line.ts`, the first 3: container → host →
  stream); the rest collapse into `+N labels` — one filebeat document can flatten into 20 labels, and laying
  them all out drowns the message. **Collapsing is not dropping**: the full labels live in the result's
  `lines[].labels`.

**Model-facing announcement** (since 2026-10-24): on mount the plugin injects a named section into the
system prompt (`plugin:dsh-loglens`, order 151, ≤300 characters) that only carries the recommended query
chain (sources → search → context → facets), the facets capability gate, and where to go with zero sources;
the `announce` switch governs both it and the startup log (off = the plugin stays silent on both surfaces).
The five tools' schema descriptions were slimmed in the same pass (each ≤120 characters); details moved to
the result-side warnings and this section — the model-visible surface no longer restates the implementation
manual and carries no in-repo document references.

## HTTP surface (loopback)

| Action | Request | Notes |
|---|---|---|
| Read config | `GET /api/dsh-loglens/config` | Returns `{ ok, config: { enabled, targets }, plugins: { docker: true\|false } }` — `plugins.docker` is the freshly computed "is the docker plugin here" verdict ([src/plugins.ts](./src/plugins.ts)); the panel uses it to decide whether the Docker cell gets an entry |
| Toggle | `POST {"action":"enabled","enabled":false}` | **Exempt from the same-origin proof** (once disabled, the settings card is the only way back) |
| Add source | `POST {"action":"targets.add","target":{"kind":"elasticsearch","label":"Local ES","url":"http://127.0.0.1:9200"}}` | `kind` is `elasticsearch` / `opensearch` / `docker`; `loki` is **still accepted by the host** (the adapter exists) but is not offered by the UI — see [§ Known limitations](#known-limitations) |
| Update source | `POST {"action":"targets.update","id":"<id>","patch":{"url":"…"}}` | The id cannot be changed (it is the only way the browser side references it) |
| Remove source | `POST {"action":"targets.remove","id":"<id>"}` | |
| Query once | `POST /api/dsh-loglens/query` `{"target":"<id>","q":"…","from":…,"to":…,"limit":…}` | Used by the panel; returns rows + counts + truncation signals, **the same shape as `loglens_search`** (one execution layer). May carry `filters` (`{"field":"value"}`) — that is how the panel drills down from the board, and `/facets` carries the same copy |
| List fields | `POST /api/dsh-loglens/fields` `{"target":"<id>"}` (may carry `"limit":80` to narrow) | Fetched when the group-field cell is opened (the panel **passes no `limit`** → the host applies the default cap of the **first 200**); when truncated it returns `truncated: true` plus the "first 200 of N" warning, which the UI copies verbatim |
| Aggregate | `POST /api/dsh-loglens/facets` `{"target":"<id>","by":"container.name","interval":"5m"}` | Group by field / bucket by time (currently only ES / OpenSearch have it; the panel uses `interval` for the time distribution and `by` for the group board, and the tool surface is `loglens_facets`) |

Fence ([docs/design.md §4](./docs/design.md)): the whole route set goes through the **hardened tier**
`isLoopbackRequestStrict`; `/config` is exempt **per action** — only `enabled` is exempt from the same-origin
proof, while adding / removing / updating targets requires `hasSameOriginProof`
(a cross-site page could otherwise add a source pointing at the internal network from the config side, then
hit it through the read surface). **`/query` / `/fields` / `/facets` also require the same-origin proof**:
they are read-only yet they **reach the configured internal targets on the requester's behalf** and bring the
results back. When the plugin is disabled, only `/config` remains of the four routes.
Addresses accept http / https absolute URLs only.

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
| `src/net.ts` | **Outbound fence**: verdict on the resolved IP (link-local / cloud metadata refused; loopback / private / public allowed) + no following redirects + size and timeout caps; every outbound call of both adapters goes through it |
| `src/line.ts` | Row **observability**: nested fields flattened into dotted tags (preferred keys claim slots first) + level normalization and body inference (marking `levelInferred`) |
| `src/execute.ts` | Find the source / normalize / shape the response: the layer **shared by the agent tools and the panel routes** |
| `src/backends/registry.ts` | kind → adapter (Loki / ES / OS; Docker does not go here by design) |
| `src/backends/types.ts` | The **shape** of the backend contract (`LogBackend` / `BackendCaps` / `LogCounts` / `Truncation`…), with no implementation |
| `src/backends/loki.ts` | Loki adapter: `query_range` / `labels` / `ready`, flattening, merge order and counts |
| `src/backends/elastic.ts` | ES / OpenSearch adapter (split by `flavor`): `_search` / PIT paging / `_field_caps` / health |
| `src/plugins.ts` | The host-side "is a given plugin installed" rule: reads cordis's plugin registry (`ctx.registry.values()`) to decide whether the Docker cell gets an entry; a failed enumeration is always treated as "not installed" |
| `src/tools.ts` | Agent tools (`loglens_sources` / `search` / `fields` / `facets` / `context`) + the tier table |
| `src/query.ts` | Normalization and clamping: timestamp units, window caps, limit clamping, count and truncation merging |
| `src/cursor.ts` | Both cursors share the version constant: the Loki one (no row loss when the same ts has multiple rows) and the ES one (`pitId` + `searchAfter`); a cursor from the wrong adapter is rejected at decode, and an undecodable one raises an error rather than being treated as absent |
| `client-src/index.js` → `client.js` | Build-type client half: the settings card, with the i18n catalog inlined in the source |
| `client-src/pure.js` | The client's pure logic (draft validity / submit payload / time window and the "custom" tier / histogram and group-board layouting and payloads / window clamping for click-to-zoom / how axis ticks are chosen and how times are formatted / the three page-sort tiers), covered by vitest |
| `scripts/build-client.mjs` | Client bundling: strips imports + inlines pure.js; a leftover import makes it `exit(1)` |
| `scripts/client-smoke.mjs` | **Render regression without a browser**: a minimal DOM / React (which really re-renders) / fetch stubs render the card and assert that source rows have all four cells, that an ES row has one extra index expression, and that "fill the index → save → the request body carries index" |
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

- **Outbound fence: the connection surface = the sources you configure** (design §4.1 /
  [src/net.ts](./src/net.ts)): loopback / private / public are all allowed (hosted logging services, and
  non-RFC 1918 ranges used internally, are both normal usage); **link-local and cloud-metadata addresses**
  (such as `169.254.169.254`) are **always refused with no exemption**. **Redirects are not followed**: a 3xx
  from a source raises an error and echoes the `Location`, so you change the address and retry (a single 302
  can carry a request outside the allowlist).
- The per-request size cap is 8 MiB and the default timeout 20s (`NET_MAX_RESPONSE_BYTES` / `NET_DEFAULT_TIMEOUT_MS`); the caps on time window and row count are
  clamped by the host and honestly reported in the panel.
- **The fence judges the IP after DNS resolution**, and resolution and connection are two steps: between them
  a flipping DNS (rebinding) still leaves a window. Source addresses are filled in by the operator, and this
  layer stops accidents and stale names, not an adversary who owns a domain.
- **The paging trade-off (stated plainly)**: rows within the same nanosecond are **an inseparable group** —
  the last group makes the page **slightly exceed `limit`** (better a few extra rows than a cursor that loses
  rows); when the last group is too large to complete, **no cursor is given** and it only reports that
  matches may be incomplete.
- **`tail` (follow) is not implemented**: Loki's `capabilities().follow` is therefore declared **`false`**
  (`stream()` is unimplemented). That bit is echoed verbatim to the agent by `loglens_sources`, and declaring
  it true would amount to pointing at a non-existent entry — the same rule as `aggregations` ↔ `facets()`.
  Guard: [test/capabilities.test.ts](./test/capabilities.test.ts).
  The maintainer decided on 2026-10-12 to **defer it** (not blocked): there is no consumer, and the source
  actually in use is ES (following would have to go through `_search` + polling) — the reasoning and "how to
  do it when we do" are in [ROADMAP.md](./ROADMAP.md).
- **Both aggregations are drawn only for sources with aggregation capability** (currently ES / OpenSearch):
  the capability is sent by the host with the `/query` response, and the panel does not guess by type itself.
  Loki has no metrics queries, so it has neither chart here, and the UI says so plainly. When the host **does
  not provide** the capability self-description (an older host), it **says nothing** — "unknown" is not
  "unsupported".
- **Sorting only affects the page already returned**: the host has no server-side sorting (that would mean
  changing `NormalizedQuery`, which is P8-D).
- **Docker is only a collection source** and is not an adapter: the agent side uses the existing `docker_logs`
  / `docker_logs_grep`, and this plugin does not wrap it; the panel side goes through the panel half of
  option 0, with the weak surface (no `until`, a capped `tail`, no grep) honestly annotated in the UI.
- **One source per query** (v1 does not fan out across backends).
- The query area inside the panel is **controlled duplication** — the **final position** of design §5's
  three-way choice (settled 2026-10-12, option 1): the log view is built inside this plugin's own card and
  shares no browser module with other plugins. The reasoning is in [docs/design.md §5](./docs/design.md).
- **Loki is not offered by the UI in this version** (2026-10-18, maintainer's decision). It is not
  "unimplemented": the adapter, the cursor, the two paging fixes (`D02`/`D03`) and that real-machine
  acceptance (real Loki 3.7.8) are all still in the tree, and the host still accepts `kind: loki`.
  What is missing is the **real-machine acceptance of its capability gate** (see
  [ROADMAP.md](./ROADMAP.md) § "not verified"). So the kind dropdown no longer lists it and a new row
  defaults to ES; **an existing Loki row still displays and queries faithfully** (`kindOptionsFor`
  appends it to that row's options — when a `<select>`'s value matches no `<option>`, the browser falls
  back to drawing the first one, which is exactly the shape of `loglens D04`). To restore: add `'loki'`
  back to `KIND_OPTIONS` in `client-src/pure.js`. Guard:
  [test/client-pure.test.ts](./test/client-pure.test.ts) pins both "not in the dropdown" and "a known
  kind is never rewritten".
- **Real-machine acceptance progress**: the Loki side **paging** is verified (real Loki 3.7.8, including
  the two paging defects `loglens D02` / `D03`, item by item in [DEFECTS.md](./DEFECTS.md); but its
  capability gate is not — see the bullet above); the ES / OpenSearch side has
  been through several read-only review rounds; **click-a-bar zoom** is covered by three layers — static
  checks, unit tests and the render regression — and **that click has not been made on a real machine**. The
  per-item conclusions are in [ROADMAP.md](./ROADMAP.md) and not restated here.
