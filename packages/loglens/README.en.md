# @hyzyn/dsh-loglens

[中文](README.md) | English

Normalize **heterogeneous log backends into a single query surface**: Loki / Elasticsearch / OpenSearch /
Docker each get a thin adapter, and the outside world only ever sees one normalized row model, honest
count and truncation signals, and tools handed to the agent.

> **Status: the settings surface, the query foundation (contract / normalization / cursors), the Loki and
> ES / OpenSearch adapters, the outbound fence and the agent tools are all in place (2026-10-11 ~ 10-12);
> the browser-side result view, time distribution, the **group-by-field board**, **click-a-bucket
> drill-down** and **click-a-bar zoom** are also in place (the board and drill-down landed 2026-10-13,
> click-to-zoom closed out 2026-10-15). **Click-a-bucket drill-down** has been clicked through once on a
> **real host + real ES** (2026-10-13: the request body of the drill-down shot, the chips, and clicking
> again to cancel); **click-a-bar zoom so far only has static checks, unit tests and render regression
> (`client-smoke`) coverage — no real-machine acceptance run yet** — the per-item conclusions are in
> [ROADMAP.md](./ROADMAP.md).**
> **The Loki side has passed real-machine acceptance** (real Loki 3.7.8, isolated environment): paging was
> flipped to `cursor`, and two defects were caught and fixed on the real machine (`loglens D02` / `D03`,
> item by item in [DEFECTS.md](./DEFECTS.md)); the real-machine reconciliation is 12/12 groups with no
> loss and no duplication. The ES / OpenSearch side has been through several read-only review rounds
> against a real cluster. Every conclusion lives in [ROADMAP.md](./ROADMAP.md) and is **not restated
> here**. The single home for the design and the contract is [docs/design.md](./docs/design.md); phasing
> and open work are in [ROADMAP.md](./ROADMAP.md).

## What you can do today

- Add, edit and remove "log sources" (kind / label / address / the ES **index expression**) and toggle the
  plugin in the **Settings → Plugin config → Log query** card.
- Let the agent query through these tools (once sources are configured, **the authoritative list is the
  registration site in [src/tools.ts](./src/tools.ts)**):
  `loglens_sources` lists sources (with the **resolved index expression** and a probe count),
  `loglens_search` queries (supports `filters` structured filtering and `level`-and-above filtering),
  `loglens_fields` shows which fields exist
  (on the ES / OpenSearch side it **does not list `object` / `nested` container rows**, and a name whose
  **type differs** across indices is marked `conflict: true` with `esTypes` / `conflictDescriptions`),
  `loglens_facets` groups by field / buckets by time ("which service is erroring"), and
  `loglens_context` fetches the context around one row.
  Queryable backends: **Loki**, **Elasticsearch**, **OpenSearch** (Docker goes through the existing
  `docker_logs` / `docker_logs_grep`). They are **all** in the **read** tier (the tier table is in
  [docs/permission-tier-plan.md](../../docs/permission-tier-plan.md) §2.1).
- **Query straight from the same card**: source / query string / time window (15m · 1h · 6h · 24h, plus
  the "custom" tier when a bar is zoomed) / row count → result list (timestamp to the millisecond · level ·
  body, **with the matching spans inside the body highlighted**)
  + honest count and truncation hints (**"definitely more" and "possibly more" are stated separately** —
  when the matched count happens to equal the row limit it is not called "truncated", and no "next page"
  is offered that would necessarily land on an empty page; the rule is `pageLimitFlags` in
  [src/query.ts](./src/query.ts), and it can only be exact when there is a precise total — Loki has no
  total, so there it only says "possibly");
  when there is a cursor you get "next page" (deduplicated by id). The **placeholder in the query box
  follows the source dialect**: LogQL for Loki, Lucene (`query_string`) for ES / OpenSearch — no more
  telling ES that "Loki is LogQL".
  Under the query-string line there is a row of **clickable examples** (per source dialect: for ES
  `error` / `"Failed to"` / `error AND failed` / `stream:stderr`, for Loki things like
  `{job="app"} |= "error"`) — clicking one fills it into the box and **does not run the query** (look at it
  first, adjust if needed). The examples themselves are not translated (they are code, not copy).
  **The query string supports field-name completion**: while typing, a candidate popup lists this source's
  fields (prefix matches first, at most 20); clicking one completes it in place to `field:` with the caret
  after the colon. Completion never fires a query; the field list is **fetched on first need** (cached per
  source + in-flight latch, so one source is fetched once per session) — you do not have to go click
  somewhere else first.
  **Body highlighting gets its positions from the backend; the UI only draws them**: ES's `highlight` is
  converted into character ranges (`line.highlights`), and the UI never does literal matching of the query
  string against the body — `stream:stderr` has none of those characters in the body, `-failed` is an
  exclusion, `error*` / `~` each have their own rules, and marking literally would be wrong about half the
  time; **a wrong mark is worse than no mark**. With no positions, the paragraph stays plain text.
  Note that **Kibana's Discover defaults to KQL, not Lucene** (a placeholder that says KQL means that
  language): "and" is `and` in KQL but **uppercase** `AND` in Lucene (lowercase is treated as an ordinary
  word); writing it wrong raises no error, only the numbers come out wrong. This panel is Lucene.
  ES / OpenSearch query strings are handed to `query_string` **as written**, with no rewriting: empty means
  everything (`match_all`); `"phrase"`, `a OR b` (**space-separated words default to "or"**; "and" must be
  **uppercase** `AND` — lowercase `and` is an ordinary word, and the `+` in `a+b` is only a separator
  synonymous with a space, not "and"), and `name*` all follow Lucene's rules. `level:ERROR` often returns 0
  rows and that is not breakage — in this index family `log.level` is mostly empty and the level is
  **inferred** from the body (rows carry `levelInferred`), so filter by level with the level dropdown.
  **When the query string is malformed you can see why**: ES returns `HTTP 200` for shard-level errors with
  the original wording in `_shards.failures[].reason` — it is now carried as a single
  `[shard] <ES original wording>` line above the results (`q=level:(ERROR` shows
  `[shard] Failed to parse query [level:(ERROR]`). Before this, the place only said "truncated: some shards
  failed", which looks exactly like a real shard failure — and a missing parenthesis and a broken cluster
  need different people.
