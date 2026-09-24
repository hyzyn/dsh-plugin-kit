# @hyzyn/dsh-docker

[中文](README.md) | English

> The DSH sidebar "Containers" panel: containers on the local machine and on SSH hosts inspected on one screen — read logs, watch resources, enter containers, start / stop / remove, **Read-only by default**.

## Features

- **A resident session right-sidebar tab**: the panel lives as a session right-sidebar tab (`sidebar.right.pane.tab`) **side by side** with the conversation — after handing an error to the agent the logs stay on the right, without getting in the way of watching it work; collapsing it leaves the viewport. Panel-level state (target / view / filter text / selected container and its tab) is kept **across sessions**, and collapsing drops the live streams to hand the SSH channels back. Hosts without the right-sidebar services fall back to the original dock / modal, behaving exactly as before.
- **Aggregated fetches across targets**: the Overview page fans out over every `targets[]` entry in parallel, and an unreachable target only spoils its own cell; the agent side exposes the same shape through `docker_ps target:"*"` / `docker_attention target:"*"`, so targets never block one another.
- **"Needs attention" reads authoritative fields**: unhealthy / repeatedly restarting / OOM-killed / non-zero exit / dead; OOM and the real exit code come from one `docker inspect` — the 137 in a `docker ps` summary cannot separate an OOM kill from a manual kill, so filtering on the summary alone must misreport.
- **Four long-lived SSE streams on one substrate**: log FOLLOW, `docker stats`, `docker events` and `docker pull` all run through the same `openSseStream` (heartbeat / active-stream registry / teardown on disconnect) and differ only in how they end — logs and pulls finish on their own, stats and events are aborted by the browser. Multi-select merged logs recover true cross-container ordering from the `--timestamps` prefix; "pause" freezes rendering only (the stream keeps receiving and flushes in one batch on resume).
- **Read-only by default, capability switches in three tiers**: start / stop / remove, exec and image mutations are independent switches; while one is off the agent tools are **not registered** and the HTTP routes return 403 (the capability does not exist, rather than failing when called). Container names and IDs pass a whitelist, every command is built as argv with single-quote escaping, and passwords / passphrases are referenced as `env:NAME` (resolved through the official credential layer, falling back to the environment) and never sent back to the browser.
- **Right-click a log into the agent**: select the failing lines in the log view, then right-click for "send to the current session / fill the input box so I can edit first" — the selection travels with its target, container, time window and 20 lines of context on each side (the menu states plainly that the content enters the model context and may carry credentials). Delivery reports itself twice: a **viewport-level toast** (attached to `body`, above the panel and the terminal modal), and — when the terminal panel is open — an **automatic fold of the terminal** (`minimize()` on the `ttyPanel` v2 contract; sessions keep running and the sidebar "Terminal" entry's badge restores it), so the conversation is simply there. On older tty without that call it degrades to the toast's "the conversation is behind the panel" hint. To edit first, use the draft action — **the session input box is the only editing surface** (multi-line, with the full context in view, and exactly what the agent receives), instead of a second, weaker card editor. Locating the target session is version-tolerant: **≤0.1.5** reads `current` off the `sessions.list` snapshot, while **since 0.1.6** that field moved out of the session domain together with view selection, so it reads `retainedBy.mainView > 0` instead (the same test `dsh-client-ui-session` and this repo's codegraph use) — trusting only the legacy field greys out both menu items as "no session open". The same read drives "carry the containers tab across a session switch".
- **Data-level reuse of dsh-tty, no code coupling**: no tty code is imported and tty needs no source change, so the two install and upgrade independently; with tty present three optional extension points are consumed — connection-bar actions (`ttyConnbar`), the terminal host (`ttyTerminal`: a new tab under the tab/dock carriers, an in-place drawer under the modal) and the terminal-side dock (`ttyPanel.mountPane`, used only by the fallback path) — and each degrades silently without tty or below the required version.

## Relationship with dsh-tty

This plugin stands on its own: it imports no tty code, and tty needs no source changes; the two can be installed and upgraded independently. With tty installed they cooperate at the optional extension points below, and without it they degrade quietly.

| Dimension | Description |
| --- | --- |
| Plugin form | A standalone package `@hyzyn/dsh-docker` that imports no tty code, and tty needs no source changes; the two can be installed and upgraded independently |
| Connection book | SSH targets can **reference a tty connection-book entry name** (read-only access to `sshHosts` through `ctx.settings.get('tty')`); when tty is not installed this degrades to "inline host/username" or a local target |
| Host fingerprints | This plugin keeps its own `hostKeys` (TOFU) and **prefers tty's already-recorded fingerprints as the seed** — the same host does not have to be confirmed in two places |
| Execution channel | Its own pooled SSH exec (`src/ssh-exec.ts`), fully independent of tty's PTY sessions; neither takes the other's slots |
| Context entry point | With tty ≥ 0.13.0 it can optionally consume tty's client service `ttyConnbar` and insert a "Containers" button in the SSH connection bar (next to SFTP) (**shown as soon as it is registered**), with the target resolved from the current session at click time; **except in exec tabs this plugin opened itself** — those tabs are where the user just came from, so offering a way back to the very same panel is a loop (recognised via `spawnSpec.command`; a `docker exec -it` the user typed by hand does not count); if tty is missing or too old this is skipped silently |
| Panel hosting | **The default is a session right-sidebar tab** (`sidebar.right.pane.tab`): the panel and the conversation share the screen, so logs stay visible while the agent works; collapsing it leaves the viewport without leaving the session. The **frame sidebar** entry only opens or focuses it, and **a page type deduplicates inside one column**, so clicking twice never opens a second tab. The **terminal connection bar** entry is the opposite — it sits on the viewport-covering tty modal, where a tab would be hidden, so that path docks to the right of the terminal via `ttyPanel.mountPane` (**the entry decides the carrier**). Without the right-sidebar services (older DSH), or with `localStorage['dsh-docker:carrier'] = 'modal'`, the sidebar entry also falls back to the dock (when tty is open) or to a full-screen modal with its own backdrop. All three carriers are **one component**, differing only in shell and geometry |
| Terminal hosting | Interactive terminals are hosted by tty (it owns the PTY). **Right-sidebar tab**: when the panel is fullscreen (`sidebar.fullscreen`) the terminal is embedded in place via `ttyTerminal.mount` (enough width, logs and shell on one screen); otherwise a tab is opened in the terminal panel via `ttyTerminal.open` (re-clicking the same container **focuses the existing tab** instead of stacking duplicates — tty contract v3 `reuse`); (too narrow to squeeze both). **Dock** carrier (the panel already lives inside tty) always opens a tab; **modal** embeds in place. Those command tabs (non-empty `spawnSpec.command`) show **no connection-bar extension area** on the tty side — SFTP / tunnels / third-party panes all act on the connection itself, which misleads on a `docker exec` tab (SFTP browses the host, not what the user believes is inside the container); this plugin adds a version-independent fallback that withholds the "Containers" entry in exec tabs it opened itself (matched by the `spawnSpec.command` prefix). Without tty, or below the required version, copying the command is the fallback. This plugin implements no PTY / xterm / reconnect stack |
| Division of labour | **Interactive troubleshooting** (`docker exec -it`, a shell inside the container, TUIs) is hosted by tty (embedded drawer or tab); **read-only inspection and agent automation** use this plugin's own exec channel |

Reuse at the data level without coupling at the code level: the connection book and the fingerprint seed are "reading the same settings", and the connection-bar button is "consuming a generic extension point" — neither is "depending on tty's modules", so upgrading or uninstalling tty does not break this plugin along with it.

## Installation

```bash
dsh plugin --profile web add @hyzyn/dsh-docker              # npm install (once published)
dsh plugin --profile web add link:$(pwd)/packages/docker    # repo development and debugging
```

The aggregate package `@hyzyn/dsh-all` (or the repo-root bundle) already includes this plugin, so there is no need to
add it separately when installing everything at once. After installing, restart `dsh web` and the "Containers"
entry appears in the sidebar; the Settings → Plugins →
"Docker Container Panel" card maintains targets and switches, and **saving applies hot** (`settings/updated`
triggers re-resolution, with no restart needed).

> If you have already installed `@hyzyn/dsh-all` or the root bundle in the web profile, do **not** add this package
> again, or the plugin line is mounted twice and startup reports `duplicate loader entry id`.

## Usage

Two entry points, one panel. **The default carrier is a session right-sidebar tab** — the entries only open or
focus it, and the panel sits side by side with the conversation: after handing an error to the agent the logs stay
on the right, without getting in the way of watching it work.

![Right-sidebar tab carrier: conversation and container panel on one screen, panel full height; collapsing leaves the viewport](https://cdn.jsdelivr.net/gh/hyzyn/dsh-plugin-kit@main/docs/dsh-plugin-kit-docker-tab.png)

- **Sidebar "Containers"** (the main entry point): works for any target, including local docker and switching
  between multiple targets. If it is already open it focuses (a page type deduplicates inside one column), so
  clicking twice never opens a second "Docker containers" tab.
- **Where to look after delivering**: under the right-sidebar tab the conversation is right beside
  you; under the docked / modal carriers a successful send **folds the terminal automatically** (it keeps
  running — click the sidebar "Terminal" entry's badge to restore), so you land in the conversation instead
  of guessing whether a viewport-covering modal reacted at all.
- **SSH connection bar "Containers" button** (a contextual shortcut, tty ≥ 0.13.0): in an SSH tab of the tty
  terminal panel a "Containers" button appears next to the connection bar's SFTP button — **shown as soon as it is
  registered**, and clicking it opens the panel directly on **the host of the current session**, with no target to
  pick. The target is resolved at click time: when the session comes from the connection book it matches by entry
  name, otherwise it matches a resolved target by `host:port`; **no matching target does not hide the
  button** — the panel carries a hint naming the session host (including the connection-book name) and how to
  configure it in the settings card. This path goes to the **dock right of the terminal** rather than the tab —
  the button lives on the tty modal, which covers the viewport, so a tab would be hidden behind it and feel like
  "clicking did nothing". The target still travels into the panel and remounts it on that host. The rule is
  therefore **"the entry decides the carrier"**: from the frame's sidebar → the right-sidebar tab (side by side
  with the conversation); from inside the terminal modal → the dock right of the terminal (side by side with the
  terminal).

### Carriers

| Carrier | When | Behaviour |
| --- | --- | --- |
| **Session right-sidebar tab** (default) | the host provides `sidebarRight` / `sidebarRightTabs` | side by side with the conversation; collapsing hides it without losing state (panel-level state lives in a module store, see below); the right sidebar's fullscreen mode gives it the whole viewport |
| **Dock right of the terminal** | arriving from the **terminal connection bar's** "Containers" button (that button sits on the tty modal, which would hide a tab), or no right-sidebar service / `localStorage['dsh-docker:carrier'] = 'modal'` with tty ≥ 0.16 and its panel open | docked to the right of the terminal panel (resize / collapse / ✕ provided by tty, the terminal stays usable); one dock at a time — docking this plugin takes down the previous occupant (for example tty's own SFTP); since tty 0.18.4 the pane is **owned by the tab it was opened from**: switching tabs hides it, switching back restores it and closing that tab tears it down (while hidden the React tree and polling keep running) |
| **Full-screen modal** (fallback) | neither of the above | its own backdrop, closes on outside click; the panel sits above tty's modal in z-order |

Rolling back to the old shape is one console line: `localStorage.setItem('dsh-docker:carrier', 'modal')`
(`removeItem` restores the default). That switch is a temporary grey-release knob, so it deliberately stays out of
settings — not worth changing the host config schema, the settings card and the docs for it.

**State retention**: the panel inspects hosts, not workspaces, so view / filter text / selected container
(including its overview-logs-stats tab) / target are kept **across sessions**; the log filter and LINES switch
inside a container detail belong to that container and are not kept. **Collapsing the tab drops every live
stream** (handing the SSH channels back) and expanding reconnects — single-container and merged log streams
already open with `tail`, so history refills itself.

**Stickiness across sessions**: DSH's right-sidebar tab records are **session-scoped** (`sidebar.right.pane.tab`
and `rightbar.session` both declare `scope: 'session'`), so a tab opened in session A does not exist in session B.
The panel inspects hosts, though, and losing it on a session switch is pure loss — so the plugin additionally
keeps a "the user wants this open" intent: **switching sessions reopens the tab in the new session**, and only
clicking the tab's ✕ stops that. The panel follows the person, not the session. That ✕ is executed by the
**host** (`sidebarRight` closes the tab itself), so the plugin learns about it through
`registerCloseHandler` — relying on the panel's own `onClose` alone would miss the close, and every session
switch would bring the tab back after the user had just dismissed it.

**Dock fallback carrier** (right of the terminal):

![docker panel docked to the right of the terminal panel: the terminal stays visible and usable](https://cdn.jsdelivr.net/gh/hyzyn/dsh-plugin-kit@main/docs/dsh-plugin-kit-docker-dock.png)

A panel opened this way **never covers the terminal**: with tty ≥ 0.16 it docks to the right of the terminal
panel (draggable width, collapsible into a narrow strip, ✕ to tuck away) while you keep typing in the terminal.
In dock mode the card's "Terminal" button **opens a new tab in the same terminal panel** running
`docker exec -it` (the panel is already inside a terminal, so nesting one more layer makes no sense); it also
**stops rendering the panel's own header** — the title and ✕ are handled by the sidebar title bar, and the
refresh control and read-only badge move to the
**end of the toolbar, right-aligned** (while refreshing the icon spins itself, with no extra spinner): the left
end stays for the target / view / search / filter controls, so refresh is not mistaken for the first filter and
sits where it does in the non-dock header; a 520px narrow column does not leave a blank line behind.

Inside the panel:

![Container list: target picker / search and state filtering / card action bars (the view and mutate groups)](https://cdn.jsdelivr.net/gh/hyzyn/dsh-plugin-kit@main/docs/dsh-plugin-kit-docker-panel.png)

- **Switching targets has a transition and guards**: as soon as the picker changes, the cards below are still the
  previous target's (a remote round trip can take up to 20s). Three principles for the transition layer —
  **no layout shift, a sense of direction, little grey**:
  - a 2px **indeterminate shimmer progress bar** (absolutely positioned) along the top of the panel body gives a
    global "fetching" signal;
  - a **blue capsule floats up centred** at the top of the body (the same placement and colour language as the
    dsh-rss loading capsule): background `color-mix(accent 12%, surface)`, border `accent 42%`, text and spinner in
    `--dk-accent`; the visible copy is just two segments, `⟳ Switching to Target2 · Currently showing: Target1`
    (not written as a sentence, no quotes around target names), while the full "why won't it respond" story lives in
    `title`, available on hover;
  - old data stays at **82% + slight desaturation** (not dimmed into illegibility) and **the pointer is locked**: it
    reads as "a different batch of content" rather than "it broke", and it also prevents acting on the stale list —
    that would aim at the new target while sending commands with container IDs from the old list and really could
    stop a same-named container on the other side;
  - new data lands with an **8px slide-up + fade-in** over 200ms, so that "a different batch" is visible; the motion
    respects `prefers-reduced-motion`.

  Everything above is **absolutely positioned**: during a switch the first card's position and the scroll height
  provably do not change at all (a banner approach would push the whole block of content down). **A failed switch
  clears the old list** and settles into the new target's error state (it does not keep showing another target's
  data), and the empty-state copy distinguishes "failed to read" from "filtered too narrowly".
- **Target selection**: the panel picks a target first (from the `targets` config, local / SSH); with only one
  target configured it is selected by default, and agent tools may also omit the `target` parameter.
  **The last selected target is remembered** (stored in the browser's `localStorage` under
  `dsh-docker:last-target`, not written to config or settings): the next time the panel opens it is selected
  automatically. The priority is **what the connection bar specifies > last remembered (and still present) >
  first in the list** — once the remembered target is deleted or renamed it falls back to the first one instead of
  resting on an "unknown target"; when entering from the terminal connection bar's "Containers" button, the current
  session host takes priority over the remembered value. Switching targets is **a whole-context switch**:
  requests still in flight for the previous target are all invalidated (a list write gate), so there is no
  cross-talk like "the picker is already Target2 while the cards are still Target1's containers", and an old
  target's timeout banner does not linger on the new target's page.
- **Multi-target Overview (read-only)**: the `Overview` pill next to the target picker (shown only with ≥2 targets
  configured) — pick no target and see every host on one screen: a row of **counter cards** on top
  (target name + a local / SSH marker + running / stopped / unhealthy), and below it a **table of containers needing
  attention pinned to the top** (container / target / status / image; unhealthy sorts before restarting, ties follow
  the targets' order in config, and rows do not jump between polls). Fetching is **parallel + progressive**:
  each target issues its own `POST /containers` (`all:true`, since a bare `docker ps` does not return exited
  containers and "stopped" would always be 0), and an unreachable target affects only its own cell — the card
  outlined in red plus an "N targets unreachable" banner at the top, while the other targets' results show as usual
  (deliberately **not** aggregated with `Promise.all`: an unreachable SSH host waits out the 20s readyTimeout, so
  aggregating would keep the whole page silent for 20s). Clicking a counter card returns to that target's normal
  container list, and clicking an attention row opens that container's details (going back lands on **that
  target's** container list); **the Overview performs no cross-target operations**, and the attention table's rows
  have no action buttons. Entering the Overview clears the failed banner left over from "the current target": the
  Overview attributes everything per target (red card + unreachable banner) and no longer stacks a single-target
  "operation failed" — the same SSH timeout told twice looks like two dead machines. Polling reuses the toolbar's
  "auto refresh" switch (off by default): each round of this page is one `docker ps` per target across all N
  targets, more expensive than any single-target page. With no exceptions it shows
  "all good"; while some targets have not finished answering, the attention area shows "reading…" and
  **that counter card also enters its loading state** (spinner + dimmed, no 0/0/0 — "0 containers" would be read as
  "this machine has no containers" when it simply has not answered yet) ("don't know yet" is not "all good").
- **Container list**: name / status / health / image / port mappings / compose project and service /
  short ID; it supports **search** by name or image, **filtering** by state (running / stopped / all),
  and **auto refresh** (polling at `pollIntervalSec`; switching to the images page pauses it and hides that
  switch — images change slowly, so there is no point running `docker images` every 5s; switching back to the
  containers page restores the previous setting). In the toolbar "include stopped" and "auto refresh" are two
  **grouped** switches, and the search box is the only flexible item among them: on a wide panel the whole toolbar
  collapses into one row, and only in a narrow column (dock, 520px) does it wrap by group — no orphan row holding a
  single checkbox.
- **"Activity" strip (the docker events stream)**: a collapsible narrow bar at the head of the container list
  (expanded by default) that follows one SSE stream (`GET /api/dsh-docker/events/stream`, where the server runs
  `docker events --filter type=container`) showing the last 8 events (time + container name + action, with `die`
  carrying its exit code such as `die(137)`). It is the entry point for **event-driven refresh**: 500ms
  **after an event arrives** it debounces a list refetch (not one request per frame), layering on top of the
  existing `AUTO REFRESH` rather than excluding it — polling is the safety net, events cover "just happened". Events
  stay in memory only (a ring buffer of 50), switching pages closes the stream, and switching targets clears the
  buffer. The allowlist keeps only the nine lifecycle actions (start / die / stop / kill / oom /
  health_status / destroy / rename / update): noise such as `exec_*` and `archive-path` (`docker cp`)
  is dropped server-side — on one batch machine 47 events over 24 hours were all exec with 0 allowlist hits, so on
  machines that are only ever exec'd the Activity strip is empty, and that is deliberate.
- **Select for merging (temporary multi-select merged logs)**: the toolbar's `Select for merging` enters selection
  mode — a checkbox appears on the left of every card, clicking a card body becomes **select / deselect** (it no
  longer opens details; the action bar collapses temporarily so that multi-selecting does not mis-click
  start / stop / remove), and an action bar appears between the toolbar and the list: "N containers selected" +
  `merged logs` + `Cancel`. `merged logs` needs at least 2 containers; at 7–8 selected it gives a soft hint
  (browsers limit same-origin concurrent long connections), and above **8** the button is greyed out with a hint
  about the cap. Clicking `merged logs` opens the merged view: it reuses exactly the merged logs of the Compose
  project view (one `/logs/stream` per container, mixed by the `[service]` / container-name prefix, with filtering
  and auto-scroll), and going back exits selection mode and clears it. The merged view's **content controls are
  fully aligned with the single-container log view** (text filter + level threshold + `⬇ .log` / `⬇ .md` exporting
  what is displayed + line count), plus two merged-only controls: **by time / by arrival** ordering and a **pause**
  that freezes the view while the streams keep receiving (restoring flushes them in one go).
  Clicking `Select for merging` again or pressing **Esc** likewise exits and clears. Selection is **temporary**:
  not persisted, not named into groups, not written to settings; it is dropped when switching targets / switching
  the "Containers · Images · Compose" segment / closing the panel, and containers that disappeared after a list
  refresh are pruned by id.
- **One-click selection by condition** (in selection mode): the action bar's second row offers a row of condition
  chips (`all visible / unhealthy / needs attention / stopped`, plus `same image / same project` once something is
  selected), with counts **truncated to the remaining slots** — a chip reading 8 really does select 8; anything over
  the cap is stated honestly in the title and the result hint. Conditions only apply within the
  **current filtered result** (search / filter the state first, then select in one click).
- **Container cards**: "label + value" rows matching the reference layout (image / ID / ports / created /
  compose, with monospaced truncatable values) plus a row of icon action buttons, **split by a vertical rule into
  the "view / mutate" groups**:

  | Group | Buttons | Description |
  | --- | --- | --- |
  | View / enter | Terminal, logs, resource usage | Does not change container state; always available even in read-only mode |
  | Mutate | start / stop, restart, remove | Ordered by increasing destructiveness; available only with `allowMutations` on, otherwise the whole group is greyed out |

  Remove gets two extra protections: destructive colouring plus a gap between it and "restart", and a second
  confirmation after the click. **The whole group is locked while a command is in flight**: `stop` / `rm` waits for
  the container to actually exit (up to a dozen seconds), during which the confirmation dialog stays open showing
  "running…" (both buttons disabled), the card's other mutate buttons are dimmed and greyed, the icon that is running
  becomes a spinner, and everything is restored only once the refreshed list lands — preventing rapid clicking from
  stacking mutually interrupting commands such as stop + restart + remove. Image removal / pruning goes through the
  same confirmation dialog and also has a running state. Clicking a card body opens the overview.
- **Container details (a full-column view)**: the top is "back + container name + status badge + target host",
  with three tabs below — overview (`docker inspect` authoritative data + one-shot exec), logs and
  stats. The log / stats icons on a card land directly on the corresponding tab.
- **Log view (a compact two-row layout)**: the first row = back + container name + status + target host +
  `LINES` (tail line count) / `TIMESTAMPS` / **`FOLLOW` (live follow, see below)** /
  `AUTO REFRESH` (a switch plus 2/3/5/10s intervals, polling on the log page only) + refresh / close;
  the second row = the tabs + an **always-present** "filter logs" input (an ✕ floats inside to clear when it has
  content, and Esc clears too) + a **level threshold** (`all / INFO+ / WARN+ / ERROR+` — `INFO+` is the "quiet but keep what matters" step: the noise is almost always DEBUG and below, and `WARN+` would drop INFO along with it) + **export**
  (`⬇ .log` / `⬇ .md`, exporting **what is currently displayed**) + the line count in a fixed slot on the right.
  **The split between the rows is deliberate**: the first row is *transport and display* (snapshot / stream /
  polling), the second is *content* — and the second row is **exactly the same as the merged log view**: one level
  kernel, one export builder, one count wording (`N lines`, or `N / M lines` while filtered). The level threshold
  treats a line without a level prefix as a **continuation of the previous entry and follows its level** — otherwise
  `ERROR+` would cut a stack trace in half. The input's width and position never change, so typing or clearing never nudges
  this row. The log body is coloured by level (both common prefixes, `[INFO]` and `|INFO`,
  are recognised), timestamps are dimmed, and filter hits are highlighted; beyond 2000 lines only the tail is
  coloured, with a hint. In the details view the list toolbar and panel header are no longer layered on top, so
  each screen has exactly one refresh entry point.
- **FOLLOW live log stream**: with the log page's `FOLLOW` switch on, the UI switches from "polling a snapshot" to
  **SSE push** (`GET /api/dsh-docker/logs/stream`, where the server runs
  `docker logs --follow`) — new log lines are appended as they arrive and polling stops; `FOLLOW` and
  `AUTO REFRESH` are mutually exclusive (opening the stream stops polling and greys out the switch), and closing it
  returns to snapshots with an immediate refresh. Streaming logs keep the last **5000 lines / 4MB** (a ring buffer that drops the oldest on either cap; newline-free oversized output is force-split so memory stays bounded). Chunks render at most every **150ms** (no per-chunk re-render on chatty containers) and rows carry stable ids, so sliding the buffer only mounts/unmounts boundary nodes — the view no longer truncates: whatever `LINES` selects is rendered and exported (bounded by the buffer and the host output cap). Auto-scroll to bottom,
  drops the oldest and hints once); filtering / level colouring share exactly the same rendering as snapshots. It
  auto-scrolls to the bottom, pauses when the user scrolls up and floats a
  "back to bottom" button; a status line in the top right shows the connection state, and a stream that ends
  naturally because the container exited switches back to snapshot refresh automatically.
  **Reconnection is managed by the plugin itself** (not by EventSource auto-reconnect): the first connection
  carries `tail` to backfill history, while every reconnect uses `tail=0` — new lines only, **never replaying
  history** (auto-reconnect reuses the URL with its `tail`, so the server pushes the last `tail` lines again as
  if they were new, and the log grows a duplicated block). When the host-side backpressure queue (8MB)
  overflows it first sends an `end` frame with `reason: output-limit` and then closes, so the UI says
  "host-side backlog" and reconnects.
  Connecting / switching pages / closing the panel all close the `EventSource`.
- **Overview**: `docker inspect`'s authoritative data — state and health, exit code, restart count and policy,
  port mappings, mounts (including read-only flags), networks and IPs, entrypoint and command, and the latest
  health-check output; below it you can run a one-shot `docker exec` (requires `allowExec`).
- **Logs**: a tail snapshot from `docker logs --tail` (`logTailDefault` lines by default), with timestamps and
  `--since` switchable; output beyond `maxOutputKb` is truncated and marked. To keep watching new logs, turn on
  `FOLLOW` above (the same argv plus `--follow`, with no overall timeout and no output cap, ending on the
  connection's lifecycle).

![Log page: level colouring + an always-present filter box + line counts](https://cdn.jsdelivr.net/gh/hyzyn/dsh-plugin-kit@main/docs/dsh-plugin-kit-docker-logs.png)
- **Stats**: a `docker stats --no-stream` snapshot (CPU% / memory usage and share / network IO /
  block IO / PIDs), refreshed by the panel at `pollIntervalSec`. The stats page also has **`FOLLOW` live
  following**: turning it on switches to `GET /api/dsh-docker/stats/stream` (the server runs **without**
  `--no-stream` for `docker stats`, one line per second), and the browser side keeps a **60-point ring
  buffer** to draw CPU / memory **mini trend charts** (sparklines). Unlike the log stream, this one **does not end
  naturally**; its close semantics are the frontend actively aborting the `EventSource`, and when `docker stats`
  exits by itself the server sends `end` (reason=`stats-exit`), whereupon the UI hints and switches back to snapshot
  polling.
- **Compose project view**: the toolbar's third segment. It groups the `composeProject` / `composeService`
  labels into "project → service → container", one row per project showing the running / unhealthy / service counts
  and each container's state; clicking into a project shows the service table, or opens **project-level merged
  logs** — one `/logs/stream` per container in the project, mixed client-side by the `[service]` prefix (the
  host-side `logsStream` already supports arbitrary containers, so no new endpoint is needed), with an auto-scroll
  switch and a filter box. Merging follows arrival order and does not guarantee strict cross-container ordering.
- **Images**: a `docker images` list (reference / size / created / short ID);
  `<none>:<none>` dangling images carry a `dangling` marker. The search box and the "N / M images"
  counter are **fixed in the toolbar** (they do not scroll away with the list), and the header column names stick
  within the table body. Each row has two actions, "details / remove": **details** opens the full-column view
  (overview: size / size including parents / created / platform / layers / entrypoint and command / exposed ports /
  digest / labels; build history: the per-layer commands and sizes from `docker history`). **Remove** (requires
  `allowMutations`) runs `docker image rm` after a second confirmation (**without** `-f`, so an image that is
  referenced fails with a hint to "remove the related containers first").
- **Networks / volumes (the fifth and sixth segments)**: the toolbar segments extend to "Containers / Images /
  Compose / Networks / Volumes" (when a narrow column cannot fit them, the segment container scrolls horizontally
  by itself, with no second-level menu). Both pages use the same "table + full-column details" layout:
  - **Networks**: name / driver / scope / internal badge / ID, with a row click opening details — overview
    (ID / driver / scope / created / subnet / gateway / internal·attachable·ingress·ipv6 / options / labels) and a
    "connected containers" tab (container / IPv4 / IPv6 / MAC). **Container counts deliberately stay out of the
    list rows**: only `docker network inspect` returns the connected list, and inspecting every row would be N
    docker calls, so it is fetched once on entering details instead.
  - **Volumes**: name / driver / scope / mountpoint (over-long paths are width-limited and truncated, with the full
    value in title); details are name / driver / scope / mountpoint / created / options / labels (volumes have no
    reverse index, so there is only the overview page).
  - The details header has a **remove** button, and both toolbars have a **prune icon**, all gated by
    `allowMutations` (greyed out with an explanatory title when off) and all requiring a second confirmation; a
    failed removal (a network still has containers attached / a volume is still in use / 403) shows an inline banner
    on the details page rather than failing silently.
  - Auto refresh matches the images page: these two pages **do not poll** (inventories change slowly, and a `docker`
    CLI call every 5s is burnt for nothing); they refresh only when switching pages or targets.
- **Pulling images (an SSE progress stream)**: the pull icon in the images toolbar (requires `allowMutations`)
  opens the pull view; after entering a reference it goes through `GET /api/dsh-docker/images/pull/stream`
  (where the server runs `docker pull`) — per-layer progress (Pulling fs layer / Downloading /
  Extracting / Pull complete) appears live; progress lines are updated in place keyed by "layer key", and TTY `\r`
  refreshes do not make the buffer grow ever longer. The toolbar's "prune dangling" runs
  `docker image prune -f`, which **only removes untagged images** (deliberately without `--all`, to avoid
  deleting ordinary unused images by mistake).

![Images page: the search box is fixed in the toolbar and the header sticks](https://cdn.jsdelivr.net/gh/hyzyn/dsh-plugin-kit@main/docs/dsh-plugin-kit-docker-images.png)
- **One-shot exec**: with `allowExec` on you can type a command, equivalent to
  `docker exec <container> sh -c "<command>"`, returning the exit code and stdout/stderr (no TTY).
- **Interactive terminal (the first icon on a card)**: it runs `docker exec -it '<container>' sh`. It degrades in
  three steps depending on tty's capabilities —
  ![exec terminal drawer coexisting with the log page: collapsing only hides it, the session keeps running](https://cdn.jsdelivr.net/gh/hyzyn/dsh-plugin-kit@main/docs/dsh-plugin-kit-docker-exec.png)

  1. **Embedded in place (tty ≥ 0.15, recommended)**: a **terminal drawer** opens at the bottom of the panel, and
     tty's `ttyTerminal.mount` mounts the terminal into it. The panel does not collapse, so you can watch the
     container's logs and step into the container to type commands without losing context. The drawer takes height
     away from the body, so it can give way without ending the session:
     **collapsing** (the arrow at the right of its title bar, or double-clicking its top edge) squashes the drawer
     into one title bar while the session keeps running; **dragging the top edge** resizes it (capped at 75% of the
     panel height). Only two actions really end a session — the ✕ on the drawer and closing the panel; with an
     active session, closing the panel asks for confirmation first, so that clicking the blank backdrop does not
     kill a container shell that is mid-troubleshooting (the global terminal panel also treats "clicking the blank
     area = minimize", the same stance).
  2. **Open a tab through tty (tty ≥ 0.14)**: tty opens a new tab running the same command, and this panel then
     collapses (this panel has a higher z-index, so not collapsing would only make the user feel "nothing
     happened").
  3. **Copy the command**: when tty is not installed / too old / an inline target uses key·password auth (the
     browser has no credentials), it degrades to copying the command with a hint to paste it into the terminal
     panel.

  Local targets open a local session, while SSH targets go over SSH by connection-book entry name (or by the inline
  fields authenticated by the agent), and the tab / drawer title is `<container> · exec`. Capability detection goes
  through the service contract version (`mount` exists only with `ttyTerminal.version >= 2`), not by guessing
  whether a function exists.


### Targets (local / SSH)

| `kind` | Description |
| --- | --- |
| `local` | the docker CLI on the machine hosting the plugin (`spawn` runs it directly, not through a shell) |
| `ssh` | connects to a remote host over `ssh2` and runs the docker CLI remotely (argv single-quote escaped) |

There are two ways to fill in `kind=ssh`:

1. **Reference a tty connection-book entry**: put the entry name in `book` (maintained in the connection book
   under Settings → Plugins → Terminal Panel), and the host / port / username / auth method follow from it. The
   settings card's dropdown only lists connection-book entries tty has saved; if tty is not installed or the entry
   does not exist, that target fails to resolve and both the panel and the agent tools report a clear error.
2. **Inline fields**: `host` + `username` are required, the rest as needed (`port` / `auth` /
   `keyPath` / `password` / `passphrase` / `agentForward`).

Targets are resolved **fresh for every operation**: if you change a connection-book entry in the tty card (a
different port, a new password), the next operation uses the new value immediately with no restart. The remote side
must satisfy: the docker CLI is installed, and the current account can use docker
**without sudo** (usually because it is in the `docker` group); otherwise `probe` passes through errors such as
`permission denied while trying to connect to the Docker daemon socket` verbatim.

### Merged logs (multi-select / Compose project)

Selecting several containers or opening a Compose project can both merge the logs of several containers into one
stream (one `docker logs -f` SSE per container, mixed client-side in arrival order). The toolbar offers:

| Control | Semantics |
| --- | --- |
| **Live / Paused** | a real pause (see below) |
| **Timestamps** | shows a timestamp on every line. Timestamps are **always received with the stream** (`timestamps=1`); this only affects display |
| **By arrival / By time** | `by arrival`: follows with zero delay; `by time`: merges into one true timeline using each line's container timestamp |
| **Level filter** | `all levels / WARN+ / ERROR+`. **Lines with no level prefix (continuation lines such as stack traces) inherit the level of the previous log entry**, so ERROR+ keeps its stack trace with it and INFO continuations are filtered out together with their first line; orphan continuation lines at the start of the window (whose record header is outside the window) cannot be judged and are kept |
| **⬇ .log / ⬇ .md** | exports what is currently displayed: `.log` is plain line text (`[service] ISO time body`), while `.md` carries a header with the source containers / line count / export time and can be attached to a ticket directly |

**How merging by time works**: the SSE connections for the various containers are established at different moments,
so A's initial backlog may arrive in one batch while B's arrives later, and sorting each batch on its own cannot fix
cross-batch inversions. The implementation **backfills the last 400 lines** — whenever a new batch of lines arrives
it re-sorts "the last 400 lines + the new lines" by timestamp (using the RFC3339 prefix from
`docker logs --timestamps` as the sort key, which is parsed and then stripped from the body). That way it neither
stalls for a while to get the first screen right (no one-second blank page on open) nor fails to correct historical
misordering after the fact; the price is that in "by time" mode the last few lines already on screen may shift
slightly (use "by arrival" while following live output).

### "Pause" in merged logs (a real pause)

The merged logs of a multi-select / Compose project have a `Live / Paused` switch. **Pausing freezes the content**,
not just auto-scroll:

- while paused, newly arriving logs go into a client-side buffer and **the DOM is no longer appended to** — the
  screen reader is not pushed away, and the view does not jump when the display cap (2000 lines) trims the front;
- the button itself shows how many lines have accumulated (`Paused +348`);
- on resume the buffer is merged in one go (still under the 5000-line ring cap) and the view returns to the bottom.

Only stopping auto-scroll is not enough: with the label saying "paused" while the content keeps growing, users think
the switch is broken; and with a high log volume the view also jumps by itself as the front is trimmed.

### Overview (cross-target) and the "needs attention" criteria

The "Overview" page lays out all targets on one screen: one counter card per target (running / stopped / unhealthy /
**needs attention**), and below it a cross-target "containers needing attention" table (container / target / status /
**reason** / image; click a row for details, click a card to switch to that target's list). Three design constraints:

- **Progressive landing + failure isolation**: each target requests and lands independently; one unreachable SSH host
  does not silence the whole page — the unreachable target gets its own banner and the other targets' results remain
  available.
- **The "needs attention" criteria are the host's**: the container list and `/attention` are requested in parallel;
  the latter does an extra `docker inspect`, so it can identify **OOM (OOMKilled)** and the **real exit code** — a
  `ps` summary's `Exited (137)` cannot tell an OOM kill from a manual kill. When `/attention` is unavailable (an
  older host / that target failed) it falls back to the summary criteria and labels the count
  "needs attention (rough)".
- **Ordering**: OOM > zombie > unhealthy > repeatedly restarting > non-zero exit; equal weights are ordered by
  "most recent end time" descending, so the freshest crash is at the top (hovering a row shows the end / start times,
  restart count and exit code).

## Configuration (Settings → Plugins → "Docker Container Panel", saved and applied hot)

![Settings card: target CRUD, capability switches and parameters, saved and applied hot](https://cdn.jsdelivr.net/gh/hyzyn/dsh-plugin-kit@main/docs/dsh-plugin-kit-docker-setting.png)

Configuration lives in the settings namespace `docker`, i.e. the `docker:` section of `~/.dsh/settings.yaml`
(`$DSH_HOME/settings.yaml`; DSH's settings file is provided by the host's `dsh-settings-file`). The composition
config in the plugin line acts as the schema's `base`, which the settings layer overrides; the HTTP
`POST /api/dsh-docker/config` is the card's write channel and accepts only the keys in the table below (unknown keys
return 400).

| Item | Default | Description |
| --- | --- | --- |
| `enabled` | true | disables the whole plugin (**takes effect on save**: tools are unregistered immediately, the announcement is withdrawn, and all data routes except `/config` return 403; `/config` stays readable and writable — the settings card is the way back in. Unlike tty, which needs a restart) |
| `announceToAgent` | true | whether to inject a capability announcement into the agent (systemPrompt section `plugin:dsh-docker`) |
| `dockerBin` | `docker` | the docker CLI executable name or path (`podman` works here); only letters, digits and `_ . / \ : -` plus interior spaces are allowed, and it may not start with `-` (**Windows drive letters and `\` must be allowed**, otherwise no absolute path can be entered at all) |
| `allowMutations` | false | allows **mutating operations**: container start / stop / restart / remove, image removal / dangling pruning / pulling (the panel buttons and the `docker_action`, `docker_image_remove`, `docker_image_prune`, `docker_image_pull` tools; while off, `/action`, `/images/remove`, `/images/prune`, `/images/pull/stream` return 403 and the corresponding tools are not registered) |
| `allowExec` | false | allows a one-shot `docker exec` (the panel's exec input and the `docker_exec` tool; while off, `/exec` returns 403) |
| `execTimeoutSec` | 30 | default exec timeout in seconds (1–120) |
| `pollIntervalSec` | 5 | stats refresh interval for the panel, in seconds (1–60) |
| `logTailDefault` | 200 | default log tail line count (1–5000) |
| `maxOutputKb` | 512 | output cap for a single command (KB, 1–8192); anything beyond is truncated and marked `truncated` |
| `targets` | `[]` | target list, see below |
| `hostKeys` | `[]` | SSH host fingerprint records (TOFU, maintained automatically) |

Out-of-range numbers are clamped to the boundary, and a value of the wrong type falls back to the default.

### `targets[]` fields

| Field | Default | Description |
| --- | --- | --- |
| `name` | — (required) | the target's display name, unique; empty or duplicate entries are dropped on save (≤64 characters) |
| `kind` | `local` | `local` for this machine / `ssh` for remote |
| `book` | `''` | with `kind=ssh`, references a tty connection-book entry name (leave empty to use the inline fields below) |
| `host` | `''` | inline hostname or IP (required when there is no `book`) |
| `port` | 22 | SSH port (1–65535, out of range falls back to 22) |
| `username` | `''` | inline SSH username (required when there is no `book`) |
| `auth` | `agent` | `agent` (uses `SSH_AUTH_SOCK`) / `key` (uses `keyPath`) / `password` (uses `password` and also attaches keyboard-interactive) |
| `keyPath` | `''` | private key path for `auth=key` (a leading `~` expands to home) |
| `password` | `''` | password for `auth=password`; **prefer `env:NAME`**, a credential reference |
| `passphrase` | `''` | private key passphrase; **prefer `env:NAME`**, a credential reference |
| `agentForward` | false | whether to forward the local ssh-agent (takes effect when `SSH_AUTH_SOCK` exists) |

An `env:NAME` inside `password` / `passphrase` is a **credential reference** — exactly the official shape, where
configuration holds only the reference and a provider owns the value. It is resolved **only when connecting**, in this order:

1. the **official credential layer** (`ctx.credentials`, from `@deepseek-ai/dsh-credentials`), which layers
   `file` (`$DSH_HOME/.credentials.yaml`) / `env` / `project-env` / `user-env` and re-resolves per operation — so a
   changed credential reaches the next operation **without a host restart**;
2. when that service is unavailable (older host, bundle not installed) or holds no such reference, `process.env[NAME]`.

With neither, the error names **both** sources and carries the credential service's own error too — otherwise a broken
credential service would masquerade as "you did not configure it", which is the hardest kind to diagnose. These two values are **never sent back to the browser**:
the config snapshot only provides the two booleans `passwordSet` / `passphraseSet`.

### `hostKeys[]` (SSH host fingerprints, TOFU)

| Field | Description |
| --- | --- |
| `host` | hostname or IP (required) |
| `port` | port, default 22 (unique per host:port) |
| `fingerprints` | **fingerprint set** (required, at least one): the verbatim hex fingerprints received by the `hostHash: 'sha256'` callback. One host:port may hold several host keys (rsa / ed25519 …); matching any of them counts as a match |
| `fingerprint` | legacy single-fingerprint field (string): migration input only, merged into `fingerprints` on load; do not use it in new configs |

The first connection is recorded automatically and written to disk; every later connection must match, and
**a changed fingerprint rejects the connection outright**, with guidance in the error to "delete this host's record
and reconnect". The record list can be deleted / reset in the settings card (deletion is submitted as the explicit
`hostKeysRemove: [{host, port}]`, so a union merge cannot silently undo it).

## Agent tools

| Tool | Registration | Parameters | Purpose / typical use |
| --- | --- | --- | --- |
| `docker_targets` | always registered | `probe?: boolean` | lists targets (name / kind / label); `probe:true` probes the docker version and daemon reachability for each one (SSH targets open connections, so it is slower). Other tools take their `target` from here |
| `docker_ps` | always registered | `target?` (**pass `*` = all targets**), `all?: boolean` | lists containers (name / state / health / image / ports / compose project and service / short ID); by default only running ones, `all:true` includes stopped. With `target:'*'` it returns results grouped by target, and **one unreachable target does not affect the others** (that group carries `error`). Ports are merged across the IPv4/IPv6 dual-stack expansion (one `-p` no longer shows twice, D130); an empty `ports` does **not** mean "nothing exposed" — host-network containers publish on the host itself, and that case now carries a `net` field (D131). The first step of troubleshooting |
| `docker_attention` | always registered | `target?` (supports `*`), `limit?: number` | a **needs-attention summary**: unhealthy / repeatedly restarting / OOM-killed / non-zero exit / zombie; every item carries `reasons`, `exitCode`, `oomKilled`, `restartCount`. OOM and the real exit code come from one `docker inspect` (a ps summary cannot distinguish a manual kill from 137). The troubleshooting entry point: call it first when you are unsure which machine or container to look at |
| `docker_inspect` | always registered | `target?`, `id` (required) | `docker inspect`'s authoritative details: state / health check / exit code / restart count / ports / mounts / networks / startup command |
| `docker_logs` | always registered | `target?`, `id`, `tail?` (1–5000, default `logTailDefault`), `timestamps?`, `since?` | the tail from `docker logs --tail`; `since` uses docker syntax (such as `10m`, `2026-09-09T10:00:00`); over the cap it is marked `truncated` |
| `docker_stats` | always registered | `target?`, `ids?` (comma-separated container names/IDs) | a `docker stats --no-stream` snapshot: CPU% / memory usage and share / network IO / block IO / PIDs; omitting `ids` means all running containers. Live following is a panel capability (SSE), and the tool keeps single-value snapshot semantics |
| `docker_images` | always registered | `target?` | image list (repository:tag / size / created / short ID) |
| `docker_events` | always registered | `target?`, `since?` (docker `--since` syntax, default `10m`) | a container-event snapshot (`docker events --since <d> --until <now>`, likewise through the server-side allowlist): the nine kinds start / die / stop / kill / oom / health_status / destroy / rename / update, with noise such as `exec_*` already dropped server-side. For continuous observation have the user watch the "Activity" strip in the panel's container list |
| `docker_networks` | always registered | `target?` | network list (name / driver / scope / internal flag / short ID). The connected-container list stays out of the list rows — the details page does the inspect, whereas inspecting row by row would be N docker calls |
| `docker_volumes` | always registered | `target?` | volume list (name / driver / scope / mountpoint) |
| `docker_image_inspect` | always registered | `target?`, `ref` (required) | `docker image inspect` + `docker history`: size / size including parents / created / platform / layer count and layer list / entrypoint and command / exposed ports / digest / build history (each step's command and size) |
| `docker_action` | only with `allowMutations` | `target?`, `action` (`start` \| `stop` \| `restart` \| `remove`), `id` | container lifecycle operations. `remove` is destructive: it deletes the container config and writable layer (data volumes are not included), and the target container must be confirmed with the user before running |
| `docker_image_remove` | only with `allowMutations` | `target?`, `ref` (required) | removes an image (`docker image rm`, without `-f`). **Destructive**: it fails when the image is referenced by a container or a child image; confirm the target image and restate the consequences before running |
| `docker_image_prune` | only with `allowMutations` | `target?` | prunes dangling (untagged) images (`docker image prune -f`). Deliberately without `--all`, so only untagged images go |
| `docker_image_pull` | only with `allowMutations` | `target?`, `ref` (required), `timeoutSec?` (10–1800, default 600) | `docker pull` in snapshot form (**may take several minutes**); for interactive per-layer progress have the user watch the SSE progress stream from the pull icon on the panel's images page |
| `docker_exec` | only with `allowExec` | `target?`, `id`, `command` (required, run through `sh -c` inside the container), `timeoutSec?` (1–120, default `execTimeoutSec`) | a one-shot `docker exec` returning the exit code / stdout / stderr; there is no TTY, so for interactive troubleshooting have the user run `docker exec -it <container> sh` in the tty panel |

- When `target` is omitted it falls back to **the only** configured target; with several targets configured it is
  required, and the error message lists the available target names.
- Changing either switch **re-registers the tools immediately**: after turning off `allowMutations` / `allowExec`
  the corresponding tools (including the three image mutation tools) disappear from the agent side, with no restart.
- Recommended troubleshooting order: `docker_targets` → `docker_ps` → `docker_logs` →
  `docker_inspect` → `docker_stats`; for image problems `docker_images` →
  `docker_image_inspect`.
- With `announceToAgent` on, the plugin injects a capability announcement into the systemPrompt (including the
  constraints "read-only by default" and "docker socket ≈ root on the target host"), so the model lists targets
  before acting.

## HTTP routes (under the `/api/dsh-docker` prefix, all behind the loopback fence)

The fence validates `remoteAddress` (the whole 127/8 range + `::1` + `::ffff:` mappings), `Host` (literal
loopback, `localhost`, or a hostname / `/etc/hosts` alias that **resolves to this machine** — resolution has a
500ms timeout and a 60s cache), `Origin` and `sec-fetch-site`; any non-local request gets 403
`forbidden: loopback-only`. The request body is capped at 1MB, and responses are uniformly `application/json` +
`referrer-policy: no-referrer`.

**On top of loopback there is a second gate, the "same-origin proof"**: the four SSE streams (`/logs/stream`,
`/stats/stream`, `/events/stream`, `/images/pull/stream`) and eight mutating sub-routes (`/action`,
`/images/remove|prune`, `/networks/remove|prune`, `/volumes/remove|prune`, `/exec`) require either
`Origin: <same origin>` or `Sec-Fetch-Site: same-origin`, otherwise 403 `缺少同源证明` (missing same-origin
proof). This blocks cross-site side effects such as a malicious page using
`<img src=.../images/pull/stream>` to trigger a real pull; curl, old Safari and some WebViews do not send those
headers and will hit it (normal browser use is unaffected). Read-only routes do not require the proof.

| Route | Method | Request body | Response |
| --- | --- | --- | --- |
| `/config` | GET | — | `{ok:true, config}`: the config snapshot (targets expose only `passwordSet` / `passphraseSet`, plus the read-only `ttyBooks` / `ttyAvailable` / `toolsRegistered`) |
| `/config` | POST | any subset of the config keys above | `{ok:true, config}`; an unknown key is 400 and invalid JSON is 400 |
| `/targets` | GET / POST | — | `{ok:true, targets:[{name, kind, label?\|error?}]}` |
| `/probe` | POST | `{target?}` | `{ok:true, probe:{ok, bin, serverVersion, error, target}}` |
| `/containers` | POST | `{target?, all?}` | `{ok:true, containers: ContainerSummary[]}`; with `target:'*'` it returns `{ok:true, groups:[{target,label,ok,error?,data?}]}` (concurrent cross-target aggregation) |
| `/attention` | POST | `{target?, limit?}` | for a single target `{ok:true, items: AttentionItem[], total, truncated, degraded}` (`limit` applies **after** filtering + severity sorting; default 100, max 500); with `target:'*'` `{ok:true, groups:[{target,label,ok,error?,data:{items,total,truncated,degraded}}]}` |
| `/inspect` | POST | `{target?, id}` | `{ok:true, details: ContainerDetail[]}` |
| `/stats` | POST | `{target?, ids?: string[]}` | `{ok:true, stats: ContainerStats[]}` |
| `/logs` | POST | `{target?, id, tail?, timestamps?, since?}` | `{ok:true, logs:{id, text, truncated}}` |
| `/logs/stream` | GET | query: `target?`, `id` (required), `tail?` (**0**–5000; `0` = follow only, no history backfill, used on client reconnect), `timestamps?` (`1`/`true`), `since?` | `200 text/event-stream` long connection, event protocol below; bad parameters / unknown target / non-loopback return ordinary JSON errors |
| `/stats/stream` | GET | query: `target?`, `ids?` (comma-separated; omitted = all running) | `200 text/event-stream`: one `stats` frame per second (ContainerStats, same shape as the /stats snapshot); it does not end naturally and is finished off by the client disconnecting |
| `/events/stream` | GET | query: `target?` | `200 text/event-stream`: one container event per `event` frame (already through the server-side allowlist, with missing-value fields omitted); it does not end naturally and is finished off by the client disconnecting |
| `/images` | POST | `{target?}` | `{ok:true, images: ImageSummary[]}` |
| `/images/inspect` | POST | `{target?, ref}` (required) | `{ok:true, image:{ref, detail: ImageDetail, history: ImageHistoryEntry[], historyError}}`; history prefers `--format '{{json .}}'` and falls back to a plain-text table on older versions |
| `/images/remove` | POST | `{target?, ref}` (required) | requires `allowMutations` (otherwise 403); `docker image rm` (without `-f`); `{ok:true, result:{ref, message}}` |
| `/images/prune` | POST | `{target?}` | requires `allowMutations` (otherwise 403); `docker image prune -f` (dangling only); `{ok:true, result:{message}}` |
| `/images/pull/stream` | GET | query: `target?`, `ref` (required) | requires `allowMutations` (otherwise 403 and no stream is opened); `200 text/event-stream`: `line` per-layer progress + `end{reason:'pull-exit',code,ref}` |
| `/networks` | POST | `{target?}` | `{ok:true, networks: NetworkSummary[]}` |
| `/networks/inspect` | POST | `{target?, name}` (required) | `{ok:true, network:{name, detail: NetworkDetail}}` (subnet / gateway / options / labels / connected containers) |
| `/networks/remove` | POST | `{target?, name}` (required) | requires `allowMutations` (otherwise 403); `docker network rm`; `{ok:true, result:{name, message}}` |
| `/networks/prune` | POST | `{target?}` | requires `allowMutations` (otherwise 403); `docker network prune -f`; `{ok:true, result:{message}}` |
| `/volumes` | POST | `{target?}` | `{ok:true, volumes: VolumeSummary[]}` |
| `/volumes/inspect` | POST | `{target?, name}` (required) | `{ok:true, volume:{name, detail: VolumeDetail}}` (mountpoint / options / labels) |
| `/volumes/remove` | POST | `{target?, name}` (required) | requires `allowMutations` (otherwise 403); `docker volume rm` (**the data goes with the volume**); `{ok:true, result:{name, message}}` |
| `/volumes/prune` | POST | `{target?}` | requires `allowMutations` (otherwise 403); `docker volume prune -f` (**deletes data**, see known limitations); `{ok:true, result:{message}}` |
| `/action` | POST | `{target?, action, id}` | requires `allowMutations` (otherwise 403); `{ok:true, result:{id, action, message}}` |
| `/exec` | POST | `{target?, id, command, timeoutSec?}` | requires `allowExec` (otherwise 403); `{ok:true, result:{id, command, code, stdout, stderr, truncated, durationMs}}` |

Any other sub-path is 404 (`unknown route: ...`); a GET on anything other than `/config`, `/targets` and the three
`*/stream` routes above returns 405; an execution failure (a docker error, a target that fails to resolve, and so on)
returns 500 or 400 plus an `{error}` text.

### SSE event protocol (`/logs/stream`, `/stats/stream`, `/events/stream`, `/images/pull/stream`)

The four long streams share one piece of infrastructure (`openSseStream`): uniform header writing +
`flushHeaders()`, a 15s `: ping` heartbeat frame, active-stream registration (a uniform `end` + abort when the plugin
is disabled / the config is hot-updated / it is uninstalled), and a silent abort when the client disconnects. They
differ only in the executor and the end reason:

Each frame is one `event:` line + one JSON `data:` line (single-line JSON encapsulation: newlines / quotes are
escaped and multi-byte characters are never split by an SSE line boundary), followed by an empty line:

| Event | data | Description |
| --- | --- | --- |
| `line` | `{"d":"..."}` / `{"e":"..."}` | stdout / stderr chunks (not guaranteed to split on line boundaries, so the client reassembles lines). Used by the log stream and the pull stream |
| `stats` | `ContainerStats` | stats stream only: one frame per container per second, with fields exactly matching the `/stats` snapshot. The server extracts **flat `{...}` objects** (`docker stats` goes through the TTY renderer even when stdout is a pipe, so frames are mixed with `ESC[H/ESC[K/ESC[J`, and parsing by line would drop whole lines) and collapses repeated renders of the same sample, so the client no longer has to parse docker's PascalCase strings |
| `event` | `{action, name, image, composeProject?, time?, exitCode?}` | event stream only: one container event per frame (event lines outside the allowlist are dropped server-side; fields whose value is null are omitted) |
| `end` | `{"reason":"container-exit"\|"stats-exit"\|"events-exit"\|"pull-exit","code":N, ...}` | the executor exited naturally. The log stream attaches the container's exit code, the stats stream has reason=`stats-exit`, the event stream reason=`events-exit`, and the pull stream attaches `ref` |
| `error` | `{"message":"..."}` | a parameter / execution failure, after which the stream closes; a break at the connection layer does not send this event |

The four streams differ only in "executor + end reason":

| Stream | Executor | Natural end condition | Close semantics |
| --- | --- | --- | --- |
| `/logs/stream` | `docker logs --follow` | the container stops (`container-exit`) | the frontend turns FOLLOW off / switches pages / closes the panel |
| `/stats/stream` | `docker stats` (**without** `--no-stream`) | all the containers being measured exit (`stats-exit`) | **the frontend aborts it** (this stream does not stop by itself) |
| `/events/stream` | `docker events` (`--filter type=container`) | the daemon-side stream ends (`events-exit`) | switching pages / switching targets / closing the panel |
| `/images/pull/stream` | `docker pull` | the pull completes / fails (`pull-exit`) | the frontend leaves the pull view |

- Response headers: `content-type: text/event-stream; charset=utf-8`, `cache-control:
  no-cache`, `connection: keep-alive`, with `flushHeaders()` immediately after writing them (the host's gzip
  explicitly skips `text/event-stream`, so nothing is buffered).
- Heartbeat: one `: ping` comment frame every 15s (ignored by clients per the SSE spec).
- Teardown: the client disconnects → the executor is aborted immediately (locally `SIGTERM`, then `SIGKILL` if it has
  not exited in 2s; over SSH that exec channel is closed and the pooled connection is kept for reuse), writing no
  frame at all; the plugin is disabled / the config is hot-updated / it is uninstalled → the server wraps up on its
  own initiative (abort + `end`).
- A long SSH stream occupies a connection in the pool (a busy count) and idle reclamation (120s) does not kill it by
  mistake; reclamation resumes once the stream ends.

## Security model

**The docker socket ≈ root on the target host.** Anyone who can reach the daemon can mount host directories, start
containers in privileged mode and read the secrets inside containers — which is why this plugin is designed
read-only first:

1. **Read-only by default**. With `allowMutations` off, `/action`, `/images/remove`,
   `/images/prune`, `/images/pull/stream` all return 403, the panel's start / stop / remove / image
   removal / pruning / pulling are unavailable, and the `docker_action`, `docker_image_remove`,
   `docker_image_prune`, `docker_image_pull` tools are **not registered at all**; with `allowExec`
   off, `/exec` returns 403 and the `docker_exec` tool is likewise not registered. The two switches are
   independent and must be turned on explicitly by the user in the settings card. Read-type routes (`/logs/stream`,
   `/stats/stream`, `/events/stream`, `/images/inspect`) are unaffected by either switch.
2. **Destructive operations restate their consequences**. `remove` maps to `docker rm` (**without `-f`**), and the
   agent announcement requires confirming the target container with the user before running; a running container
   errors with a hint that "the container is still running: stop it before removing", never a silent force-delete.
3. **Credentials do not land in plaintext (recommended)**. `password` / `passphrase` support `env:NAME` credential
   references; the value lives in the **official credential store** (`$DSH_HOME/.credentials.yaml`, owned by the
   credential layer's provider), so no plaintext reaches `settings.yaml` — and no env-plugin middleman is required.
   `agent` auth (`SSH_AUTH_SOCK`) is not written to disk at all. The config snapshot only answers "is it set".
4. **Host fingerprint TOFU pinning**. The first connection records the sha256 fingerprint; every later one must
   match, and a change rejects the connection (MITM protection); a host tty has already confirmed is trusted directly
   as a seed and copied into this plugin's records. TOFU's inherent limits are that "if the first connection already
   met an MITM, what got recorded is a fake fingerprint", and that only one record is kept per host:port (multiple
   key types on the same host may report a change incorrectly; deleting the record and reconnecting re-calibrates
   it).
5. **Commands are always built as argv, never by string concatenation**. Container names / IDs first pass the
   `assertRef` allowlist (`[A-Za-z0-9][A-Za-z0-9_.-]*`, ≤128 characters, rejecting spaces, `;`,
   `$()`, backticks and so on), and image and container references likewise; remotely each argument is single-quote
   escaped by `shJoin` before being handed to the remote shell, while locally `spawn(bin, args)` goes through no
   shell.
6. **Output is capped**. `maxOutputKb` limits the stdout/stderr bytes of a single command; anything beyond is
   truncated and marked, so large logs cannot blow up memory or the agent's context.
7. **HTTP is exposed to this machine only**. All routes go through the loopback fence, so a remote browser cannot
   call them.
8. **The live log stream is a read-only capability**. `GET /logs/stream` matches `/logs`: it is not gated by
   `allowMutations` / `allowExec` (it does not change container state), but it likewise admits loopback only, passes
   `id` through the `assertRef` allowlist and clamps parameters the same way. Unlike a snapshot, a long stream has no
   `maxOutputKb` cap (following would lose its point if truncated), and memory protection is shouldered by the
   client's 5000-line ring buffer and 2000-line colouring cap.

## Known limitations

- **No interactive TTY**: `exec` is a one-shot command (`docker exec <id> sh -c <cmd>`,
  without `-i` / `-t`), so it cannot run vim / top / an interactive shell, nor feed stdin for a
  dialogue. For interactive troubleshooting run `docker exec -it <container> sh` in the tty panel (this works for
  both local and SSH targets).
- **The event stream has a window while disconnected**: `docker events` is a stream of "from now on", so events that
  happen while the browser is disconnected and reconnecting have already been pushed by the server and are not
  resent. The client compensates with "do a full list refresh right after a successful reconnect"
  (aligning state, not replaying the events); the few entries missing from the Activity strip can only be inferred
  from the final state after that refresh. For an exact, complete event history use the `docker_events` tool (a
  snapshot with `--since`).
- **The four boundaries of streaming**: the log page's `FOLLOW` (SSE + `docker logs -f`), the stats page's
  `FOLLOW` (SSE + `docker stats` + a 60-point sparkline), the container list's event stream
  (SSE + `docker events`, driving the Activity strip and the debounced list refresh), and the images page's pull
  progress stream (SSE + `docker pull`); but the agent tools `docker_logs` / `docker_stats` /
  `docker_image_pull` all keep **snapshot semantics** (a single-value return model does not suit an unbounded
  stream). Streaming logs keep only the last 5000 lines on the browser side (dropping the oldest, with a hint), and
  stats keep only 60 samples.
  A long SSH stream holds that connection in the pool (busy) while other commands on the same host still reuse the
  same connection without affecting each other. **The stats stream does not end naturally**, so closing it must be
  the frontend actively aborting the `EventSource`.
- **Docker CLI version differences**: parsing goes through `--format '{{json .}}'`, and fields come and go between
  versions; the parser always degrades instead of throwing (for example, a missing `State` has the state derived from
  `Status`, and health is extracted from `(healthy)` / `(unhealthy)`); with fields missing the corresponding columns
  may be empty, so use the details (`docker inspect`) when you need authoritative data.
- **`rm` without `-f`**: container `remove` maps to `docker rm` and image `remove` to
  `docker image rm`, neither with `-f` — a running container, or an image referenced by a container or a child
  image, fails with a hint; to force deletion, run it by hand in the tty panel.
- **SSH targets need sudo-free docker**: if the account is not in the docker group, docker reports a permission
  error which the panel and the tools pass through verbatim, without attempting automatic sudo escalation.
- **Docker not installed on the remote**: `probe` fails (`command not found` / exit code 127) and the panel shows
  the error; when PATH differs, fill `dockerBin` with an absolute path.
- **`dockerBin` is validated before it is persisted**: an illegal value returns 400 with a reason and is never
  written to `settings.yaml` (the earlier implementation validated after `scope.update`, so the illegal value was
  stored anyway and the user only received a bodyless 400; the next start silently reverted the entire docker
  section to defaults).
- **A `dockerBin` pointing at a `.cmd` / `.bat` cannot start the local channel**: local execution goes through the
  bare `spawn` in `runLocal` / `runLocalStream`, and Node refuses to execute `.cmd` directly on Windows
  (`EINVAL`). Docker ships `docker.exe`, so this is not hit in practice; with a hand-written `.cmd` wrapper, use
  an `.exe` instead, or wait for the local channel to move to kit's `spawnPortable` as well.
- **The Compose project view only knows `com.docker.compose.project`**: a service deployed with
  `docker stack deploy` carries `com.docker.stack.namespace` / `com.docker.swarm.service.name` instead, so its
  containers show up as ungrouped (measured on a real three-node swarm, Ubuntu 24.04 + Docker 29.3.1, where every
  stack container reported `composeProject: null`). Supporting it needs a separate stack-grouping notion rather
  than being folded into the compose one.
- **`volume prune` only reclaims anonymous unused volumes on Docker 29**: a named volume stays even while it
  appears in `docker volume ls -f dangling=true`, and `docker volume prune -f` reports `Total reclaimed space: 0B`
  (measured; an anonymous volume, by contrast, is deleted and named in the output). That matches this plugin's
  deliberate refusal to pass `--all`; use `/volumes/remove` (the panel's volume delete) for named volumes.
- **Podman compatibility through `dockerBin`**: filling in `podman` runs, but the fields and output formats of
  `stats` and `--format '{{json .}}'` differ from docker's, so only the parser's degradation paths are relied on;
  this has not been verified item by item.
- **No image builds / Compose orchestration changes**: images support pulling / removal / dangling pruning, but there
  is no `docker build`, `docker save` / `load` or `docker push`; Compose is a **read-only**
  project view (grouping by project + project-level merged logs) and provides no `compose up` / `down` / `restart`.
- **`volume prune` deletes data and its behaviour varies by version**: `docker volume prune` on docker ≥ 23
  has `-a/--all`, and **without it only anonymous volumes go** (which is how this plugin calls it); but docker < 23
  has no such switch, and a plain prune deletes **named** volumes that are not in use as well. The confirmation copy
  for volume pruning therefore spells out the version difference; before running it, please confirm that there is no
  data volume you want to keep.
- **Network / volume mutations exist only as panel buttons, with no agent tools**: image remove / prune have
  corresponding tools, but for this round networks / volumes only gained HTTP endpoints (`/networks/remove` and the
  like) and panel buttons — deliberately without widening the mutation surface on the agent side. Letting the agent
  delete them too would require adding separate tools (with their own confirmation conventions).
- **The Overview only summarises "the container picture" and is entirely read-only**: the `Overview` next to the
  target picker only does counter cards and the attention table pinned to the top, with **no cross-target operations
  whatsoever** (start / stop / remove are still done one by one in a single target's list), and it does not merge
  logs / stats / event streams either (those remain the business of single-target, single-container pages). In
  addition, "attention" covers only `unhealthy` and
  `restarting`: `ContainerSummary` has no `exitCode`, so a "crashed exit" cannot be told from a "manually
  stopped" one, and counting every `exited` as an exception would let a container that was stopped once flood the
  screen forever — look at dead containers under "stopped" in the counter card instead.
- **The connection-bar button needs a matching target to have data**: the button always shows on an SSH tab, but if
  the session host has no corresponding `kind=ssh` target (neither the connection-book name nor `host:port` matches),
  clicking it only shows a hint that it is "not configured as a Docker target" instead of a container list; the
  connection bar on local tabs is hidden entirely.
  Target additions and removals are picked up within at most 30 seconds (saving the settings card refreshes
  immediately).
- **`enabled: false` takes effect on save**: after saving, tools are unregistered immediately, the announcement is
  withdrawn, and data routes other than `/config` return 403 (long streams in progress — logs / stats / pulling —
  are wrapped up immediately too). The route objects themselves are not unloaded; they are blocked by the 403, and
  `/config` stays readable and writable — the settings card is the way back in, with no restart of `dsh web` needed.
- **Mutating operations have no separate audit log**: only docker's own records and the host `ctx.logger`'s
  ordinary output.

- **The boundaries of cross-target aggregation**: concurrency cap 4, per-target timeout 45s; a single target failing
  or timing out affects only its own cell (the group carries `error`). With many targets the Overview's request
  volume grows linearly with the target count (2 requests per target), and auto refresh multiplies that volume —
  with many targets it is best to turn auto refresh off.

## How it works

```
Browser half (client.js)
  ├─ sidebar "Containers" entry → panel: target picker / container list (search + state filter) /
  │   container cards (action bar in two groups: view = terminal/logs/stats | mutate = start-stop/restart/remove) /
  │   container list "Activity" strip (event-driven refresh) + "Select for merging" multi-select → temporary merged logs /
  │   multi-target Overview (all targets fetched in parallel + progressive landing; counter cards / attention table pinned to the top; read-only) /
  │   Compose project view (project grouping / service table / project-level merged logs) /
  │   image list (inline details · remove) + image details (layers / build history) + pull progress /
  │   network list + network details (subnet / connected containers) + volume list + volume details / one-shot exec
  │     └─ terminal drawer: with tty ≥ 0.15, embeds tty's terminal in place via ttyTerminal.mount
  │        (the panel does not collapse; collapsing/dragging only changes size and does not interrupt the session; only ✕ or closing the panel disposes,
  │        and with an active session closing the panel confirms first → tty ends the session and tears down the DOM)
  │     ├─ fetch → /api/dsh-docker/* (loopback fence)
  │     ├─ FOLLOW → EventSource /logs/stream (SSE: 5000-line ring buffer / auto stick to bottom /
  │     │   back to bottom / auto reconnect on disconnect / back to snapshot when the container exits)
  │     ├─ stats FOLLOW → EventSource /stats/stream (SSE: a 60-point ring buffer draws
  │     │   CPU / memory sparklines; **the frontend aborts it**, and the stream only ends when docker stats exits by itself)
  │     ├─ events → EventSource /events/stream (SSE: the Activity strip's 50-entry ring buffer +
  │     │   a 500ms debounce triggering a list refetch; one full refresh after a successful reconnect)
  │     ├─ pull → EventSource /images/pull/stream (SSE: per-layer progress upserted by layer key)
  │     └─ merged logs → one /logs/stream per container in the project, mixed client-side by [service]
  ├─ optionally consumes tty's ttyConnbar service → SSH connection bar "Containers" button
  │   (matches configured targets by book name / host:port; only appears on a hit)
  ├─ optionally consumes tty's ttyPanel service (0.16.0) → docks to the right while the terminal panel is open
  └─ optionally consumes tty's ttyTerminal service → the card's "Terminal" button opens a docker exec tab directly
      (falls back to copying the command when tty is unavailable / credentials are not in the browser)

Host half (src/index.ts)
  ├─ settings namespace docker (~/.dsh/settings.yaml)
  │   DOCKER_SETTINGS_SCHEMA → normalizeConfig (clamping / allowlisted keys)
  ├─ read-only reuse of tty settings' sshHosts (connection book) and hostKeys (fingerprint seed)
  ├─ resolveTarget: local → runLocal; ssh → look up the connection book via book or use inline fields
  ├─ one DockerApi per target (src/docker.ts)
  │   ├─ argv construction + assertRef allowlist + output cap (maxOutputKb)
  │   └─ tolerant parsing: {{json .}} line by line / as an array, case-insensitive field names, degradation on missing fields
  ├─ RemoteExec (src/ssh-exec.ts)
  │   ├─ lazy connection pool: one connection reused per user@host:port, reclaimed after 120s idle
  │   │   (swept every 30s, connect timeout 20s, keepalive 10s; long streams with busy>0 skip reclamation)
  │   ├─ non-PTY exec channel: one channel per command, closed as soon as stdout/stderr are drained;
  │   │   long streams (run()/stream()) have no overall timeout or output cap and are stopped via AbortSignal
  │   ├─ shJoin single-quote escaping (parsed by the remote shell); env:VAR secret lookup
  │   └─ hostVerifier TOFU pinning (record on first use, reject on change)
  ├─ runLocal / runLocalStream: spawn(dockerBin, args) (no shell, local targets)
  │   stop ladder: SIGTERM → SIGKILL if it has not exited in 2s
  ├─ generic SSE long connection openSseStream (src/index.ts, one piece of infrastructure for all four streams)
  │   ├─ loopback fence + assertRef / assertImageRef + tail clamping (same as the snapshot routes)
  │   ├─ header write + flushHeaders / 15s ping heartbeat / active-stream registry / silent abort when the frontend disconnects
  │   ├─ /logs/stream: docker logs -f → line{"d"|"e"} + end{container-exit,code}
  │   ├─ /stats/stream (read-only): docker stats normalised line by line → stats{ContainerStats};
  │   │   it does not end naturally, so a frontend disconnect aborts it and docker stats exiting on its own sends end{stats-exit}
  │   ├─ /events/stream (read-only): docker events --filter type=container →
  │   │   event{action,name,image,...} (allowlist filtered); the daemon side ending sends end{events-exit}
  │   ├─ /images/pull/stream (allowMutations): docker pull → line{d|e} +
  │   │   end{pull-exit,code,ref}; 403 and no stream when mutations are off
  │   └─ plugin disabled / config hot-updated / uninstalled → all four streams get a uniform end + abort
  ├─ image routes: /images/inspect (read-only) · /images/remove · /images/prune (allowMutations)
  ├─ network / volume routes: /networks · /volumes and their inspect (read-only), remove / prune (allowMutations)
  └─ agent tools: docker_targets / docker_ps / docker_inspect /
     docker_logs (snapshot semantics unchanged) / docker_stats / docker_events / docker_images /
     docker_image_inspect / docker_networks / docker_volumes (always registered)
     + docker_action / docker_image_remove / docker_image_prune / docker_image_pull
       (allowMutations) / docker_exec (allowExec)
```

## Development and acceptance

```bash
pnpm --filter @hyzyn/dsh-docker build       # tsc → lib/ (host half) + esbuild → client.js (browser half)
pnpm --filter @hyzyn/dsh-docker typecheck
pnpm --filter @hyzyn/dsh-docker smoke       # three offline regression suites, none needing a docker daemon
pnpm test                                    # repo-level vitest (including this package's config-route / current-session / session-target / logs-stream / streams / ssh-stream-budget suites — six in total)
```

`scripts/smoke.mjs` (reading the `lib/` build output; item counts are self-reported at the end of the script) covers pure logic: ps parsing (field mapping /
compose labels / ports / deriving a missing `State` / noise lines / JSON arrays), port-string parsing and
deduplication, stats parsing (percentages / memory / IO / PIDs), abnormal input for size and percent, images parsing
(dangling), **image inspect / history parsing (both the JSON and the plain-text-table path)**,
inspect parsing (state / health / exit code / mounts / networks / ports / not throwing on missing fields),
injection rejection for `assertRef` / **`assertImageRef` (admitting registry/digest, rejecting flags and
injection)**, `assertBin`, `formatBytes`, `shJoin` escaping, `DockerApi`'s argv construction
(ps / logs / action / exec / probe success and failure / **image inspect·rm·prune·pull·statsStream·pullStream**),
`normalizeConfig` defaults and clamping, `sanitizeTargets` / `sanitizeHostKeys`,
`resolveTarget`'s four paths, and `mergeTargetSecrets`' credential-preserving semantics.

`scripts/route-smoke.mjs` runs end to end with **a fake cordis ctx + a fake docker CLI script**: plugin
mounting (settings / tools / routes / capability-announcement registration), the actual calls and returns of
**26 routes** (including the event sequences and parameter validation of the four SSE streams `/logs/stream`,
`/stats/stream`, `/events/stream`, `/images/pull/stream`, with the event stream additionally asserting that noise is
dropped by the allowlist), the `docker_events` tool's snapshot output and its `since` character-set validation,
`/images/inspect`'s details + build history, `/config` credential masking, 400 for unknown config keys, 403 for
`/action`, `/exec` and image mutations (remove / prune / the pull stream) while read-only together with the
corresponding tools not being registered, immediate unlocking after the switches are turned on (including the
`settings/updated` hot-update path), 403 for non-loopback (including the three stream routes), container names /
image references rejected by the allowlist when injection is attempted, the fallback when `target` is omitted and the
error with several targets, and 403 on the stream routes after being disabled.

`scripts/client-smoke.mjs` executes the build artifact
`client.js` in Node with minimal DOM / React stubs: verifying the registration id and factory shape, that it only
requires modules provided by the platform seed
(`react` / `react/jsx-runtime` / `react-dom/client`), that the settings card key registered by `apply` equals the
namespace `docker`, that it degrades quietly when the host sidebar cannot be found and that unmount can be called
repeatedly, the four paths of ttyConnbar integration (connection-book name hit / host:port hit / no button for an
unconfigured host / silent skip when tty is not installed), FOLLOW's SSE subscription and the "back to bottom"
interaction (static assertions), the **image details / pull stream / remove / prune entry points**,
**stats FOLLOW + sparkline hooks**, **Compose grouping and merged logs**, **the "Activity" strip wiring + the event
ring buffer / action labels / debounce** (pure logic through the `__events` test seam), and the style rule that hides
the entry label when the sidebar is collapsed (`data-sidebar-collapsed`).
Verification that needs a real daemon follows the manual checklist below.

`test/logs-stream.test.ts` (27 cases, run by the root `pnpm test`) covers four layers of the live log stream:
`logsStream`'s argv construction and `assertRef` allowlist, the single-line JSON encapsulation of SSE frames
(newlines / multi-byte), the local stream lifecycle (fake spawn: multi-byte across chunks, the SIGTERM→SIGKILL
ladder, close resolve, spawn error) plus the SSH long stream's busy-count pairing / sweeper skip, and the route
layer's event sequence / heartbeat / silent abort when the client disconnects / uniform wrap-up when the plugin is
disabled.

`test/streams.test.ts` (33 cases) covers the **stats stream / event stream / pull stream / networks and volumes /
generic SSE infrastructure**: `statsStream` without `--no-stream` (the same construction point as the snapshot),
`pullStream`'s `assertImageRef` allowlist, `/stats/stream` normalising line-by-line JSON (including half lines
across chunks) into `stats` events with the same shape as the `/stats` snapshot, heartbeats, silent abort when the
client disconnects, `eventsStream`'s argv (no `--since` / `--until`, carrying the `type=container` filter) and the
`events()` snapshot's `--since` + `--until` (without until it would never exit),
`parseContainerEvent`'s allowlist / bad-line dropping / health_status suffix / field extraction / compatibility with
the old `status` field, `/events/stream`'s event sequence and half lines across chunks,
`/images/pull/stream`'s allowMutations gate (403 and no stream) / `pull-exit` wrap-up / uniform wrap-up when
disabled, **`assertName`'s validation matrix (`/` and `:` must be rejected — and those are exactly what
`assertImageRef` admits), the ls·inspect·rm·prune argv for networks / volumes (prune must carry `-f`), tolerant
ls·inspect parsing for network / volume (string booleans, older versions without `Mountpoint`, empty output / bad
lines), and the gating of the eight `/networks` and `/volumes` endpoints (403 for remove/prune with the switches off,
400 for a missing name, 500 for an illegal name)**, plus `formatBytes`.

### Manual acceptance checklist

1. **Local target**: add a `kind=local` target named `local`, and `probe` returns the server version;
   the container list matches `docker ps -a` (including stopped containers).
2. **SSH target**: with an entry already in the tty connection book, reference it via `book` → the container list /
   details / logs work; the first connection logs "host key fingerprint recorded (TOFU)" and the second does not
   prompt again; after manually changing the fingerprint in `hostKeys` and reconnecting, the connection should
   **be rejected** with reset guidance.
3. **Read-only interception**: with both switches off, `/action`, `/exec`, `/images/remove`,
   `/images/prune`, `/images/pull/stream` all return 403; on the agent side exactly 11 read-only tools are
   registered (`docker_targets` / `ps` / `attention` / `inspect` / `logs` / `stats` / `events` / `images` /
   `image_inspect` / `networks` / `volumes` — see the tool table for the authoritative list), and
   the panel's start / stop / remove, image removal, pruning and pull buttons are greyed out. After turning on
   "allow mutations" these routes and tools appear immediately (no restart needed).
4. **Logs / stats / images**: `tail` and `timestamps` / `since` take effect; stats show
   CPU, memory, network and block IO; the image list carries a marker on dangling entries.
5. **FOLLOW live log stream**: turning on `FOLLOW` on the log page → the status line first says
   "connecting" and then "following live", and new lines from `docker logs -f` appear immediately (`docker run --rm alpine sh
   -c 'i=0; while :; do echo line-$i; i=$((i+1)); sleep 1; done'` makes this observable);
   with FOLLOW on, `AUTO REFRESH` is greyed out and polling stops; scrolling up brings up "back to bottom",
   and clicking it returns to the bottom and resumes auto stick-to-bottom; turning FOLLOW off immediately returns to
   snapshots. Stop the container → the stream receives
   `end`, hints "the container has exited (exit code N)" and automatically does one more snapshot. Kill `dsh web` and
   start it again (or hot-change the plugin config) → the status line briefly says "reconnecting" and then heals
   itself, with no error banner. Run the same with an SSH target and confirm that panel operations such as
   `docker ps` on the same host are unaffected while the stream runs (connection reuse), and that idle reclamation
   (120s) does not cut the stream.
6. **Stats live following**: turning on `FOLLOW` on the stats page → "connecting to the stats stream…" → "following
   live (docker stats)", and the CPU / memory sparklines grow a little every second (run `docker run --rm
   alpine sh -c 'while :; do :; done'` to watch CPU rise); turning FOLLOW off immediately returns to snapshots and
   resumes polling. Stop the containers being measured → the stream receives `end` (stats-exit), hints, and then
   returns to polling automatically.
   Note that **this stream does not end naturally**: switching pages / closing the panel must close the `EventSource`
   (on the host side `docker stats` should be seen being SIGTERM'd).
7. **Image details / removal / pruning**: click "details" on a row of the images page → the layer count in the
   overview matches `docker image inspect` and the build history matches `docker history` (Docker ≥ 26
   goes through `--format`, older versions fall back to the plain-text table); look up a dangling row by image ID.
   Click "remove" → after a second confirmation it runs `docker image rm`; removing an image that a container
   references should fail with a hint.
   "prune dangling" only removes untagged images, and its output ends with `Total reclaimed space`.
8. **Pull progress stream**: the pull icon in the images toolbar (hovering shows "pull image") → enter a small image
   you do not have locally (such as `alpine:3.20`)
   → per-layer status lines appear live and are updated in place by layer; when it finishes it hints "pull complete"
   and refreshes the list automatically.
   Clicking "stop" mid-pull or leaving the view → `docker pull` is terminated by SIGTERM with no leftover process.
   With "allow mutations" off the button is greyed out, and going straight to `/images/pull/stream` returns 403.
9. **Compose project view**: start two or three services with a compose file (`docker compose up -d`) →
   switch the toolbar to "Compose" → the services are grouped under one project card with the correct
   running / service counts and states;
   click into the project to see the service table, switch to "merged logs" → the services' logs appear mixed by the
   `[service]` prefix (the equivalent of `docker compose logs -f`), and the filter box can filter by service name and
   content; after turning "auto
   scroll" off new logs keep entering the buffer without the view jumping. Containers without a compose label are
   grouped under "other containers (non-compose)".
10. **After turning on `allowMutations`**: stop / start / restart succeed; removing a running container
    errors with a "stop it before removing" hint, and stopping first and then removing succeeds.
11. **After turning on `allowExec`**: a command such as `ls -la /app` returns stdout and the exit code; changing the
     command to `sleep 60` (with `timeoutSec` lowered) should be interrupted and report a timeout; a `command` longer
     than 8000 characters is rejected.
12. **The exec drawer coexists with the body** (tty ≥ 0.15): after opening the drawer from a card's "Terminal", switch
    to logs / stats / another container's details, and both the drawer and the terminal session must stay alive;
    **collapsing** (the arrow or double-clicking the top edge) squashes the drawer into one title bar and the session
    keeps running (expanding restores it); **dragging the top edge** changes the height without exceeding 75% of the
    panel; clicking the blank backdrop or the panel's ✕ should now raise an "end the container terminal session"
    confirmation, and cancelling keeps the session alive while only confirming ends it (the tty side receives a kill).
    Offline regression: `node packages/tty/scripts/preview.mjs docker-exec-logs`
    (headless Chrome runs the real client: drawer + log page + collapse and expand, asserting that the session was
    not ended).
13. **Entering the container panel from the connection bar (dock mode, needs tty ≥ 0.16)**: open an SSH tab in the
    tty panel →
    connection bar "Containers" → the container panel should dock **to the right of the terminal** (not a full-screen
    modal) while the terminal stays typable;
    dragging the left edge resizes it (up to 72% of the panel width), the title-bar arrow collapses it into a narrow
    strip (the terminal takes back the full width and the container panel is not unmounted), and ✕ tucks the panel
    away without affecting the SSH tab; clicking a card's "Terminal" at this point should **open a new
    `<container> · exec` tab in the same terminal panel** rather than nesting another terminal drawer.
    Offline regression: `node packages/tty/scripts/preview.mjs docker-dock`
    (asserting docked / no backdrop / the terminal widens after collapsing / the container panel survives).
14. **Multi-select merged logs**: click `Select for merging` in the container list → checkboxes appear on the left of
    the cards and the card action bars collapse;
    check 2–3 containers → the action bar shows "3 containers selected", and clicking `merged logs` → the merged
    view's title is
    "merged logs · 3 containers" with the three streams mixed by the `[service]` / container-name prefix; with only 1
    checked the button is greyed out and hints "select at least 2 containers", and at 9 checked it is greyed out and
    hints at a maximum of 8; stop one of the containers from the list → that stream ends with the usual `end`
    semantics while the others are unaffected.
15. **Esc leaves selection mode**: pressing Esc in selection mode → back to the normal list, checks cleared and the
    action bar gone;
    clicking `Select for merging` again (its label is now `Exit selection`) has the same effect; switching targets /
    switching segments / closing the panel also clear the selection mode and the checks together.
16. **The Activity strip**: the "Activity" strip appears at the head of the container list, its status dot goes from
    yellow to green and the copy reads "receiving live
    (docker events)"; running `docker restart <container>` / `docker stop`+`start` → the
    list state follows within 1 second and the Activity strip shows `stop` / `start` (abnormal exits show the coded
    form such as `die(137)`); clicking the title collapses it (the event stream is not interrupted, and expanding
    still shows the accumulated latest 8);
    several consecutive `docker exec` calls **produce no events at all** (`exec_*` has already been dropped by the
    server-side allowlist);
    after the network drops / `dsh web` restarts, recovery briefly shows a yellow status dot and automatically does
    one full list refresh.
17. **Networks / volumes**: the toolbar segments show "Networks" and "Volumes". The network list should contain
    `bridge` / `host` / `none`
    plus project networks created by compose; click one to enter details → the subnet / gateway in the overview match
    `docker network
    inspect`, an `internal` network carries a badge, and the "connected containers" tab lists container names and
    IPv4.
    The volume list's mountpoints match `docker volume ls` (over-long paths are truncated, hovering shows the full
    value).
    With "allow mutations" off, both prune icons and the remove key in details are grey; with it on:
    removing a network that no container is attached to succeeds, while removing one still in use errors with a hint;
    volume pruning raises a confirmation saying "the data will be deleted as well". **Note**: on docker < 23 volume
    pruning also deletes named volumes, so it is best to confirm on a test target first.

18. **Multi-target Overview**: configure two or more targets (local + one SSH) → the `Overview` pill appears next to
    the target picker;
    clicking it shows two counter cards on one screen (each badged "local" / "SSH") plus the attention area, with the
    card numbers matching that target's
    container list. Change one target's SSH address to something wrong (or stop the remote docker) and refresh →
    only that card is outlined in red and "1 target unreachable" appears at the top, while the other card still shows
    its results, and **the page does not**
    wait for the SSH timeout before showing content (progressive landing). Click an attention row → it lands on that
    container's details on that host, and going back gives
    **that target's** container list rather than the Overview; click a counter card → that target's container list.
    When everything is fine the attention area shows
    "all good"; while targets are still answering it shows "reading…". Turning on "auto refresh" → polls all targets
    at
    `pollIntervalSec` (turning it off stops that).
19. **Switching targets does not cross-talk (the list write gate)**: let Target1 (an unreachable SSH host) fail first
    and raise an "operation failed" banner,
    then immediately switch to the healthy Target2 → the banner should **disappear with the switch at once** and the
    list should be Target2's containers; then wait 20s
    so that Target1's timeout response comes back **after** that → the banner must not reappear and the list must not
    be replaced with
    Target1's containers. Entering from the Overview by clicking Target1's red counter card should likewise not show
    the previous target's failure.
    Reverse check: switch to Target2 and then immediately back to Target1 (which still cannot connect) → the banner
    should describe Target1's own
    failure, not treat Target2's successful result as Target1's.

## Version / license

`@hyzyn/dsh-docker` 0.3.1 · [Apache License 2.0](../../LICENSE)