- **When conditions changed but results have not been re-queried, the UI says so**: after any change to the
  query string / time window / level / row count / filters / source, the result area carries a line saying
  "the below is still the previous query", and simultaneously collapses "next page" and disables "group".
  This is not cosmetic — **the ES / OpenSearch paging cursor is PIT + `search_after`**, so paging with an
  old cursor under new conditions **raises no error**, it just silently loses or misaligns rows; "group"
  would likewise pair the new query string with the previously echoed window. Click "query" to align both
  sides and the entries come back.
- **Both aggregations are drawn inside the card** (whether to draw each is decided by the capability
  self-description the host sends with the `/query` response; the panel does not guess by type):
  **time distribution** (a bar chart bucketed by time) and **group by field** (the terms board — the answer
  to "which service is erroring"). On the time distribution, **clicking a bar that has data zooms into that
  span**: the window is clamped to that bucket and re-queried (rows, distribution and board narrow
  together), the bucket being zoomed stays highlighted, and the dropdown turns into a "custom" entry
  computed from the **real range**; switching back to a preset drops that span.
  **Empty buckets are not clickable** (clicking into a 0-row window only yields "no matches", with nothing
  to tell you it was your own click), and **being clamped by the lower bound (1 minute) is stated
  explicitly** (a silent narrowing is harder to diagnose than an error).
  The board needs a group field first: type it, or **open that cell** for this source's field-name
  candidates (opening fetches, **not passing `limit` = no truncation**, so what you see is every field of
  this source — the same basis as Kibana's `_field_caps`; the same source is not re-fetched, the popup
  footer reports "N fields total" and offers "refresh" — length is absorbed by the popup's own substring
  filter plus scrolling).
  The candidates are a **popup drawn by the card itself** (taking its recipe from the host menus: radius,
  hairline stroke and shadow, row height, hover background), not the browser's native `datalist` — the text
  in the box filters the candidates by substring, arrow keys move the current row, Enter takes it, Esc
  collapses, clicking a row fills it; both chevrons (card-header collapse / field box) are **the official
  stroked chevron**. Only "usable names" appear among the candidates: container rows such as `object` /
  `nested` that have no value of their own are not listed; a field whose **type differs** across indices is
  marked "type conflict" at the end of its row (hovering lists both types) — grouping by it would only cover
  part of the indices, so not marking it would be the same as not saying anything.
- **Clicking a row on the board drills down by it**: it adds a structured filter (the host contract's
  `filters`) and re-queries, so rows, time distribution and the board **narrow together to the same subset**;
  clicking again cancels, and filters can also be removed one at a time with `×` on their chip. The empty-value
  bucket is not clickable (a filter cannot express "field missing", see "Known limitations" below).
- **The right side of a result row is "who wrote it"**: the row carries only **1** identity tag (the first
  in host order, usually the container name; only the **value** is shown, the field name lives in the row
  hover / the ＋N popup / the field panel),
  and **clicking it adds a "field = value" filter and immediately re-queries** (the same path as clicking
  the board to drill down) — no need to first fill in the group field and then look at the board, and no
  need to know the field name up front. The remaining tags are collected in a **"＋N"** at the end of the
  row: opening it shows a popup listing **all** tags, and clicking any one of them filters immediately too
  (clicking the background / × / Esc / any scroll collapses it); hovering still shows all tags and the raw
  original. Values are never truncated (what is delivered is always the original value; the popup shows
  `display`, with `…` when too long).
  **Why only 1 is kept** (knife 9, 2026-10-17): on the real machine, in 100 rows `host.name` had a single
  value and `log.file.path` corresponded one-to-one with the container name; 3 chips plus "N more" pushed
  row height to 4 lines. Short log lines went from ~74px down to 42px, and the number of scannable rows
  per screen nearly doubled.
- **The field panel is a popup and does not take width from the logs** (P8-B / knife 12, 2026-10-17): the
  "fields" button on the meta line opens a **340px popup** (height follows the result area, the field list
  scrolls on its own), so the result table stays at full row width — the body keeps its 577px and does not
  narrow because of it. Clicking anywhere outside the panel, or clicking "fields" again, collapses it.
  **The panel grows out of the button that triggered it** (knife 20): its right edge aligns with the
  button's right edge and its top edge sits 4px below the button's bottom edge — measured on the real
  machine, the horizontal difference is **0px**. Before the change it was pinned to the left end of the
  result area while the button sat at the right end of the row: a horizontal difference of **123px**, where
  you clicked the right button and the thing opened at the far left (the same disease as knife 17's
  "readout pinned to the left end, bars in the middle of the chart").
  The backdrop changed to full-screen `fixed` to match: once the panel floats at the meta-line layer, a
  backdrop covering only the result area would miss the blocks above it, and clicking the empty space above
  the panel would "do nothing". Inside the panel, the fields **hit on this page** are counted from the
  current page's `labels` (with per-field row counts), and are then split by `/fields` into **other
  available fields** and **type conflicts**; there is a filter box at the top, and long field names wrap at
  the point (not hard-cut). **Collapsed, it does not call `/fields`**; expanding is what fetches it, once
  (cached per source).
  **Filtering is multi-word AND** (knife 21, 2026-10-17): split on spaces, every word must hit, so both
  `cont name` and `container name` find `container.name` — before the change only one whole substring was
  accepted, and typing a space returned 0 results (not "not found" but "this box does not accept your way
  of typing", and it is the only navigation over 92 fields).
  While searching, the top right reports **how many hit** (more useful than "how many in total") and
  **auto-expands every group**.
  **Fields are grouped by parent path**: on the real machine **58 of this source's 92 fields are
  `container.labels.*`**, and a flat list mixed short names like `agent.name` with long ones like
  `container.labels.com_docker_compose_project_environment_file`. Now each group has a collapsible header
  (parent path plus count) and **the row shows only the last segment** — those 58 wrapped strings become 58
  short words (`architecture` / `build-date` / …), the parent path is stated by the header, and the full
  name is still in the row's `title`. By default only the **hit section** is expanded (those are the fields
  this source actually uses), the rest and the conflicts are collapsed (scroll height went from ~2878px
  down to **1494px**).
  **Long last segments break on "words"** (knife 23, 2026-10-17): the last segment of a `container.labels.*`
  field is itself around 40 characters (`com_docker_compose_project_environment_file`), and CSS's
  `overflow-wrap:anywhere` used to let the browser **fill** the line before breaking — on the real machine
  `com_docker_compose_config-hash` was split into `com_docker_compose_conf` / `ig-hash`, cracking a word
  down the middle. Now a `<wbr>` break point follows each `_` / `-` / `.`, and the width went from 300 to
  340: of the real machine's 92 fields, the wrapped ones dropped from **10 to 6**, and the remaining 6 all
  break after a separator (`com_docker_compose_project_` / `environment_file`). The panel footnote is the
  same story: it used to squeeze 464px into a 284px cell and get cut by an ellipsis mid-sentence; now it is
  one short line ("the number is this page's row count; a column needs per-row values") plus the full
  passage in `title`.
  The panel also has a **selected columns** cell: column chips are drawn above the result table while the
  panel floats over it — clicking "columns" from the panel puts the chips exactly behind it, so you cannot
  see the column you just added. This cell places the same column set inside the panel, so adding and
  removing happen in one place.
  **Filtering is one two-cell input, no longer a popup** (knife 30, 2026-10-17):
  ```
  filter  [container.name ▾] = [prometheus ▾] [apply]      ← chips sit further left
  ```
  The left cell selects a field (type to narrow, arrow keys to pick); picking one **auto-opens the right
  cell** and fetches that field's top 8 values
  (each row a bar of **relative** length, the exact count in the hover — it is measured at a different
  instant from the page's hit count, and the real machine caught "value row 15242 / same-screen hit
  15199", so putting them side by side would necessarily be read as arithmetic error),
  and the right cell **also accepts typing** — long-tail values, values with spaces or quotes, and `*`
  wildcards can only be expressed by typing, so "no candidate selected" is a normal state, and Enter takes
  the typed string. Backspace deletes a character when the value cell has text, and falls back to the field
  cell when it is empty.
  **Changing the field clears the right cell** (a value belongs to a field, not to this cell: otherwise
  `node-1` typed for `host.name` would be pinned onto `container.name`, and Enter would silently filter the
  wrong thing). When a field **is already being filtered** and you open its value dropdown, other values are
  still listed — the request drops that field's own filter (otherwise the aggregation only computes within
  "= current value" and the candidates would only ever be itself, so changing the value would require
  deleting the chip first); once dropped, those numbers are not constrained by this field, and the top of
  the dropdown says so.
  Picking an entry immediately re-queries as "field = value" (the same `drillDown` as the board drill-down
  and the row tag).
  This knife removed the "＋ filter" button and the **whole filter popup** behind it — they did the same
  thing, and the shape of this condition was always just the two words "field = value". The rules from the
  popup that still hold (top values with counts, click a value to filter, type long-tail values, group by
  parent path) all moved into this cell; the **column picker** (the "fields" button on the meta line) stays
  and is therefore reduced to a single panel.
  **The column picker only picks columns** (knives 25/26, 2026-10-17): it lists only the fields **hit on
  this page** (a column's value comes from each row's labels; adding any other field would draw all `—`);
  on the real machine that cut 92 fields down to **35** (scroll 1470px → 1278px).
  **Each field is a checkbox**: the whole row is clickable (clicking the name, the count or the checkbox all
  select it), the checkbox is a real `<input type=checkbox>`, and the selected color uses the host's neutral
  brand; once 4 columns are full, unselected rows turn grey and are disabled (selected ones can still be
  deselected — otherwise nothing could be removed once full). The old "columns" button was deleted:
  "columns" is an action name, while what this column does is **selection**.
  **Indentation is a vertical line** (knives 27/29, 2026-10-17): a group header's chevron and a row's
  checkbox share the same 16px leading slot and the same 4px gap; rows inside a group are shifted **17px**
  right relative to the header and carry a `.5px` vertical guide, so at a glance you can tell who belongs
  to whom. On the real machine the chevron used to be at x=199 and the checkbox at x=219 (a 20px
  difference), with names 28px off the group name; now both lines are off by 0.
  **Columns can only be added for fields "hit on this page"** — the other fields have no per-row value, and
  a column that draws all `—` is worse than no column; they can still be filtered (from the two-cell filter
  input). When there are extra columns the result table switches to laying out by column width: the body has
  a 198px lower bound, and if the window is too narrow it **scrolls horizontally** (with no extra columns it
  is still the original flex row).
  **Only "name + count" remain inside a row** (knives 19/28, 2026-10-17): the count is **right-aligned with
  tabular figures** (`tabular-nums`) — before the change it jumped between 18 and 21px (`100` / `73` / `72`),
  and reading a column felt like a sawtooth; group titles are `position:sticky` pinned to the top of the
  scroll area (so you still know which group you are looking at when there are enough fields to scroll), and
  the filter box has a magnifier and a × that appears only when there is content. Row height is **26px**
  (which only really landed after the action bucket was removed).
- **Log viewing defaults to "full" mode** (bodies fully expanded, as before); the meta line has a "compact"
  toggle that keeps each entry to **3 lines** (with an ellipsis), for "scan for anomalies" glances. The
  choice is remembered in the local browser (`localStorage`, does not follow you across devices).
  Clicking the **whole row** (or the leading chevron) expands details: the full message + all tags (only 1 on
  the row) + the raw original; a raw original over 20,000 characters is truncated **and its original length
  reported**. **Levels are colored by severity** (error/fatal red, warn orange, info normal, debug/trace
  grey), with a hairline separator between rows — a sweep of the eye tells you which row to look at, instead
  of a screen uniformly painted in one alarm color.
- **The result area's height follows the window**: no longer a fixed 420px (in a 900px-tall window only 7 of
  100 rows were visible); it is now `min(720px, 72vh)` with a 300px lower bound — **11 rows** visible in the
  same window, and taller windows show more.
  (Knife 15 on 2026-10-17 raised the lower bound from 240 to 300 and the upper bound from 640 to 720: that
  same pass also squeezed the three blocks above by a whole screen, and the freed height went to the results —
  they are the body of this panel.)
- **The source configuration can be collapsed**: on the plugin's full page it collapses by default into one
  summary line (`2 sources · current: 一` plus an "edit sources" button), while in the settings card it is
  expanded by default (configuring sources is that page's main job). On the real machine at 816×782:
  expanded 1296px → collapsed **1000px**, so those two source-form rows (~300px) no longer permanently
  occupy the screen where you query logs. When collapsed those rows are **not rendered** (not
  `display:none`).
- **Two rows in the query area, two layers on the meta line**: the query string takes the full remaining width
  of its row (**160px → 473px** in the real machine's 816px window — it is the only place in this panel where
  a long string is typed), while the time window / level / row count / group field are gathered on the second
  row (the group field used to have its own row, with an always-empty "reply" slot kept free to its right).
  The meta line splits into "count + four buttons" and "the host's long warning sentence": that 90-character
  level warning no longer pushes the buttons onto a third line (the meta line went from **102px → 28px** in
  the same window).
- **The four action buttons on the meta line carry icons** (knife 18, 2026-10-17): `☰ fields` / `☰ compact` /
  `⇅ sort` / `🗑 clear results`.
  They used to be four **plain-text** buttons, four different lengths crammed on one line, with no way to tell
  "which are switches and which are one-off actions", and "sort" dragged a "sort:" prefix across the buttons
  and kept growing. The icons are **taken verbatim from the host's own front-end bundle**
  (`IconFlatListOutlineRegular` / `IconWrapLinesOutlineRegular` / `IconChevronsUpDownOutlineRegular` /
  `IconTrashOutlineRegular`), with the recipe copied too: `viewBox 0 0 16 16`, `fill:none`,
  `stroke:currentColor`, `strokeWidth 1`. The sort button now only shows the **tier name** (time / level /
  body) — "this is sort" is said by the icon, and the full sentence (including the "only sorts this page"
  boundary) stays in `aria-label` and `title`.
  Real-machine readings: the first three are equal-width at **62px**, and the width **does not change** when
  toggling "compact ↔ full".
- **The meta line has a "sort" entry** (three tiers cycling: time / level / body). **Sorting only affects the
  page already returned**: the host has no server-side sorting (that would mean changing `NormalizedQuery`,
  which is P8-D), so the entry's hover text states this itself; the default "time" is **the host's original
  order** (the only order sharing a source with the paging cursor — do not re-sort by ts, since multiple rows
  within the same nanosecond are an inseparable group).
  "Level" goes from severe to light (fatal → error → warn → info → debug → trace, with no-level at the
  bottom), keeping the host's original order within a tier.
  The choice is likewise remembered in `localStorage` (`loglens.sort`), and sorting **sends no request**.
- **The time distribution is readable**: the bars use a light step of the accent color (previously 6%
  near-black, leaving only a ghost of the chart); under the bars there is a **time scale**
  (one cell at each end plus divisions across the window snapped to the bar grid, at most 4 cells; the
  precision follows the window span: seconds for ≤2 minutes, hours and minutes for <12 hours, with dates
  when longer). "Which minute is the tallest bar" no longer requires counting bars.
- **The time distribution's readout follows the bars** (knives 16/17, 2026-10-17): hovering a bar puts a
  bubble **directly above that bar** reading `19:22 · 315 rows · 1%` and hinting "click to zoom into this
  span". The position is computed from the bar index (bar widths are `flex:1` equal divisions, so the index
  is the real on-screen position); measured on the real machine, the bubble's center and the bar's center
  differ by **0px**.
  With no hover it is **not drawn** — the version pinned to the left end was called out by the maintainer
  ("the bars and the information are too far apart"): bars in the middle of the chart, the readout at the far
  left, so every step meant crossing most of the screen. The bubble also replaced the native tooltip (that
  grey box covered the horizontal scale and still said `18:28:00.000`); the full sentence moved into
  `aria-label` for screen-reader users.
- **The peak bar is visible**: the title says "peak 681 rows", and 681 versus a usual 460 is a small
  difference — not pickable by eye among 61 bars.
  The peak bar now uses the primary accent step (`ll_histBarPeak`), so the reader can find it at a glance.
- **When the data flattens into a level band, baseline cropping is used instead**: log volume is usually
  steady (in that real-machine set, **50 of 61 bars fell between 60% and 70%**), and after linear
  normalization the whole chart is a flat band — **the point of a chart is to see differences**, so that is
  as good as not drawing it. The drawing method is now chosen from the data itself: when max / min ≥ 3 it
  goes linear (honest, easy to read); when < 3 it starts from `min × 0.9` to spread the differences out and
  **says so explicitly** ("bar height only shows relative height, not a proportion of the row count"); when
  everything is equal it neither crops nor prints that sentence. The rule for how bar height is computed,
  and its cost, are in the head comment of `histogramScale` in [pure.js](./client-src/pure.js).
- **Enter runs the query**: in the query string and row count boxes of the query bar, pressing Enter is the
  same as clicking "query" (Enter only, and Enter cannot fire either while the button is greyed — the same
  condition as the button). Clicking **the bar currently being zoomed** cancels the zoom and returns to the
  tier before it.
- **Level** has a dropdown in the query bar (`any` / `trace+` … `fatal`, seven entries), going through the
  host's **existing** `level` input. The option labels use the **`+`** notation customary in log viewers
  (`warn+` = warn and above) rather than "warn and above" — that cell is at its narrowest only 96px, and
  with five of the seven entries dragging the four characters "and above", a column would be nothing but
  repeated tails with the level names as supporting cast.
  **Only the labels are shortened**: how to read `+` and the full wording live in the boundary note below
  ("levels filter as 'and above' — `warn+` in the dropdown means warn and above — and it filters on the page
  returned"), so not one bit of meaning is lost.
  Note that it is a **page-level filter**: the host filters on the page it returned, while the count and
  truncation hints remain those of the **unfiltered whole page** — the UI says this.
  Seeing levels across everything requires the backend to **actually have a level field**: on ES `log.level`
  is often entirely empty (the level is inferred from the body), and such a source cannot even give levels to
  the group board; the UI states that premise too (no longer pointing down a dead end).
- **You can see "who wrote it" on a row**: filebeat-style nested fields (`container.name` / `host.name` /
  `log.file.path`) are flattened into dotted tags and placed in front; levels are normalized into six tiers
  from trace to fatal, inferred from the body when the document lacks one (`levelInferred: true` in that
  case, and `loglens_search`'s `level` parameter is **and-above** semantics).
- The panel and the agent tools share **one execution layer** ([src/execute.ts](./src/execute.ts)): the same
  normalization, the same truncation signals — so "the panel says one thing and the tool says another" cannot
  happen.
- A **Docker target** turns the card into a "container logs" area (**selecting this source auto-fetches the
  containers**, no button needed; changing the Docker target re-fetches, the same target is not fetched twice,
  and since containers change there is a "refresh" → pick a container / row count → view logs), going through
  the Docker panel plugin's own routes (relative paths); this path has no `until`, a capped `tail`, and no
  grep — the UI says so, and for precise searching use the agent-side
  `docker_logs_grep`. A failed container-list fetch **stays in that cell only** (it does not touch the error
  line at the top of the card, and a failure caches nothing, so the next trigger retries).

## HTTP surface (loopback)

Configuration lives on the current profile's plugin entry (the volatile path of
`settings.update('loglens', …)`).

| Action | Request | Notes |
|---|---|---|
| Read config | `GET /api/dsh-loglens/config` | Returns `{ ok, config: { enabled, targets } }` |
| Toggle | `POST {"action":"enabled","enabled":false}` | **Exempt from the same-origin proof** (once disabled, the settings card is the only way back) |
| Add source | `POST {"action":"targets.add","target":{"kind":"loki","label":"Local Loki","url":"http://127.0.0.1:3100"}}` | `kind` is `loki` / `elasticsearch` / `opensearch` / `docker` |
| Update source | `POST {"action":"targets.update","id":"<id>","patch":{"url":"…"}}` | The id cannot be changed (it is the only way the browser side references it) |
| Remove source | `POST {"action":"targets.remove","id":"<id>"}` | |
| Query once | `POST /api/dsh-loglens/query` `{"target":"<id>","q":"…","from":…,"to":…,"limit":…}` | Used by the panel; returns rows + counts + truncation signals, **the same shape as `loglens_search`** (one execution layer). May carry `filters` (`{"field":"value"}`) — that is how the panel drills down from the board, and `/facets` carries the same copy |
| List fields | `POST /api/dsh-loglens/fields` `{"target":"<id>"}` (may carry `"limit":80` to narrow) | Fetched when the group-field cell is opened (the panel **passes no `limit`** → the host does not truncate and lists everything); only when `limit` really truncated does it return `truncated: true` plus that warning, which the UI copies verbatim |
| Aggregate | `POST /api/dsh-loglens/facets` `{"target":"<id>","by":"container.name","interval":"5m"}` | Group by field / bucket by time (currently only ES / OpenSearch have it; the panel uses `interval` for the time distribution and `by` for the group board, and the tool surface is `loglens_facets`) |

Fence ([docs/design.md §4](./docs/design.md)): the whole route set goes through the **hardened tier**
`isLoopbackRequestStrict`; `/config` is exempt **per action** — only `enabled` is exempt from the same-origin
proof, while adding / removing / updating targets requires `hasSameOriginProof`
(a cross-site page could otherwise add a source pointing at the internal network from the config side, then
hit it through the read surface). **`/query` / `/fields` / `/facets` also require the same-origin proof**:
they are read-only yet they **reach the configured internal targets on the requester's behalf** and bring the
results back. When the plugin is disabled, only `/config` remains of the four routes.
Addresses accept http / https absolute URLs only; loopback / private / public are all allowed surfaces, while
**link-local / cloud-metadata addresses are refused**.

```bash
# read
curl -s http://127.0.0.1:3080/api/dsh-loglens/config
# add a local Loki: the command line has no browser same-origin proof, so bring an Origin header
curl -s -X POST http://127.0.0.1:3080/api/dsh-loglens/config -H 'content-type: application/json' -H 'origin: http://127.0.0.1:3080' -d '{"action":"targets.add","target":{"kind":"loki","label":"Local Loki","url":"http://127.0.0.1:3100"}}'
```

## How to write a source address

| Kind | Address | Notes |
|---|---|---|
| `loki` | `http://127.0.0.1:3100` | May include a gateway prefix (e.g. `https://gw.example/loki`); queries go to `/loki/api/v1/query_range` |
| `elasticsearch` / `opensearch` | `http://user:pass@127.0.0.1:9200/logs-*` | **Index expression**: the "index" filled into the third cell of that row takes precedence; if empty, the address path is used (backwards compatible); with neither it is `*,-.*` (all indices **but excluding dotted system indices** such as `.kibana_1` / `.infini_*`). `loglens_sources` **echoes the resolved result**, and probe also reports "N rows in the last 15 minutes"; credentials become a Basic header and never enter the URL; paging uses PIT + `search_after`; **ES 7.10 / 7.11 are supported too** (the PIT key name and `_shard_doc` differences are in [ROADMAP](./ROADMAP.md)) |
| Public address | Same as above, fill it in directly | **The connection surface = the sources you configure**: loopback / private / public are all allowed (hosted logging services, and using public ranges internally, are both normal usage); only the link-local / cloud-metadata tier is unconditionally refused |
| `docker` | The third cell takes a **Docker panel target name** (e.g. `local`), **not** a URL | A collection source ("option 0" in the design): the agent side uses the existing `docker_logs` / `docker_logs_grep`; the panel side goes through the Docker plugin's own `/api/dsh-docker/logs` (relative path), a weak surface: no `until`, a capped `tail`, no grep |

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
| `src/tools.ts` | Agent tools (`loglens_sources` / `search` / `fields` / `facets` / `context`) + the tier table |
| `src/query.ts` | Normalization and clamping: timestamp units, window caps, limit clamping, count and truncation merging |
| `src/cursor.ts` | Both cursors share the version constant: the Loki one (no row loss when the same ts has multiple rows) and the ES one (`pitId` + `searchAfter`); a cursor from the wrong adapter is rejected at decode, and an undecodable one raises an error rather than being treated as absent |
| `client-src/index.js` → `client.js` | Build-type client half: the settings card, with the i18n catalog inlined in the source |
| `client-src/pure.js` | The client's pure logic (draft validity / submit payload / time window and the "custom" tier / histogram and group-board layouting and payloads / window clamping for click-to-zoom / **how axis ticks are chosen and how times are formatted** / **the three page-sort tiers**), covered by vitest |
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

## Installing into DSH

```bash
dsh plugin --profile <profile> add link:$(pwd)/packages/loglens
```

## Known limitations

- **Real-machine acceptance on the Loki side is complete** (2026-10-12, real Loki 3.7.8): the paging
  capability has been flipped to `cursor`, and same-ts multi-row paging is **12/12 groups with no loss and no
  duplication** on the real machine (multiple limits × forward/backward). Two defects were caught and fixed
  along the way (`loglens D02`: Loki's `end` is exclusive; `loglens D03`: "which row among same-ts rows" is
  not a stable coordinate) — root causes and fixes are in [DEFECTS.md](./DEFECTS.md), and the real-machine
  evidence is in the P2 section of [ROADMAP.md](./ROADMAP.md).
  The ES / OpenSearch side has been through several read-only review rounds against a real cluster, with the
  per-item conclusions likewise in ROADMAP and **not restated here**.
- **The paging trade-off (stated plainly)**: rows within the same nanosecond are **an inseparable group** —
  the last group makes the page **slightly exceed `limit`** (better a few extra rows than a cursor that loses
  rows); when the last group is too large to complete, **no cursor is given** and it only reports that
  matches may be incomplete.
- **`tail` (follow) is not implemented**: Loki's `capabilities().follow` is therefore declared **`false`**
  (`stream()` is unimplemented). That bit is echoed verbatim to the agent by `loglens_sources`, and declaring
  it true would amount to pointing at a non-existent entry — the same rule as `aggregations` ↔ `facets()`.
  Guard: [test/capabilities.test.ts](./test/capabilities.test.ts).
  **The maintainer decided on 2026-10-12 to defer it** (not blocked): there is no consumer, and the source
  actually in use is ES (following would have to go through `_search` + polling) — the reasoning and "how to
  do it when we do" are in [ROADMAP.md](./ROADMAP.md).
- **Both aggregations (time distribution / group by field)** are drawn **above** the result list (see the
  trend first, then the rows — the same order as Kibana; knife 15 on 2026-10-17 moved them up from below,
  where they sat after 100 log rows and had to be scrolled to), and are drawn **only for sources with
  aggregation capability** (currently
  ES / OpenSearch) — the capability is sent by the host with the `/query` response, and the panel **does not
  guess by type itself** (that would be a second, drifting rule).
  Both charts **come from backend aggregations**, not from counting this page: that page may have been
  truncated by `limit`, and counting it would only yield a fake distribution / a fake ranking.
  - **Time distribution**: the bucket tier is chosen from the window; gaps between adjacent buckets are
    **filled with 0** — otherwise "nothing at all during that stretch" looks like "it kept streaming". The
    total is only written when not truncated by the cap. **Clicking a bar that has data = zoom into that
    bucket** (the same routine as "click a row on the board": change the draft → re-query at once, rather
    than faking a result from local row counts).
    The zoomed window lives in the **draft** (`preset: 'custom'` + `window`) and enters that shot through
    `runQuery`'s override parameter — it is not kept in separate component state, otherwise the first shot
    after clicking a bar would still read the previous round's window (the `loglens D04` family of "what it
    says and what it queries are not the same thing").
  - **Group by field (terms board)**: the group field is supplied by the user (the panel has **no default
    field** — field names differ across index families, and guessing one would be forging a scope on the
    user's behalf); opening that cell shows this source's field-name candidates. **No total is written**: the
    listed buckets do not add up to the total matches, and what is not listed is reported in the host's own
    words ("N more rows fall in buckets that are not listed"); when bucket counts are approximate, that
    warning is copied too.
    An empty-value key (the document lacks this field) is shown as "(empty)" rather than a nameless bar.
  - **Click-a-bucket drill-down (structured filtering)**: the filter is delivered as "field = value" (the
    host contract's `filters`), **one per field** (it goes through the same `Record`, and two entries would
    silently overwrite one); values are **not trimmed** (whitespace in a key name is part of the content, and
    trimming it silently matches nothing). **The empty-value bucket is not clickable**: a filter cannot
    express "field missing", and a clickable entry would only filter out something else.
    **Loki does not support structured filtering** (the host reports it verbatim) — with it, write the
    condition into the LogQL query string; the UI line says so too, because "switched source, filter still
    there" is possible.
  - Loki has no metrics queries, so it has neither chart here, and the UI says so plainly. When the host
    **does not provide** the capability self-description (an older host), it **says nothing** — "unknown" is
    not "unsupported".
- The query area inside the panel is **controlled duplication** — the **final position** of design §5's
  three-way choice (settled 2026-10-12, option 1): the log view is built inside this plugin's own card and
  shares no browser module with other plugins. The reasoning (the two views are not the same thing, and
  option 2 is not impossible but not worth it) is in [docs/design.md §5](./docs/design.md).
- Docker targets go through the **panel half of option 0** (already wired): relative-path fetches to the
  Docker plugin's own `/api/dsh-docker/containers` and `/logs`, with the weak surface (no `until`, a capped
  `tail`, no grep) honestly annotated in the UI; the agent side still only points the way and does not wrap
  it.
- One source per query (v1 does not fan out across backends).
- **Outbound fence: the connection surface = the sources you configure** (design §4.1 /
  [src/net.ts](./src/net.ts)): loopback / private / public are all allowed (hosted logging services, and
  non-RFC 1918 ranges used internally, are both normal usage); **link-local and cloud-metadata addresses**
  (such as `169.254.169.254`) are **always refused with no exemption**. **Redirects are not followed**: a 3xx
  from a source raises an error and echoes the `Location`, so you change the address and retry (a single 302
  can carry a request outside the allowlist).
- The per-request size cap is 8 MiB and the default timeout 20s; the caps on time window and row count are
  clamped by the host and honestly reported in the panel.
- The fence judges the IP **after DNS resolution**, and resolution and connection are two steps: between them
  a flipping DNS (rebinding) still leaves a window. Source addresses are filled in by the operator, and this
  layer stops accidents and stale names, not an adversary who owns a domain.
- Docker is only a **collection source** ("option 0" in the design) and is not an adapter: the agent side uses
  the existing `docker_logs` / `docker_logs_grep`, and this plugin does not wrap it.
