# @hyzyn/dsh-docker

[中文](README.md) | English

> The DSH sidebar "Containers" panel: containers on the local machine and on SSH hosts inspected on one screen — read logs, watch resources, enter containers, start / stop / remove, **read-only by default**.

## Features

- **A resident session right-sidebar tab**: the panel lives as a right-sidebar tab (`sidebar.right.pane.tab`)
  **side by side** with the conversation — after handing an error to the agent the logs stay on the right;
  collapsing it leaves the viewport and drops the live streams, handing the SSH channels back. Panel-level state
  (target / view / filter text / selected container and its tab) is kept **across sessions**; hosts without the
  right-sidebar services fall back to the dock / modal.
- **Right-click a log into the agent**: select the failing lines in the log view, then right-click for "send to
  the current session / fill the input box so I can edit first" — the selection travels with its target,
  container, time window and 20 lines of context on each side (the menu states plainly that the content enters
  the model context and may carry credentials). Delivery reports itself twice: a **viewport-level toast**, and —
  when the terminal panel is open — an **automatic fold of the terminal** (`ttyPanel` v2 contract). To edit first
  use the draft action: **the session input box is the only editing surface**.
- **One-click "connect local" / aggregated fetches across targets**: two **non-permanent** entries (the empty
  state's primary button / the target dropdown's last item) add this machine as a local target in one click (the
  agent-side twin is `docker_connect_local`); the Overview fans out over every `targets[]` entry in parallel, and
  an unreachable target only spoils its own cell (`docker_ps target:"*"` shares the same shape).
- **"Needs attention" reads authoritative fields**: unhealthy / repeatedly restarting / OOM-killed / non-zero
  exit / dead; OOM and the real exit code come from one `docker inspect` — the 137 in a `docker ps` summary
  cannot separate an OOM kill from a manual kill (criteria in [Overview](#overview-cross-target-and-the-needs-attention-criteria)).
- **A closed troubleshooting loop**: the Diagnosis tab turns four reads into "verdict + findings + evidence +
  timeline + suggestions", and diagnosis history then answers "is it getting worse"; the Processes tab gives a
  `docker top` snapshot; the Disk view lays out the reclaimable bill and "who uses it"; the overview bottom
  rebuilds a reproducible `docker run`. See [Container diagnosis](#container-diagnosis-why-is-it-failing) and
  [Diagnosis history](#diagnosis-history-is-it-slowly-getting-worse).
- **Four long-lived SSE streams on one substrate**: log FOLLOW, `docker stats`, `docker events` and `docker pull`
  all run through the same `openSseStream` (heartbeat / active-stream registry / teardown on disconnect / a
  `ready` frame as soon as the pipeline is up) and differ only in how they end; merged logs pack several
  containers into **one** `/logs/stream?ids=…`. "Connected" and "receiving data" are two different things: the
  client only counts `ready`. See [SSE event protocol](#sse-event-protocol-logsstream-statsstream-eventsstream-imagespullstream).
- **Read-only by default, two independent switches**: `allowMutations` (container start / stop / remove plus
  image remove / prune / pull) and `allowExec` (one-off `docker exec`); while one is off the agent tools are
  **not registered** and the HTTP routes return 403
  (the capability does not exist, rather than failing when called). A grant takes one of two out-of-band channels
  (launch environment variables / confirming in the card). Container names and IDs pass a whitelist, every command
  is built as argv with single-quote escaping, and passwords / passphrases are referenced as `env:NAME` and never
  sent back to the browser.
- **Data-level reuse of dsh-tty, no code coupling**: no tty code is imported and the two install and upgrade
  independently; with tty present three optional extension points are consumed (`ttyConnbar` / `ttyTerminal` /
  `ttyPanel`), each degrading silently without tty or below the required version.

## Relationship with dsh-tty

This plugin stands on its own: it imports no tty code and tty needs no source changes. With tty installed they
cooperate at the optional extension points below; without it they degrade quietly.

| Dimension | Description |
| --- | --- |
| Plugin form | A standalone package `@hyzyn/dsh-docker`; both can be installed and upgraded independently |
| Connection book | SSH targets can **reference a tty connection-book entry name** (read-only access to `sshHosts` through `ctx.settings.get('tty')`); without tty this degrades to "inline host/username" or a local target |
| Host fingerprints | This plugin keeps its own `hostKeys` (TOFU) and **prefers tty's already-recorded fingerprints as the seed** — the same host does not have to be confirmed in two places |
| Execution channel | Its own pooled SSH exec (`src/ssh-exec.ts`), fully independent of tty's PTY sessions; neither takes the other's slots |
| Context entry point | With tty ≥ 0.13.0 it can optionally consume `ttyConnbar` and insert a "Containers" button in the SSH connection bar (next to SFTP) (**shown as soon as it is registered**), with the target resolved from the current session at click time; **except in exec tabs this plugin opened itself** (recognised via `spawnSpec.command`); if tty is missing or too old this is skipped silently |
| Panel hosting | **The default is a session right-sidebar tab** (`sidebar.right.pane.tab`); the frame sidebar entry only opens or focuses it, and **a page type deduplicates inside one column**. The **terminal connection bar** entry is the opposite — it sits on the viewport-covering tty modal, where a tab would be hidden, so that path docks to the right of the terminal via `ttyPanel.mountPane` (**the entry decides the carrier**). Without the right-sidebar services (older hosts), or with `localStorage['dsh-docker:carrier'] = 'modal'`, it falls back to the dock / full-screen modal. All three carriers are **one component**, differing only in shell and geometry |
| Terminal hosting | Interactive terminals are hosted by tty (it owns the PTY). **Right-sidebar tab**: when the panel is fullscreen (`sidebar.fullscreen`) the terminal is embedded in place via `ttyTerminal.mount`, otherwise a tab is opened via `ttyTerminal.open` (re-clicking the same container **focuses the existing tab** — tty contract v3 `reuse`); **dock** always opens a tab; **modal** embeds in place. Command tabs (non-empty `spawnSpec.command`) show **no connection-bar extension area** on the tty side (SFTP / tunnels act on the connection itself, which misleads on a `docker exec` tab); this plugin also withholds the "Containers" entry in exec tabs it opened itself. Without tty, or below the required version, copying the command is the fallback. This plugin implements no PTY / xterm / reconnect stack |
| Division of labour | **Interactive troubleshooting** (`docker exec -it`, a shell inside the container, TUIs) is hosted by tty; **read-only inspection and agent automation** use this plugin's own exec channel |

## Installation

```bash
dsh plugin --profile web add @hyzyn/dsh-docker              # npm install (once published)
dsh plugin --profile web add link:$(pwd)/packages/docker    # repo development and debugging
```

The aggregate package `@hyzyn/dsh-all` (or the repo-root bundle) already includes this plugin, so there is no need
to add it separately. After installing, restart `dsh web` and the "Containers" entry appears in the sidebar; the
"Docker Container Panel" card maintains targets and switches, and **saving applies hot** (`settings/updated`
triggers re-resolution, with no restart needed).

> If `@hyzyn/dsh-all` or the root bundle is already installed in the web profile, do **not** add this package
> again, or the plugin line is mounted twice and startup reports `duplicate loader entry id`.

## Usage

Two entry points, one panel. **The default carrier is a session right-sidebar tab** — the entries only open or
focus it, and the panel sits side by side with the conversation.

![Right-sidebar tab carrier: conversation and container panel on one screen, panel full height; collapsing leaves the viewport](https://cdn.jsdelivr.net/gh/hyzyn/dsh-plugin-kit@main/docs/dsh-plugin-kit-docker-tab.png)

- **Sidebar "Containers"** (the main entry point): works for any target, including local docker and switching
  between multiple targets. If it is already open it focuses (a page type deduplicates inside one column), so
  clicking twice never opens a second "Docker containers" tab.
- **SSH connection bar "Containers" button** (a contextual shortcut, tty ≥ 0.13.0): it appears next to SFTP in an
  SSH tab of the tty panel, **shown as soon as it is registered**, and opens the panel directly on **the host of
  the current session** (the target is resolved at click time by entry name or `host:port`; **no matching target
  does not hide the button** — the panel says how to configure it). This path goes to the **dock right of the
  terminal** — the rule is **"the entry decides the carrier"**: from the frame's sidebar → the tab; from inside
  the terminal modal → the dock.

### Carriers

| Carrier | When | Behaviour |
| --- | --- | --- |
| **Session right-sidebar tab** (default) | the host provides `sidebarRight` / `sidebarRightTabs` | side by side with the conversation; collapsing hides it without losing state; the right sidebar's fullscreen mode gives it the whole viewport |
| **Dock right of the terminal** | arriving from the **terminal connection bar's** "Containers" button, or no right-sidebar service / `localStorage['dsh-docker:carrier'] = 'modal'` with tty ≥ 0.16 and its panel open | docked to the right of the terminal panel (resize / collapse / ✕ provided by tty, the terminal stays usable); one dock at a time — docking this plugin takes down the previous occupant (for example tty's own SFTP); since tty 0.18.4 the pane is **owned by the tab it was opened from**: switching tabs hides it, switching back restores it and closing that tab tears it down (while hidden the React tree and polling keep running) |
| **Full-screen modal** (fallback) | neither of the above | its own backdrop, closes on outside click; the panel sits above tty's modal in z-order |

Rolling back to the old shape is one console line: `localStorage.setItem('dsh-docker:carrier', 'modal')`
(`removeItem` restores the default). That switch is a temporary grey-release knob, so it deliberately stays out of
settings.

**State retention**: the panel inspects hosts, not workspaces, so view / filter text / selected container
(including its overview-logs-stats tab) / target are kept **across sessions**; the log filter and LINES switch
inside a container detail belong to that container and are not kept. **Collapsing the tab drops every live
stream** (handing the SSH channels back) and expanding reconnects — the streams open with `tail`, so history
refills itself.

**Stickiness across sessions**: right-sidebar tab records are **session-scoped**, so a tab opened in session A
does not exist in session B — yet the panel inspects hosts, so losing it on a session switch is pure loss. The
plugin therefore keeps a "the user wants this open" intent: **switching sessions reopens the tab in the new
session**, and only clicking the ✕ stops that (that ✕ is executed by the **host**, so it must be registered
through `registerCloseHandler` — a panel-level `onClose` alone would miss it).

**Dock fallback carrier** (right of the terminal):

![docker panel docked to the right of the terminal panel: the terminal stays visible and usable](https://cdn.jsdelivr.net/gh/hyzyn/dsh-plugin-kit@main/docs/dsh-plugin-kit-docker-dock.png)

A panel opened this way **never covers the terminal**: with tty ≥ 0.16 it docks to the right of the terminal
panel (draggable width, collapsible into a narrow strip, ✕ to tuck away) while you keep typing in the terminal.
In dock mode the card's "Terminal" button **opens a new tab in the same terminal panel** running
`docker exec -it`; it also **stops rendering the panel's own header** — the title and ✕ are handled by the
sidebar title bar, and the refresh control and read-only badge move to the **end of the toolbar, right-aligned**:
the left end stays for the target / view / search / filter controls.

Inside the panel:

![Container list: target picker / search and state filtering / card action bars (the view and mutate groups)](https://cdn.jsdelivr.net/gh/hyzyn/dsh-plugin-kit@main/docs/dsh-plugin-kit-docker-panel.png)

- **Switching targets has a transition and guards**: as soon as the picker changes, the cards below are still the
  previous target's (a remote round trip can take up to 20s). During the switch the old cards are desaturated and
  **the pointer is locked** (it reads as "a different batch of content" rather than "it broke", and it prevents
  acting on the stale list — that would aim at the new target with container IDs from the old list and really
  could stop a same-named container on the other side), while new data fades in; the whole block is
  **absolutely positioned**, so the first card's position and the scroll height do not change. **A failed switch
  clears the old list** and settles into the new target's error state, and the empty-state copy distinguishes
  "failed to read" from "filtered too narrowly".
- **Target selection**: the panel picks a target first (from the `targets` config, local / SSH); with only one
  target configured it is selected by default, and agent tools may omit `target`. **The last selected target is
  remembered** (`localStorage` key `dsh-docker:last-target`, not written to config): the priority is **what the
  connection bar specifies > last remembered (and still present) > first in the list**. Switching targets is **a
  whole-context switch**: requests still in flight for the previous target are all invalidated (a list write
  gate), so there is no cross-talk like "the picker is already Target2 while the cards are still Target1's".
- **Container list**: name / status / health / image / port mappings / compose project and service / short ID;
  it supports **search** by name or image, **filtering** by state, and **auto refresh** (polling at
  `pollIntervalSec`; switching to the images page pauses it and hides that switch). "Include stopped" and "auto
  refresh" are two **grouped** switches, and the search box is the only flexible item among them: one row on a
  wide panel, wrapping by group only in a narrow column (dock, 520px).
- **"Activity" strip (the docker events stream)**: a collapsible narrow bar at the head of the container list
  (expanded by default) that follows one SSE stream (`GET /api/dsh-docker/events/stream`, where the server runs
  `docker events --filter type=container`) showing the last 8 events (time + container name + action, with `die`
  carrying its exit code). It is the entry point for **event-driven refresh**: 500ms **after an event arrives** it
  debounces a list refetch, layering on top of the existing `AUTO REFRESH` rather than excluding it — polling is
  the safety net, events cover "just happened". Events stay in memory only (a ring buffer of 50), switching pages
  closes the stream, and switching targets clears the buffer. The allowlist keeps only the nine lifecycle actions
  (start / die / stop / kill / oom / health_status / destroy / rename / update): noise such as `exec_*` and
  `archive-path` is dropped server-side. A closed stream needs a **manual reconnect**: entering `closed` is
  terminal, so the Activity strip offers a **Reconnect** button (not in `unsupported` environments) and the
  toolbar's ⟳ reconnects too; **the AUTO REFRESH poll deliberately does not reconnect**, and a successful
  reconnect compensates with one full list refetch. **A refused reconnect must say why** (`D164`): an actively
  refused stream gets an `event: error` frame carrying a `message`, which the client **shows on the Activity
  strip** — merely setting `closed` makes "refused" indistinguishable from "the click did nothing". **"Receiving
  events" is only claimed on the host's `ready` frame** (response headers do not count).
- **Select for merging (temporary multi-select merged logs)**: the toolbar's `Select for merging` enters selection
  mode — clicking a card body becomes **select / deselect** (the action bar collapses temporarily so that
  multi-selecting does not mis-click start / stop / remove), and an action bar appears: "N containers selected" +
  `merged logs` + `Cancel`. `merged logs` needs at least 2 containers and at most **3** (beyond that the button
  is greyed out with its rationale). The merged view reuses the Compose project view's merged logs; its content
  controls are fully aligned with the single-container log view, plus **by time / by arrival** ordering and a
  **pause**. Selection is **temporary**: not persisted, not written to settings; it is dropped when switching
  targets / segments / closing the panel, and vanished containers are pruned by id.
- **One-click selection by condition** (in selection mode): the action bar's second row offers condition chips
  (`all visible / unhealthy / needs attention / stopped`, plus `same image / same project` once something is
  selected), with counts **truncated to the remaining slots** — a chip reading 3 really does select 3. Conditions
  only apply within the **current filtered result**.
- **Container cards**: "label + value" rows (image / ID / ports / created / compose) plus a row of icon buttons,
  **split by a vertical rule into the "view / mutate" groups**:

  | Group | Buttons | Description |
  | --- | --- | --- |
  | View / enter | Terminal, logs, resource usage | Does not change container state; always available even in read-only mode. **The Terminal button runs an interactive `docker exec -it` shell and is not gated by `allowExec`** (that switch only covers this plugin's one-shot exec channel — see "Known limitations") |
  | Mutate | start / stop, restart, remove | Ordered by increasing destructiveness; available only with `allowMutations` on, otherwise the whole group is greyed out |

  Remove gets two extra protections: destructive colouring plus a gap between it and "restart", and a second
  confirmation after the click. **The whole group is locked while a command is in flight**: `stop` / `rm` waits
  for the container to actually exit (up to a dozen seconds), during which the confirmation dialog stays open
  showing "running…", the card's other mutate buttons are dimmed, the icon that is running becomes a spinner, and
  everything is restored only once the refreshed list lands. Image removal / pruning goes through the same
  confirmation dialog. Clicking a card body opens the overview.
- **Container details (a full-column view)**: the top is "back + container name + status badge + target host",
  with five tabs below — overview (`docker inspect` authoritative data + one-shot exec + an equivalent
  `docker run`), logs, stats, diagnosis and processes. The log / stats icons on a card land directly on the
  corresponding tab; diagnosis and processes **fetch only while that tab is open**.
- **Log view (a compact two-row layout)**: the first row = back + container name + status + target host +
  `LINES` / `TIMESTAMPS` / **`FOLLOW`** / `AUTO REFRESH` (a switch plus 2/3/5/10s intervals, log page only) +
  refresh / close; the second row = the tabs + an **always-present** "filter logs" input (an ✕ floats inside to
  clear, Esc clears too) + a **level threshold** (`all / INFO+ / WARN+ / ERROR+`) + **export**
  (`⬇ .log` / `⬇ .md`, exporting **what is currently displayed**) + the line count in a fixed slot on the right.
  The first row is *transport and display*, the second is *content* — and the second row is **exactly the same as
  the merged log view** (one level kernel, one export builder, one count wording). The level threshold treats a
  line without a level prefix as a **continuation of the previous entry and follows its level** — otherwise
  `ERROR+` would cut a stack trace in half. The log body is coloured by level, timestamps are dimmed, and filter
  hits are highlighted.
- **FOLLOW live log stream**: with `FOLLOW` on, the UI switches from "polling a snapshot" to **SSE push**
  (`GET /api/dsh-docker/logs/stream`, where the server runs `docker logs --follow`); `FOLLOW` and
  `AUTO REFRESH` are mutually exclusive (opening the stream stops polling and greys out the switch), and closing
  it returns to snapshots with an immediate refresh. Streaming logs keep the last **5000 lines / 4MB** (a ring
  buffer dropping the oldest on either cap; newline-free output is force-split so memory stays bounded), and
  chunks render at most every **150ms**. The body is **windowed** (`D152`): only the visible rows plus 24 rows of
  overscan each side are mounted, the rest padded; measured row heights plus a tail anchor keep auto-scroll /
  scroll-up pause / "back to bottom" exact, and **switching streams / containers / refreshing a snapshot
  invalidates that whole generation** (`D155`: snapshot row ids are positional). The view does not truncate:
  whatever `LINES` selects is scrollable and exported. **Reconnection is managed by the plugin itself**: the first
  connection carries `tail`, every reconnect uses `tail=0` — new lines only, **never replaying history**.
  Backpressure and overflow (`D153` / `D156` / `D157`) are in "SSE event protocol".
- **Overview**: `docker inspect`'s authoritative data — state and health, exit code, restart count and policy,
  port mappings, mounts (including read-only flags), networks and IPs, entrypoint and command, and the latest
  health-check output; below it you can run a one-shot `docker exec` (requires `allowExec`).
- **Logs**: a tail snapshot from `docker logs --tail` (`logTailDefault` lines by default), with timestamps and
  `--since` switchable. **Two different caps**: `LINES` is a **line** cap while the settings card's "output cap
  (KB)" is a **byte** cap — the smaller wins, so the byte cap can truncate with a banner. To keep watching new
  logs turn on `FOLLOW` (the same argv plus `--follow`, no overall timeout and no byte cap, ending on the
  connection's lifecycle).

![Log page: level colouring + an always-present filter box + line counts](https://cdn.jsdelivr.net/gh/hyzyn/dsh-plugin-kit@main/docs/dsh-plugin-kit-docker-logs.png)

- **Stats**: a `docker stats --no-stream` snapshot (CPU% / memory usage and share / network IO / block IO /
  PIDs), refreshed by the panel at `pollIntervalSec`. The stats page also has **`FOLLOW` live following**: it
  switches to `GET /api/dsh-docker/stats/stream` (the server runs `docker stats` **without** `--no-stream`, one
  line per second), and the browser side keeps a **60-point** ring buffer for CPU / memory mini trend charts. This
  stream **does not end naturally**; its close semantics are the frontend aborting, and when `docker stats` exits
  by itself the server sends `end` (reason=`stats-exit`).
- **Compose project view**: the toolbar's third segment. It groups `composeProject` / `composeService` into
  "project → service → container", one row per project with running / unhealthy / service counts; clicking into a
  project shows the service table, or opens **project-level merged logs** — **one** `/logs/stream?ids=…` carrying
  every container in the project (frames tagged with `id`), mixed client-side by the `[service]` prefix. A failed
  per-container sub-stream is marked "partially failed" while the other containers keep streaming.
- **Images**: a `docker images` list (reference / size / created / short ID), with `<none>:<none>` dangling images
  marked; the search box and counter are **fixed in the toolbar**, and the header sticks within the table body.
  Each row has "details / remove": **details** opens the full-column view (overview + `docker history` build
  history); **remove** (requires `allowMutations`) runs `docker image rm` after a second confirmation (without
  `-f`, so a referenced image fails with a hint to remove the related containers first).
- **Networks / volumes**: the toolbar segments extend to "Containers / Images / Compose / Networks / Volumes /
  Disk" (a narrow column scrolls the segment container horizontally, with no second-level menu). Both pages use
  the same "table + full-column details" layout:
  - **Networks**: name / driver / scope / internal badge / ID, with a row click opening details — overview and a
    "connected containers" tab. **Container counts deliberately stay out of the list rows**: only
    `docker network inspect` returns the connected list, and inspecting every row would be N docker calls.
  - **Volumes**: name / driver / scope / mountpoint (over-long paths are width-limited, with the full value in
    title); details are the overview page only (volumes have no reverse index).
  - The details header has a **remove** button, and both toolbars have a **prune icon**, all gated by
    `allowMutations` (greyed out with an explanatory title) and all requiring a second confirmation; a failed
    removal shows an inline banner rather than failing silently. These two pages **do not poll** (inventories
    change slowly).
- **Pulling images (an SSE progress stream)**: the pull icon in the images toolbar (requires `allowMutations`)
  opens the pull view; after entering a reference it goes through `GET /api/dsh-docker/images/pull/stream` —
  per-layer progress appears live, updated in place keyed by layer, and TTY `\r` refreshes do not make the buffer
  grow. The toolbar's "prune dangling" runs `docker image prune -f`, which **only removes untagged images**
  (deliberately without `--all`).

![Images page: the search box is fixed in the toolbar and the header sticks](https://cdn.jsdelivr.net/gh/hyzyn/dsh-plugin-kit@main/docs/dsh-plugin-kit-docker-images.png)

- **One-shot exec**: with `allowExec` on you can type a command, equivalent to
  `docker exec <container> sh -c "<command>"`, returning the exit code and stdout/stderr (no TTY).
- **Interactive terminal (the first icon on a card)**: it runs `docker exec -it '<container>' sh` and degrades in
  three steps depending on tty's capabilities —
  ![exec terminal drawer coexisting with the log page: collapsing only hides it, the session keeps running](https://cdn.jsdelivr.net/gh/hyzyn/dsh-plugin-kit@main/docs/dsh-plugin-kit-docker-exec.png)

  1. **Embedded in place (tty ≥ 0.15, recommended)**: a **terminal drawer** opens at the bottom of the panel via
     `ttyTerminal.mount`, and the panel does not collapse; **collapsing** (the arrow, or double-clicking the top
     edge) squashes the drawer into one title bar while the session keeps running, and **dragging the top edge**
     resizes it (capped at 75%). Only the drawer's ✕ and closing the panel really end a session — with an active
     session, closing the panel asks first, so that clicking the blank backdrop does not kill a container shell
     mid-troubleshooting.
  2. **Open a tab through tty (tty ≥ 0.14)**: tty opens a new tab running the same command, and this panel then
     collapses (this panel has a higher z-index, so not collapsing would only feel like "nothing happened").
  3. **Copy the command**: when tty is missing / too old / an inline target uses key·password auth (the browser
     has no credentials), it degrades to copying the command with a hint to paste it into the terminal panel.

  Local targets open a local session, SSH targets go over SSH by connection-book entry name (or inline fields),
  and the title is `<container> · exec`. Capability detection goes through the service contract version (`mount`
  exists only with `ttyTerminal.version >= 2`), not by guessing whether a function exists.

### Targets (local / SSH)

| `kind` | Description |
| --- | --- |
| `local` | the docker CLI on the machine hosting the plugin (`spawn` runs it directly, not through a shell) |
| `ssh` | connects to a remote host over `ssh2` and runs the docker CLI remotely (argv single-quote escaped) |

`kind=ssh` has two shapes: ① **reference a tty connection-book entry** — put the entry name in `book` (maintained
in the connection book under the Terminal Panel card) and host / port / username / auth follow from it; the
settings card's dropdown only lists entries tty has saved, and a missing tty or entry makes that target fail to
resolve with a clear error in both the panel and the agent tools. ② **inline fields** — `host` + `username` are
required, the rest as needed (`port` / `auth` / `keyPath` / `password` / `passphrase` / `agentForward`).

Targets are resolved **fresh for every operation**: change a connection-book entry in the tty card and the next
operation uses it immediately, with no restart. The remote side needs the docker CLI installed and the current
account able to use docker **without sudo** (usually via the `docker` group); otherwise `probe` passes errors such
as `permission denied while trying to connect to the Docker daemon socket` through verbatim.

#### Connect local (one click)

If you would rather not fill in a target by hand, the UI offers two entries, neither of them permanent:

| When | Where |
| --- | --- |
| You have no targets at all | A **Connect local** primary button in the panel's empty state (the whole panel is blank then, so one click is the shortest path) |
| You already have other targets | The **last item in the target dropdown**, `+ Connect local` — right where you look for a machine, and only visible once you open it |

The two are mutually exclusive, and **once a local target exists neither appears**. A permanent toolbar button is
not worth it: **with a usable target already present** it both occupies space and begs for clicks; but keeping
only the empty-state entry would miss the common "I have a few SSH hosts and want to add this machine too" case.
On the agent side the same operation is `docker_connect_local`, over HTTP it is `POST /connect-local` — every
entry point shares one implementation on the host.

| Situation | Behavior |
| --- | --- |
| A `kind=local` target already exists (whatever its name) | **Reuse it** (`created:false`) and just switch to it; nothing is created, rewritten or renamed |
| No local target | Append one under the stable name `local`; if `local` is taken, try `local-2`, `local-3`, … |
| SSH / custom targets configured | **Left exactly as they are** (order and credentials included); only the local entry is appended at the end |
| Clicked twice / concurrently | Idempotent: exactly one local target in the end |
| Settings store unavailable / save fails | A clear error (503 / 500 with the reason) and **no in-memory config change** — never "it showed up in the UI but is gone after a refresh" |

After the write succeeds it also runs one **read-only probe** (`docker version`) and puts the result into
`message`: the server version when the daemon is reachable, or the actual cause when it is not — **docker CLI
missing** (install Docker, or point "docker CLI" at the right path) / **probe timed out** (the daemon is wedged,
or `docker context` points at an unreachable remote) / **daemon not running** (Linux `systemctl start docker`,
macOS / Windows start Docker Desktop) / **no permission on the socket** (add the account to the `docker` group).
A failed probe is **not** a failed operation (the target really was added; `reachable:false` says so separately).

The binary this probe uses is **exactly the "docker CLI" value from the settings card** (`dockerBin`, `docker` by
default). When that CLI is missing it does one **read-only** lookup for another container CLI on `PATH`
(`docker` → `podman` → `nerdctl`) and names it in the message — it **only tells you, and never rewrites your
config** (podman's output-format compatibility has not been verified item by item, see "Known limitations").
Candidate matching is by **tool name** (basename), not by the raw config string. Timeouts are a **separate case**:
`probe()` returns `timedOut:true` plus an actionable sentence, and it **actually returns on time** — it kills,
allows a 500 ms settle window, and then releases the pipes itself if `close` still has not arrived (SIGKILL only
reaches the direct child, so a wrapper script's grandchild would otherwise stretch the cap into minutes).

Deliberately **not** done: installing Docker, starting a daemon, switching docker contexts, or touching any
environment variable; an empty `targets` keeps its meaning, with no implicit default target; and the
`clearTargets` protection is untouched. The path is also **independent of the capability switches** — it only
writes the plugin's own configuration.

### Merged logs (multi-select / Compose project)

Selecting several containers or opening a Compose project both merge the logs of several containers into one
stream: **one** `/logs/stream?ids=…` carries them all (frames tagged with `id`; the host still starts one
`docker logs -f` per container), mixed client-side in arrival order. The toolbar offers:

| Control | Semantics |
| --- | --- |
| **Live / Paused** | a real pause (see below) |
| **Timestamps** | shows a timestamp on every line. Timestamps are **always received with the stream** (`timestamps=1`); this only affects display |
| **By arrival / By time** | `by arrival`: follows with zero delay; `by time`: merges into one true timeline using each line's container timestamp |
| **Level filter** | `all levels / WARN+ / ERROR+`. **Lines with no level prefix (continuation lines such as stack traces) inherit the level of the previous log entry**, so ERROR+ keeps its stack trace with it; orphan continuations whose record header is outside the window cannot be judged and are kept |
| **⬇ .log / ⬇ .md** | exports what is currently displayed: `.log` is plain line text (`[service] ISO time body`), `.md` carries a header with the source containers / line count / export time |

**How merging by time works**: the SSE connections are established at different moments, so A's initial backlog
may arrive in one batch while B's arrives later, and sorting each batch on its own cannot fix cross-batch
inversions. The implementation **backfills the last 400 lines** — whenever a new batch arrives it re-sorts "the
last 400 lines + the new lines" by timestamp (the RFC3339 prefix, parsed and then stripped from the body). The
price is that in "by time" mode the last few lines already on screen may shift slightly (use "by arrival" while
following live output).

### "Pause" in merged logs (a real pause)

The merged logs of a multi-select / Compose project have a `Live / Paused` switch. **Pausing freezes the content**,
not just auto-scroll: while paused, newly arriving logs go into a client-side buffer and **the DOM is no longer
appended to** (the screen reader is not pushed away, and the view does not jump when the display cap trims the
front); the button itself shows how many lines have accumulated (`Paused +348`); on resume the buffer is merged
in one go (still under the 5000-line ring cap) and the view returns to the bottom. Only stopping auto-scroll is
not enough: with the label saying "paused" while the content keeps growing, users think the switch is broken.

### Overview (cross-target) and the "needs attention" criteria

The `Overview` pill next to the target picker (shown only with ≥2 targets) lays out all targets on one screen: one
counter card per target (running / stopped / unhealthy / **needs attention**), and below it a cross-target
"containers needing attention" table (container / target / status / **reason** / image; click a row for details,
click a card to switch to that target's list). Three design constraints:

- **Progressive landing + failure isolation**: each target requests and lands independently; one unreachable SSH
  host does not silence the whole page (deliberately **not** aggregated with `Promise.all`: an unreachable SSH
  host waits out the 20s readyTimeout, so aggregating would keep the whole page silent for 20s).
- **The "needs attention" criteria are the host's**: the container list and `/attention` are requested in
  parallel; the latter does an extra `docker inspect`, so it can identify **OOM (OOMKilled)** and the **real exit
  code** — a `ps` summary's `Exited (137)` cannot tell an OOM kill from a manual kill. When `/attention` is
  unavailable it falls back to the summary criteria and labels the count "needs attention (rough)".
- **Ordering**: OOM > zombie > unhealthy > repeatedly restarting > non-zero exit; equal weights are ordered by
  "most recent end time" descending (hovering a row shows the end / start times, restart count and exit code).

Polling reuses the toolbar's "auto refresh" switch (off by default): each round of this page is one `docker ps`
per target across all N targets, more expensive than any single-target page. With no exceptions it shows "all
good"; while some targets have not finished answering, the attention area shows "reading…" and **that counter card
also enters its loading state** (no 0/0/0 — "0 containers" would be read as "this machine has no containers").
Entering the Overview clears the single-target failed banner: the Overview attributes everything per target and no
longer stacks a single-target "operation failed" — the same SSH timeout told twice looks like two dead machines.

### Container diagnosis ("why is it failing")

The container detail view adds a **Diagnosis** tab; the agent-side twin is `docker_diagnose`. It makes four reads
in one pass — `docker inspect` (authoritative state / exit code / OOM / restart count / last health-check output /
resource limits), `docker logs --tail N`, `docker events --since` (**filtered server-side** with
`--filter container=<id>`) and `docker stats --no-stream` — and hands them to a set of **pure criteria**
(`src/diagnose.ts`: zero IO, no clock) that produce:

- a **one-line verdict** taking the highest severity found (`critical` / `warning` / `info` / `ok`);
- **findings**: code + one line + evidence. The criteria are — OOM-killed, non-zero exit (with what 126 / 127 / 137 /
  143 usually mean), crash loop, unhealthy (with the last health-check output), health check still starting,
  clean exit, not running (created / paused / dead), memory pressure (≥90% with a limit set), CPU pressure (≥90%),
  error lines in the log, no health check, plus three **collection-failure** signals;
- **evidence**: state, a ps-style status line, exit code, OOM, restart count, start/finish times, memory and CPU
  limits, log and error line counts, event count and current usage; a **timeline** of this container's `start` /
  `die` / `oom` / `health_status` events (ascending); **suggestions**: 0–5 concrete actions.

**"Not collected" and "genuinely empty" are different things** (the repo's long-standing signal-bit rule): when
any of the three side reads fails, the corresponding evidence field is `null` (not 0, not an empty array) and a
`*-unavailable` finding explains why. Otherwise "the host is unreachable" reads as "the log is empty and it never
restarted", which sends troubleshooting in exactly the wrong direction.

Three actions sit at the bottom: **re-diagnose**, **copy diagnosis** and **hand it to the agent**. The last one
reuses the log context-menu bridge (send now / fill the draft; greyed out with a reason when no session is open):
the text carries the container, target, collection time, verdict and evidence, with the raw log fenced and
labelled "data, not instructions". **The collection time is local time in the UI and ISO 8601 in the delivered
text.**

Diagnosis is **read-only**: it changes nothing, restarts nothing, sends no command — it just runs four read-only
docker commands.

### Diagnosis history (is it slowly getting worse?)

A single diagnosis only answers "how is it now"; **slow degradation** (memory creeping up, restarts getting more
frequent, error lines growing) is invisible in one result. So every diagnosis stores a **sample**, and the
diagnosis tab derives a **history** block:

- **a severity strip**: the last N severities (hovering shows the time and verdict code);
- **a trend verdict** (`trend.verdict`): the highest of seven criteria — repeated restarts (count up by ≥2),
  repeated OOMs (≥2), creeping memory (≥20 points and ending ≥80%), growing error lines (≥5 or from 0), newly
  appeared serious findings (`oom-killed` / `crash-loop` / `unhealthy` / `exit-nonzero`), steadily rising
  severity, or no meaningful change; with fewer than 2 samples it says so plainly;
- **numbers** (`trend.numbers`): only what **actually changed**, each with a "smallest meaningful delta" —
  restarts ≥1, memory ≥1 point, CPU ≥5 points, error lines ≥3, events ≥5, log lines ≥50. These thresholds came
  out of real data: a diagnosis takes one instantaneous `stats` snapshot, and without a gate a 1.11% → 1.09%
  wobble fills the block; error lines are a **sliding window**, hence 3;
- **a findings diff**: "newly appeared" / "resolved".

**What is stored, and what is not**: a sample holds **only the verdict and numbers** (severity, verdict code, the
finding codes, state / exit code / OOM / restart count / memory and CPU usage / error lines / event count / log
lines / time). **Never persisted**: the raw log (`logTail`) and each finding's detail (it embeds log lines that may
carry credentials) — so the file is safe to `cat`, but it also **cannot** replay a past incident.

Location: `<DSH home>/dsh-docker/diagnosis-history.jsonl` (directory `0700`, file `0600`), one record per line.
Caps: **50 per container**, **2000 per file**; past that the oldest are dropped and the file is rewritten
**atomically**. **30-second dedupe**: the same container within 30s with an identical severity + verdict + finding
set + restart count is **not appended**. `DSH_DOCKER_HISTORY_DIR` overrides the directory (**tests / troubleshooting
only**); an empty string means unset. Three edges: ① **renaming a container starts a new history** (the index key
is "target + container name"); ② **appends are not locked** (two concurrent diagnoses may lose one update);
③ **a write failure only degrades**: the diagnosis still returns, `recorded = false`, and one line lands on the
host's stdout.

### Disk usage and reclaimable space

**Disk** is the last segment of the toolbar (containers / images / Compose / networks / volumes / disk); the
agent-side twin is `docker_disk_usage`. Two commands feed it: `docker system df` (the four summary classes) and
`docker system df -v` (per-item detail).

- four summary cards: images / containers / local volumes / build cache, each with **item count, active count,
  size and reclaimable** (the class names stay as docker emits them; the UI translates);
- **total reclaimable**: the byte sum of the four (if any row cannot be parsed the whole line shows `—` — better
  to say nothing than to print a wrong number);
- **image breakdown** (by unique size, descending): repository:tag / size / unique / **container count** —
  `containers === 0` gets an "unused" badge, with a removal icon behind `allowMutations`;
- **volume breakdown** (by size, descending): name / driver / size / **link count** — `links === 0` likewise gets
  an "unused" badge.

Three deliberate trade-offs: **sort first, truncate second** (on a real host 258 of 259 volumes were 0B, so
truncating first would spend all 100 slots on empty volumes); **the detail cap is 100 rows per class**, announced
in the header (the tool side caps at 20 and the two `truncated` bits are OR-ed); **an older docker only degrades,
never errors** (`degraded: true` plus a plain-language reason, the summary cards stay usable and the detail tables
are **not rendered** — an empty table would read as "there is nothing").

The disk view **does not poll** (`system df -v` costs more than `docker images`) and has **no prune button**:
per-row removal behind a confirmation dialog is safer than "wipe a whole class", and that entry already exists
once each on the images and volumes pages.

### Equivalent `docker run` (reconstructing the launch)

A collapsible **equivalent docker run** block at the bottom of the overview; the agent-side twin is
`docker_run_command`. It rebuilds a reproducible command from the **raw rows** of `docker inspect` — it
deliberately does **not** widen `ContainerDetail`, because that would drag env vars into `docker_inspect`'s model
context. Covered: name, restart policy, port mappings (unbound ones become `--expose`), binds / named volumes /
tmpfs, a non-default network, env vars, user / workdir / hostname (omitted when they equal the default), memory
and CPU limits, cap-add / cap-drop / device, plus the image and command. It **fetches only when expanded**, one
argument per line, POSIX single-quote escaping, ready to copy.

Three deliberate trade-offs: **env values are kept as-is** (rewriting them would break equivalence), with keys
matching `/(PASS|PWD|SECRET|TOKEN|KEY|CRED|AUTH|PRIVATE)/i` reported in `secretKeys` — the UI shows a "may contain
credentials" warning **naming keys only**, and the command itself is not redacted (a redacted command cannot run);
**whatever was deliberately not restored is named** (`omitted`: `--privileged`, `--link`, a non-default log driver,
`--pid/--ipc/--uts`, `--sysctl`, `--add-host`, `--security-opt`, exotic mount types, anonymous volumes, an
overridden ENTRYPOINT, custom health checks — each with why and how to add it back, **nothing dropped silently**);
**a Compose-managed container is only an approximation** (network aliases / labels / depends_on are not in the
command, and the UI says so).

## Configuration (saved and applied hot)

While a capability is not granted, **clicking that switch in the settings card starts a grant in place**: the panel
shows a command to run "in a host terminal", and within ten seconds of running it the switch unlocks (no restart);
once granted it is an ordinary switch, and **turning it off** always works (the host never blocks downgrades).
"Configured but not granted" shows a "not in effect: no host grant" badge — that state is the one most easily
mistaken for a broken plugin, so it needs a name. **One row per capability**: each switch is followed by its own
grant state and **grant time** (`Granted · 2026-09-26 22:31:08`), with the revoke button right-aligned.

**Both capabilities can be confirmed with a single paste**: clicking the second switch does not replace the first
panel; the panels stack vertically and a **Copy all (N)** button appears at the top.

Why the time is shown: an out-of-band grant is **persistent** — after a host restart it takes effect with no
confirmation at all, so the host prints one
`[dsh-docker] elevation: load capability=… via=file grantedAt=…` line (no nonce, no path) at startup and the card
shows the same time. A launch-environment grant has **no** time; that row says "granted by the launch
environment; to revoke, remove it there and restart the host".

![Settings card: target CRUD, capability switches and parameters, saved and applied hot](https://cdn.jsdelivr.net/gh/hyzyn/dsh-plugin-kit@main/docs/dsh-plugin-kit-docker-setting.png)

Where the settings surface **lives** changes with the DSH version, but it is **always the same form** (same settings
namespace, same write path — identical data and behaviour) — the per-generation landing spots and the four
registration contracts live in [conventions.md § client settings surface](../../docs/conventions.md#客户端设置面内联优先).

Configuration lives in the settings namespace `docker`, i.e. the `docker:` section of `~/.dsh/settings.yaml`
(`$DSH_HOME/settings.yaml`). The composition config in the plugin line acts as the schema's `base`, which the
settings layer overrides; the HTTP `POST /api/dsh-docker/config` is the card's write channel and accepts only the
keys below (unknown keys return 400).

| Item | Default | Description |
| --- | --- | --- |
| `enabled` | true | disables the whole plugin (**takes effect on save**: tools are unregistered immediately, the announcement is withdrawn, and all data routes except `/config` return 403; `/config` stays readable and writable — the settings card is the way back in. Unlike tty, which needs a restart) |
| `announceToAgent` | true | whether to inject a capability announcement into the agent (systemPrompt section `plugin:dsh-docker`) |
| `dockerBin` | `docker` | the docker CLI executable name or path (`podman` works here); only letters, digits and `_ . / \ : -` plus interior spaces are allowed, and it may not start with `-` (**Windows drive letters and `\` must be allowed**). **"Connect local" probes with exactly this value**; when it is wrong the message names another container CLI found on `PATH`, but it does **not** rewrite this value for you |
| `allowMutations` | false | allows **mutating operations**: container start / stop / restart / remove, image removal / dangling pruning / pulling (the panel buttons and the `docker_action`, `docker_image_remove`, `docker_image_prune`, `docker_image_pull` tools; while off, `/action`, `/images/remove`, `/images/prune`, `/images/pull/stream` return 403 and the corresponding tools are not registered) |
| — (capability grant) | not granted | `allowMutations` / `allowExec` have **two out-of-band channels**: ① **launch environment variables** (`DSH_DOCKER_ALLOW_MUTATIONS` / `DSH_DOCKER_ALLOW_EXEC`, values `1` / `true` / `yes` / `on`) — resolved from the host's **launch snapshot**, inherited `process` layer only, so writing project `.env` or `~/.dsh/env.yml` does **not** count as a grant; ② **grant in place** (no restart): click the switch in the settings card and run the command it shows in a terminal on the host — effective within seconds. HTTP can always **turn them off** (an emergency brake cannot depend on a restart), but writing `true` without a grant is rejected with 400 and both paths explained. A `true` in the config file is **not** a grant (it lives in the same store as the value HTTP wrote, so the source cannot be told apart). **Upgrade impact**: switches opened through the UI before the upgrade become off — set the environment variables and restart, or confirm in the card. **Why**: the loopback fence and the same-origin proof cannot stop a cross-site page or an in-page script, and the docker socket equals root on the target host; details in [architecture.md § 7](../../docs/architecture.md#7-一条请求经过什么) |
| `allowExec` | false | allows a **one-shot** `docker exec` (the one-off command box on the container detail drawer's **Overview** tab, and the `docker_exec` tool; while off, `/exec` returns 403). **Does not** cover the card's Terminal button (`docker exec -it`), which tty hosts (see "Known limitations") |
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

An `env:NAME` inside `password` / `passphrase` is a **credential reference** (configuration holds only the
reference, a provider owns the value), resolved **only when connecting**: ① the **official credential layer**
(`ctx.credentials`) layers `file` (`$DSH_HOME/.credentials.yaml`) / `env` / `project-env` / `user-env` and
re-resolves per operation, so a changed credential reaches the next operation **without a host restart**; ② when
that service is unavailable or holds no such reference, `process.env[NAME]`. With neither, the error names
**both** sources and carries the credential service's own error too — otherwise a broken credential service would
masquerade as "you did not configure it". These two values are **never sent back to the browser**: the config
snapshot only provides `passwordSet` / `passphraseSet`.

### `hostKeys[]` (SSH host fingerprints, TOFU)

| Field | Description |
| --- | --- |
| `host` | hostname or IP (required) |
| `port` | port, default 22 (unique per host:port) |
| `fingerprints` | **fingerprint set** (required, at least one): the verbatim hex fingerprints received by the `hostHash: 'sha256'` callback. One host:port may hold several host keys (rsa / ed25519 …); matching any of them counts as a match |
| `fingerprint` | legacy single-fingerprint field (string): migration input only, merged into `fingerprints` on load; do not use it in new configs |

The first connection is recorded automatically and written to disk; every later connection must match, and **a
changed fingerprint rejects the connection outright**, with guidance to "delete this host's record and
reconnect". The record list can be deleted / reset in the settings card (deletion is submitted as the explicit
`hostKeysRemove: [{host, port}]`, so a union merge cannot silently undo it).

## Agent tools

| Tool | Registration | Parameters | Purpose / typical use |
| --- | --- | --- | --- |
| `docker_targets` | always registered | `probe?: boolean` | lists targets (name / kind / label), and **an SSH target also reports the tty connection-book entry it references as `book`** (targets with inline host/username have no such field; use it as the `book` for the terminal panel / `sftp_*` — when the names differ, this is the only way to know); `probe:true` probes the docker version and daemon reachability for each one (SSH targets open connections, so it is slower). Other tools take their `target` from here |
| `docker_connect_local` | always registered | — (no parameters) | **Connect local**: makes sure a `kind=local` target exists and selects it (an existing one is reused; SSH / custom targets stay untouched), then probes the daemon read-only: returns `{name, kind, created, saved, reachable, serverVersion?}`. With no targets the other tools are not registered at all (see the zero-target note below) — this is the one step that fixes that. **Requires no capability grant** and never installs Docker / starts a daemon / switches context / touches environment variables. When the daemon is unreachable the text names the cause (CLI missing / probe timed out / daemon not running / no socket permission) instead of an empty list |
| `docker_ps` | registered with ≥1 target | `target?` (**pass `*` = all targets**), `all?: boolean`, `name?` (container-name substring), `limit?` (1–500, default 100), `offset?` (default 0) | lists containers (name / state / health / image / ports / compose project and service / short ID); by default only running ones, `all:true` includes stopped. `name` is a **server-side filter** (`docker ps --filter name=`, substring match) applied before pagination, so page totals do not drift. With `target:'*'` it returns results grouped by target, and **one unreachable target does not affect the others** (that group carries `error`). Ports are merged across the IPv4/IPv6 dual-stack expansion (D130); an empty `ports` does **not** mean "nothing exposed" — host-network containers publish on the host itself, and that case carries a `net` field (D131). The first step of troubleshooting |
| `docker_attention` | registered with ≥1 target | `target?` (supports `*`), `limit?: number` | a **needs-attention summary**: unhealthy / repeatedly restarting / OOM-killed / non-zero exit / zombie; every item carries `reasons`, `exitCode`, `oomKilled`, `restartCount`. OOM and the real exit code come from one `docker inspect`. Call it first when you are unsure which machine or container to look at |
| `docker_diagnose` | registered with ≥1 target | `target?`, `id` (required), `logTail?` (1–500, default 80), `since?` (docker syntax, default `1h`), `history?` (0–50, default 10; 0 = no history) | **"why is this container failing"**: one pass over inspect + log tail + this container's events (server-side `--filter container`) + a `stats` snapshot, yielding `verdict` / `findings` (each with code, severity, title, detail) / `evidence` / `timeline` / `suggestions`. **Read-only**; "not collected" becomes `null` plus a `*-unavailable` finding — never 0. For more logs or keyword searches use `docker_logs_grep`. The result also carries `history` (the last N samples holding **only the verdict and numbers**, plus the `trend` verdict) — `trend.verdict.summary` answers "is it slowly getting worse" |
| `docker_inspect` | registered with ≥1 target | `target?`, `id` (required) | `docker inspect`'s authoritative details: state / health check / exit code / restart count / ports / mounts / networks / startup command |
| `docker_logs` | registered with ≥1 target | `target?`, `id`, `tail?` (1–5000, default `logTailDefault`), `timestamps?`, `since?`, `until?` | the tail from `docker logs --tail`; `since` / `until` use docker syntax to bound a time window; over the cap it is marked `truncated`, and the result explains how to narrow it (smaller `tail`, a `since`/`until` window, or `docker_logs_grep`) |
| `docker_logs_grep` | registered with ≥1 target | `target?`, `id`, `pattern` (required, ≤512 chars), `regexp?`, `ignoreCase?`, `since?`, `until?`, `context?` (0–20, default 2), `limit?` (1–500, default 200), `tail?` (omitted = scan all history), `timestamps?` (on by default) | **server-side log search**: line-by-line filtering in the host (never touches the remote shell), returning hit lines plus context and honestly reporting `matched` / `scanned` / `limited` / `truncated` — "only scanned this far" is distinguishable from "scanned everything"; the scan window is **aligned to line boundaries**; returned lines have their own cap (at most 4000, `MAX_RESULT_LINES`), over which the result carries `truncatedForSize` and `notes` while `matched` still reports the full count. Division of labour with `docker_logs`: error in the recent tail → `docker_logs` (cheaper); buried deep / a specific time window / keywords, error codes, request IDs → this tool. Literal substring by default (grep -F semantics, zero ReDoS); JS regex only with `regexp: true` |
| `docker_stats` | registered with ≥1 target | `target?`, `ids?` (comma-separated container names/IDs) | a `docker stats --no-stream` snapshot: CPU% / memory usage and share / network IO / block IO / PIDs; omitting `ids` means all running containers. Live following is a panel capability (SSE), and the tool keeps single-value snapshot semantics |
| `docker_images` | registered with ≥1 target | `target?`, `limit?` (1–500, default 100), `offset?` (default 0) | image list (repository:tag / size / created / short ID) |
| `docker_top` | registered with ≥1 target | `target?`, `id` (required) | a process snapshot inside the container (`docker top <id> -eo pid,ppid,user,stat,etime,pcpu,pmem,cmd`): PID / PPID / user / STAT / elapsed / CPU / memory / command, every field as docker prints it. "The container is running" and "the process is still there" are two different facts |
| `docker_events` | registered with ≥1 target | `target?`, `since?` (docker `--since` syntax, default `10m`) | a container-event snapshot (likewise through the server-side allowlist): the nine kinds start / die / stop / kill / oom / health_status / destroy / rename / update. For continuous observation have the user watch the "Activity" strip |
| `docker_networks` | registered with ≥1 target | `target?`, `limit?` (1–500, default 100), `offset?` (default 0) | network list (name / driver / scope / internal flag / short ID). The connected-container list stays out of the list rows — inspecting row by row would be N docker calls |
| `docker_volumes` | registered with ≥1 target | `target?`, `limit?` (1–500, default 100), `offset?` (default 0) | volume list (name / driver / scope / mountpoint) |
| `docker_disk_usage` | registered with ≥1 target | `target?` | disk usage and **"who uses it"**: the four `docker system df` summary classes plus `-v` detail (an image's `containers`, a volume's `links`, 20 rows each). Check whether `containers` is 0 before deleting; a detail failure only degrades (`degraded`) |
| `docker_run_command` | registered with ≥1 target | `target?`, `id` (required) | **derives, never executes**: rebuilds an equivalent `docker run` command from `docker inspect` plus `warnings` / `secretKeys` (key names only, values unredacted) / `omitted` (what was deliberately not restored, each with a reason) |
| `docker_image_inspect` | registered with ≥1 target | `target?`, `ref` (required) | `docker image inspect` + `docker history`: size / size including parents / created / platform / layer count and list / entrypoint and command / exposed ports / digest / build history |
| `docker_action` | `allowMutations` + ≥1 target | `target?`, `action` (`start` \| `stop` \| `restart` \| `remove`), `id` | container lifecycle operations. `remove` is destructive: it deletes the container config and writable layer (data volumes are not included), and the target container must be confirmed with the user before running |
| `docker_image_remove` | `allowMutations` + ≥1 target | `target?`, `ref` (required) | removes an image (`docker image rm`, without `-f`). **Destructive**: it fails when the image is referenced; confirm the target image and restate the consequences before running |
| `docker_image_prune` | `allowMutations` + ≥1 target | `target?` | prunes dangling (untagged) images (`docker image prune -f`). Deliberately without `--all` |
| `docker_image_pull` | `allowMutations` + ≥1 target | `target?`, `ref` (required), `timeoutSec?` (10–1800, default 600) | `docker pull` in snapshot form (**may take several minutes**); for per-layer progress have the user watch the SSE progress stream in the images page |
| `docker_exec` | `allowExec` + ≥1 target | `target?`, `id`, `command` / `argv` (**exactly one**: `command` runs through `sh -c` inside the container; `argv` is an exact argument array that neither the host nor the container expands), `timeoutSec?` (1–120, default `execTimeoutSec`) | a one-shot `docker exec` returning the exit code / stdout / stderr. Use `command` for simple commands; use `argv` when spaces, quotes or empty arguments must survive exactly (e.g. `["printf","%s","a b"]`), and write `["sh","-c","…"]` explicitly when you need pipes or variables. There is no TTY, so for interactive troubleshooting have the user run `docker exec -it <container> sh` in the tty panel |

- When `target` is omitted it falls back to **the only** configured target; with several targets it is required,
  and the error lists the available names.
- **With no targets only `docker_targets` / `docker_connect_local` are registered**: the other tools have nothing
  to address, so registering them would only make the model guess once. As soon as a target is configured they
  are registered **immediately**, with no restart.
- **The four list tools support pagination**: `docker_ps` / `docker_images` / `docker_networks` / `docker_volumes`
  accept `limit` (1–500, default 100) and `offset` (default 0), and their results carry `total` / `truncated`.
  Pagination only fixes "the result is too long to read through" — it does not change the 512KB ceiling of a
  single docker command.
- Changing either switch **re-registers the tools immediately**: after turning off `allowMutations` / `allowExec`
  the corresponding tools (including the three image mutation tools) disappear, with no restart.
- **Registered calls are also subject to the session permission tier gate**: `read` tools (every row marked
  "registered with ≥1 target") are allowed on every tier; `docker_action` / `docker_image_remove` /
  `docker_image_prune` / `docker_image_pull` are `write` and `docker_exec` is `exec`, and these two classes trigger
  an **approval prompt on every call** under a confined tier (deterministically denied when unattended), never
  under full access, and no extra prompt under Auto review. When the host has not composed the
  `sandboxPolicy` / `approval` services the gate is off, and the startup log says
  `tier-gate: services absent (…), per-call gate disabled`. This is a **separate layer** from the two static
  switches: they govern registration (host-level, persistent grant), the tier gate governs each registered call.
  Mechanism: [docs/permission-tier-plan.md](../../docs/permission-tier-plan.md).
- Recommended troubleshooting order: `docker_targets` → `docker_ps` → **`docker_diagnose`** (verdict, criteria and
  evidence in one call — most "why did it die" questions have a direction right here) → `docker_logs` (then
  `docker_logs_grep` with `pattern` / `since` / `until` when the tail does not explain it) → `docker_inspect`
  (raw fields) → `docker_stats` / `docker_top` (alive but wrong: check resources first, then the process); for
  image problems `docker_images` → `docker_image_inspect`; before reclaiming disk, `docker_disk_usage`.
- With `announceToAgent` on, the plugin injects a compact announcement: the plugin/panel location, the
  "read-only by default" and "docker socket ≈ root" boundaries, the "`allowExec` only governs the one-shot exec
  channel" split (the Terminal button is not gated by it), the `*` scope of `target`, and the cross-tool
  troubleshooting order. It does **not** restate each tool's usage.

## HTTP routes (under the `/api/dsh-docker` prefix, all behind the loopback fence)

The fence validates `remoteAddress` (the whole 127/8 range + `::1` + `::ffff:` mappings), `Host` (literal
loopback, `localhost`, or a hostname / `/etc/hosts` alias that **resolves to this machine** — resolution has a
500ms timeout and a 60s cache), `Origin` and `sec-fetch-site`; any non-local request gets 403
`forbidden: loopback-only`. The request body is capped at 1MB, and responses are uniformly `application/json` +
`referrer-policy: no-referrer`.

**Not available behind a reverse proxy or from another machine**: non-local requests get 403
`forbidden: loopback-only`. That is deliberate — these routes carry the mutating and execution
surface (docker stop / remove / exec), which is not opened to remote sessions (see [ROADMAP.md](../../ROADMAP.md)
item 5 § 5.4). To use this panel from another machine, use an **SSH tunnel**:
`ssh -L 3080:127.0.0.1:3080 <host>` and open `http://localhost:3080` — the host sees a loopback
source and a `localhost` Host, so the fence admits it, and the session cookie is minted for that
authority.


**On top of loopback there is a second gate, the "same-origin proof"**: the four SSE streams (`/logs/stream`,
`/stats/stream`, `/events/stream`, `/images/pull/stream`) and every write sub-route (`/action`,
`/images/remove|prune`, `/networks/remove|prune`, `/volumes/remove|prune`, `/exec`, `/elevate` (including
`/elevate/status` and `/elevate/revoke`), `/connect-local`) require
either `Origin: <same origin>` or `Sec-Fetch-Site: same-origin`, otherwise 403 `缺少同源证明`. This blocks
cross-site side effects such as a malicious page using `<img src=.../images/pull/stream>` to trigger a real pull;
curl, old Safari and some WebViews do not send those headers and will hit it (normal browser use is unaffected).
Read-only routes do not require the proof.

**Exception: the Desktop app passes the gate with the Host cookie (D139).** DeepSeek Harness Desktop forwards
page requests to `dsh-app://app/api/…` after **deleting `Origin` and `Sec-Fetch-Site`** and rewriting only
`Cookie` (`forwardWebRequest`), so "both proofs absent" is the *normal* shape there. Such a forward is recognised
by its **Host session cookie** (without it the whole forward returns 503): **no `Origin`, no `Sec-Fetch-Site`, but
a `Cookie` → allowed**; both absent *and* no cookie (bare curl / old Safari) → still 403. A browser page cannot
forge the `Cookie` header, and a cross-site request always carries `sec-fetch-site: cross-site` (rejected by the
loopback fence first), so the rejection branch was not relaxed; symptoms and diagnosis are in
[docs/troubleshooting.md](../../docs/troubleshooting.md).

| Route | Method | Request body | Response |
| --- | --- | --- | --- |
| `/config` | GET | — | `{ok:true, config}`: the config snapshot (targets expose only `passwordSet` / `passphraseSet`, plus the read-only `ttyBooks` / `ttyAvailable` / `toolsRegistered` / `streamProtocol` — the last one is the SSE frame protocol version the client uses to decide what counts as "ready") |
| `/config` | POST | any subset of the config keys above | `{ok:true, config}`; an unknown key is 400 and invalid JSON is 400 |
| `/targets` | GET / POST | — | `{ok:true, targets:[{name, kind, label?\|error?}]}` |
| `/connect-local` | POST | `{}` (the body is ignored) | **Connect local**: reuses or creates a `kind=local` target and returns `{ok:true, result:{name, kind, created, saved, reachable, serverVersion?, message}, config}`; 503 when the host has no settings service and 500 when the save fails (both carry a reason and change no in-memory config). Requires the same-origin proof (it is a write path) but **not** `allowMutations` / `allowExec` |
| `/probe` | POST | `{target?}` | `{ok:true, probe:{ok, bin, serverVersion, error, target}}` |
| `/containers` | POST | `{target?, all?}` | `{ok:true, containers: ContainerSummary[]}`; with `target:'*'` it returns `{ok:true, groups:[{target,label,ok,error?,data?}]}` |
| `/attention` | POST | `{target?, limit?}` | for a single target `{ok:true, items, total, truncated, degraded}` (`limit` applies **after** filtering + severity sorting; default 100, max 500); with `target:'*'` grouped by target |
| `/inspect` | POST | `{target?, id}` | `{ok:true, details: ContainerDetail[]}` |
| `/stats` | POST | `{target?, ids?: string[]}` | `{ok:true, stats: ContainerStats[]}` |
| `/logs` | POST | `{target?, id, tail?, timestamps?, since?}` | `{ok:true, logs:{id, text, truncated}}` |
| `/top` | POST | `{target?, id}` (required) | `{ok:true, top:{id, name, rows:[{pid, ppid, user, stat, elapsed, cpu, mem, command}], truncated}}` — every field exactly as `docker top` prints it; a stopped or missing container goes through the existing error channel |
| `/diagnose` | POST | `{target?, id}` (required), `logTail?` (1–500, default 80), `since?` (default `1h`), `history?` (0–50, default 10) | `{ok:true, diagnosis:{verdict, findings, evidence, timeline, logTail, suggestions, history:{samples, trend, recorded}}}`. `history` is the last N samples **after** this run's recording plus the trend (`recorded` says whether this call actually appended). Four reads; a failed side read only degrades (the field is `null` plus a `*-unavailable` finding); an invalid `since` is rejected with 400 |
| `/logs/stream` | GET | query: `target?`, `id` (single container, or use `ids` instead) or `ids` (comma-separated multiple containers, **one connection carries all**, at most 32), `tail?` (**0**–5000; `0` = follow only, used on reconnect), `timestamps?` (`1`/`true`), `since?` | `200 text/event-stream`, event protocol below; bad parameters / unknown target / non-loopback return ordinary JSON errors |
| `/stats/stream` | GET | query: `target?`, `ids?` (comma-separated; omitted = all running) | `200 text/event-stream`: one `stats` frame per second (same shape as the /stats snapshot); it does not end naturally |
| `/events/stream` | GET | query: `target?` | `200 text/event-stream`: one container event per `event` frame (already through the server-side allowlist); it does not end naturally |
| `/images` | POST | `{target?}` | `{ok:true, images: ImageSummary[]}` |
| `/images/inspect` | POST | `{target?, ref}` (required) | `{ok:true, image:{ref, detail: ImageDetail, history: ImageHistoryEntry[], historyError}}`; history prefers `--format '{{json .}}'` and falls back to a plain-text table |
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
| `/system-df` | POST | `{target?}` | `{ok:true, disk:{summary, images, volumes, buildCache, truncated, degraded, degradedReason}}`: `summary` is the four classes and each detail list caps at 100 rows (**sorted before truncation**); an older docker degrades instead of erroring |
| `/run-command` | POST | `{target?, id}` (required) | `{ok:true, recreate:{id, name, command, warnings, secretKeys, omitted}}` — **derives only, never executes** |
| `/action` | POST | `{target?, action, id}` | requires `allowMutations` (otherwise 403); `{ok:true, result:{id, action, message}}` |
| `/exec` | POST | `{target?, id, command, timeoutSec?}` | requires `allowExec` (otherwise 403); `{ok:true, result:{id, command, code, stdout, stderr, truncated, durationMs}}` |

Any other sub-path is 404 (`unknown route: ...`); a GET on anything other than `/config`, `/targets` and the
four `*/stream` routes above returns 405; an execution failure returns 500 or 400 plus an `{error}` text.

### SSE event protocol (`/logs/stream`, `/stats/stream`, `/events/stream`, `/images/pull/stream`)

The four long streams share one piece of infrastructure (`openSseStream`): uniform header writing +
`flushHeaders()`, a 15s `: ping` heartbeat, active-stream registration (a uniform `end` + abort when the plugin
is disabled / hot-updated / uninstalled), a silent abort on client disconnect, and a **`ready` frame sent as soon
as the pipeline is actually up**. Each frame is one `event:` line + one JSON `data:` line (single-line JSON:
newlines / quotes escaped, multi-byte characters never split by an SSE line boundary), followed by an empty line:

| Event | data | Description |
| --- | --- | --- |
| `ready` | `{}` | sent once **the executor is really running** (local child `spawn` / remote channel opened = `StreamHandlers.onStart`): only then does the client consider the stream "receiving data". **Arrival of the response headers (`onopen`) does not count** — those are written immediately by `flushHeaders()`, while connecting can take tens of seconds. If it never starts there is **no** `ready` at all |
| `line` | `{"d":"..."}` / `{"e":"..."}`; with multiple sources `{"id":"<container id>","d"\|"e":"..."}` | stdout / stderr chunks (not guaranteed to split on line boundaries, so the client reassembles lines). Used by the log stream and the pull stream. **In `ids=` mode every frame carries `id`**, and the client routes the chunk back to that container |
| `source-end` | `{"id":"<container id>","code":N\|null}` | **multiple sources only**: that container's `docker logs -f` exited naturally. The connection **stays open** — `end` only comes once every source has finished |
| `source-error` | `{"id":"<container id>","message":"..."}` | **multiple sources only**: that one sub-stream failed. The connection also stays open; the client marks it "partially failed" |
| `stats` | `ContainerStats` | stats stream only: one frame per container per second, matching the `/stats` snapshot. The server extracts **flat `{...}` objects** (`docker stats` goes through the TTY renderer even when stdout is a pipe, so frames are mixed with `ESC[H/ESC[K/ESC[J`, and parsing by line would drop whole lines) and collapses repeated renders |
| `event` | `{action, name, image, composeProject?, time?, exitCode?}` | event stream only: one container event per frame (event lines outside the allowlist are dropped server-side) |
| `end` | `{"reason":"container-exit"\|"stats-exit"\|"events-exit"\|"pull-exit","code":N, ...}` | the executor exited naturally. The log stream attaches a container exit code (with multiple sources, the **last non-null code in `ids` order**; each container's real code is in its own `source-end`), the stats stream has reason=`stats-exit`, the event stream `events-exit`, and the pull stream attaches `ref` |
| `error` | `{"message":"..."}` | a parameter / execution failure, after which the stream closes; a break at the connection layer does not send this event |

**Multiple containers over one connection (`ids=`, D168)**: merged logs pack N containers into **one** SSE — the
host starts one `docker logs -f` per container and tags frames with `id`. That way the merged view holds exactly
**one** browser per-origin connection no matter how many containers are selected (the old implementation opened
one `EventSource` per container, which together with the Activity strip's event stream could fill the 4-live-stream
budget measured in D165). The single-source `id=` shape is **byte-for-byte unchanged**. `/config`'s
`streamProtocol` is therefore bumped to **3**, and the client uses it to decide between the single connection and
falling back to "one stream per container". The four streams differ only in "executor + end reason":

| Stream | Executor | Natural end condition | Close semantics |
| --- | --- | --- | --- |
| `/logs/stream` | `docker logs --follow` (one per container in `ids=` mode) | the container stops (`container-exit`; in multi-source mode: every source has finished) | the frontend turns FOLLOW off / switches pages / closes the panel |
| `/stats/stream` | `docker stats` (**without** `--no-stream`) | all the containers being measured exit (`stats-exit`) | **the frontend aborts it** (this stream does not stop by itself) |
| `/events/stream` | `docker events` (`--filter type=container`) | the daemon-side stream ends (`events-exit`) | switching pages / switching targets / closing the panel |
| `/images/pull/stream` | `docker pull` | the pull completes / fails (`pull-exit`) | the frontend leaves the pull view |

- Response headers: `content-type: text/event-stream; charset=utf-8`, `cache-control: no-cache`,
  `connection: keep-alive`, with `flushHeaders()` immediately after writing them (the host's gzip explicitly
  skips `text/event-stream`).
- Heartbeat: one `: ping` comment frame every 15s.
- **Backpressure and overflow (D153)**: when the client cannot keep up, frames go into an in-memory queue
  (≤ 8MB per stream). The log and pull streams drop the oldest whole frames and keep the newest on overflow,
  pushing a `skip{frames,bytes}` notice (`skip` itself is never dropped) — the stream stays alive; when more
  frames are dropped while a queued `skip` has not been written yet, its counters are updated **in place**
  (D156). The stats and events streams send `end{reason:output-limit}` and reconnect instead. A `write()`
  returning false only means "past the high-water mark": a frame is **never written twice**.
- **Chunk coalescing (D151)**: the log and pull streams merge upstream chunks over a 50ms window before pushing
  them (strict ordering within a channel, stdout before stderr, an immediate flush once 256KB has accumulated), so
  a `line` frame's `d` / `e` may carry **several lines**. The `end` frame always comes after the last batch.
- Teardown: the client disconnects → the executor is aborted immediately (locally `SIGTERM`, then `SIGKILL` if it
  has not exited in 2s; over SSH that exec channel is closed and the pooled connection is kept for reuse), writing
  no frame at all; the plugin is disabled / hot-updated / uninstalled → the server wraps up (abort + `end`).
- A long SSH stream occupies a connection in the pool (a busy count) and idle reclamation (120s) does not kill it
  by mistake.
- **What counts as "ready" (client side)**: the green dot / "following live" only trusts the host's `ready`
  frame. Each stream also has a harder piece of evidence as a fallback: the first real event for the events
  stream, the first line for the log stream, the first sample for the stats stream, the first progress frame for
  the pull stream. **Development skew** is handled by version negotiation: `streamProtocol < 2` means that host
  never sends `ready`, so the client falls back to the old criterion and reopens that stream exactly once.

## Security model

**The docker socket ≈ root on the target host.** Anyone who can reach the daemon can mount host directories, start
containers in privileged mode and read the secrets inside containers — which is why this plugin is designed
read-only first:

1. **Read-only by default**. With `allowMutations` off, `/action`, `/images/remove`, `/images/prune`,
   `/images/pull/stream` all return 403, the panel's start / stop / remove / image removal / pruning / pulling are
   unavailable, and the `docker_action`, `docker_image_remove`, `docker_image_prune`, `docker_image_pull` tools
   are **not registered at all**; with `allowExec` off, `/exec` returns 403 and the `docker_exec` tool is likewise
   not registered. The two switches are independent and must be turned on explicitly in the settings card.
   Read-type routes (`/logs/stream`, `/stats/stream`, `/events/stream`, `/images/inspect`) are unaffected by
   either switch. **`allowExec` only governs this plugin's *one-shot* exec channel** (the `/exec` route, the
   `docker_exec` tool, the one-off command box on the container detail drawer's Overview tab) — the card's
   **Terminal button runs an interactive `docker exec -it` shell hosted by tty; it passes through neither switch**
   and is available even in read-only mode (it is not a missing gate but a deliberately kept entry path; see
   "Known limitations").
2. **Destructive operations restate their consequences**. `remove` maps to `docker rm` (**without `-f`**), and the
   agent announcement requires confirming the target container with the user before running; a running container
   errors with a hint that it must be stopped first, never a silent force-delete.
3. **Credentials do not land in plaintext (recommended)**. `password` / `passphrase` support `env:NAME` credential
   references; the value lives in the **official credential store** (`$DSH_HOME/.credentials.yaml`), so no
   plaintext reaches `settings.yaml`. `agent` auth (`SSH_AUTH_SOCK`) is not written to disk at all.
4. **Host fingerprint TOFU pinning**. The first connection records the sha256 fingerprint; every later one must
   match, and a change rejects the connection. TOFU's inherent limits are that "if the first connection already
   met an MITM, what got recorded is a fake fingerprint", and that only one record is kept per host:port.
5. **Commands are always built as argv, never by string concatenation**. Container names / IDs first pass the
   `assertRef` allowlist (`[A-Za-z0-9][A-Za-z0-9_.-]*`, ≤128 characters, rejecting spaces, `;`, `$()`, backticks
   and so on); remotely each argument is single-quote escaped by `shJoin`, while locally `spawn(bin, args)` goes
   through no shell.
6. **Output is capped**. `maxOutputKb` limits the stdout/stderr bytes of a single command; anything beyond is
   truncated and marked, so large logs cannot blow up memory or the agent's context.
7. **HTTP is exposed to this machine only**. All routes go through the loopback fence.
8. **The live log stream is a read-only capability**. `GET /logs/stream` matches `/logs`: it is not gated by
   `allowMutations` / `allowExec` (it does not change container state), but it admits loopback only, passes `id`
   through the `assertRef` allowlist and clamps parameters the same way. A long stream has no `maxOutputKb` cap;
   memory protection is shouldered by the client's 5000-line ring buffer.
9. **Mutating operations get a per-use audit trail**. Kit elevation's lines answer "what was authorized"; this
   answers "what it was used for": every mutation / exec that **passes the capability gate** lands one structured
   `[dsh-docker] capability-use: …` line (outlet: the host's stdout), covering both the panel routes and the agent
   tools. The line format, what is *not* logged (403 / tier-gate asks) and the cost are under "Known limitations".

## Known limitations

- **No interactive TTY**: `exec` is a one-shot command (`docker exec <id> sh -c <cmd>`, without `-i` / `-t`), so it
  cannot run vim / top / an interactive shell, nor feed stdin. For interactive troubleshooting run
  `docker exec -it <container> sh` in the tty panel.
- **`allowExec` is not the gate that keeps you out of the container**: the card's Terminal button
  (`docker exec -it '<container>' sh`) is hosted through tty's `ttyTerminal` and **does not check
  `allowExec`** — it stays available in read-only mode, exactly as the panel's own hint says when exec is
  off ("turn on *Allow exec*, or copy the exec command from the card into the terminal panel to enter the
  container interactively"). This is deliberate: dropping into a container to look at the scene is the most
  common read-only inspection path, and the gate governs **this plugin's own** one-shot channel (`/exec` and
  `docker_exec`: they change local state and can be called in bulk by agent tools), while the interactive
  shell belongs to tty (user-driven; tty is the PTY's owner). **The cost, stated plainly**: once tty is
  installed, `allowExec` was never a boundary against **in-page scripts** (a third-party plugin's client half
  / XSS) anyway — via `ttyTerminal.open` or a WS `spawn` frame they can run arbitrary commands, which is
  strictly stronger than this plugin's one-shot exec. See
  [architecture.md § 7](../../docs/architecture.md#7-一条请求经过什么) for that layer's threat-model boundary.
- **The event stream has a window while disconnected**: `docker events` is a stream of "from now on", so events
  that happen while the browser is reconnecting have already been pushed and are not resent. The client
  compensates with "a full list refresh right after a successful reconnect" (aligning state, not replaying the
  events); for an exact, complete event history use the `docker_events` tool (a snapshot with `--since`).
- **The browser's per-origin budget is a hard constraint, and the Docker panel holds at most 1 resident stream
  (D165 measurement + D168)**: the host speaks **HTTP/1.1** (no h2 multiplexing), and **every `EventSource` owns
  one connection and never releases it voluntarily**. Once that budget is exhausted, **every** ordinary request
  from the same page (list refreshes, `/api/*`, session loading…) queues behind it — users see the **whole DSH
  page freeze**, not just the Docker panel. The panel's resident streams are **1 in every view**: list = the
  event stream; details = log / stats FOLLOW (one tab live at a time); merged / Compose logs = **one** `ids=`
  stream; pull = one progress stream (entering details / merged views closes the event stream, returning
  reconnects it plus one full refresh). Going over does not mean "a bit slower", it means every request on that
  page fails together; full data is in [DEFECTS.md](./DEFECTS.md) under D165. (WebSockets do **not** draw on
  this budget; the retention the streaming log / stats keep is in "Usage".)
- **Multiple tabs and the merge cap**: those connections are shared by the whole page (the official
  `dsh-client-hmr` and other plugins' SSE included); the real fix is WebSocket / h2 on the host side, or one
  multiplexed connection shared by all plugins. The merge cap of 3 is now a "readability + SSH 8-channel" bound
  rather than a browser-budget one (D168): more than three merged logs are hard to read, and each selected
  container still runs its own `docker logs -f` on the host, i.e. one channel on SSH targets. `PICK_MAX = 3` is
  that value.
- **The SSH channel budget is shared per target (`MaxSessions`)**: a target keeps only **one** TCP connection, and
  every long stream and short command shares that connection's channels — while OpenSSH's `MaxSessions` defaults
  to just 10. Long streams hold a channel until the user closes the panel, and merged logs still run **one channel
  per selected container**; the next "refresh list" can then be rejected with
  `(SSH) Channel open failure: open failed`. The plugin caps each SSH target at **8 concurrent long streams**
  (the `MAX_STREAMS_PER_TARGET` constant, i.e. 10 − 2, leaving two for short commands) and the merge selection at 3; folding the right-sidebar tab drops
  the streams and hands the channels back. Two remedies attach to this (`D150`): ① short commands **queue per
  target** (at most 2 concurrent per connection, `DSH_DOCKER_SHORT_CHANNELS` overrides, testing only); ② a full
  budget **self-heals** — on a `no more sessions` style refusal the plugin drops and `end()`s the connection and
  retries once on a fresh one, leaving the `通道额度已满：已重建连接重试` line in the host log (that connection
  **does not recover by itself**). (`D164`) ③ **aborting a long stream settles it on the spot** — on an
  `AbortSignal` the plugin sends `KILL` and closes the channel, then **ends the stream itself** instead of waiting
  for the far end (previously a far end that never confirmed left that stream's `busy` count **permanently raised**,
  and after 8 such leaks every long stream on that target was refused with no self-healing path). **The real fix
  is on the sshd side**: raise that host's `MaxSessions` — for example
  `/etc/ssh/sshd_config.d/10-dsh-maxsessions.conf` with a `MaxSessions 50` line, then `sshd -t && systemctl
  reload ssh` (reload only affects new connections). The current cap is a compile-time constant — file an issue if
  it needs to follow.
- **Docker CLI version differences**: parsing goes through `--format '{{json .}}'`, and the parser always degrades
  instead of throwing (for example, a missing `State` has the state derived from `Status`); with fields missing
  the corresponding columns may be empty, so use `docker inspect` when you need authoritative data.
- **`rm` without `-f`**: container `remove` maps to `docker rm` and image `remove` to `docker image rm`, neither
  with `-f` — a running container or a referenced image fails with a hint; to force deletion, do it by hand in
  the tty panel.
- **SSH targets need sudo-free docker**: if the account is not in the docker group the permission error is passed
  through verbatim, with no automatic sudo escalation. **Docker not installed on the remote** makes `probe` fail
  (exit code 127); when PATH differs, fill `dockerBin` with an absolute path.
- **`dockerBin` is validated before it is persisted**: an illegal value returns 400 with a reason and is never
  written to `settings.yaml`. **A `dockerBin` pointing at `.cmd` / `.bat` cannot start the local channel**: local
  execution goes through a bare `spawn`, and Node refuses to execute `.cmd` directly on Windows (`EINVAL`) — with
  a hand-written wrapper, use an `.exe` instead, or wait for the local channel to move to kit's `spawnPortable`.
- **The Compose project view only knows `com.docker.compose.project`**: a service deployed with
  `docker stack deploy` carries `com.docker.stack.namespace` / `com.docker.swarm.service.name` instead, so its
  containers show up as ungrouped. Supporting it needs a separate stack-grouping notion.
- **`volume prune` reclaims different things per version, and can delete data**: on Docker 29 `docker volume
  prune -f` **only reclaims anonymous unused volumes** (named ones stay); docker ≥ 23 has `-a/--all`, while
  docker < 23 has no such switch and a plain prune deletes unused **named** volumes too. This plugin never passes
  `--all`, the confirmation copy spells out the version difference, and named volumes go through
  `/volumes/remove`.
- **Podman compatibility through `dockerBin`**: filling in `podman` runs, but the fields and output formats of
  `stats` and `--format '{{json .}}'` differ from docker's, so only the parser's degradation paths are relied on;
  this has not been verified item by item.
- **No image builds / Compose orchestration changes**: images support pulling / removal / dangling pruning, but
  there is no `docker build`, `docker save` / `load` or `docker push`; Compose is a **read-only** project view.
  **Network / volume mutations exist only as panel buttons, with no agent tools** — deliberately without widening
  the mutation surface on the agent side.
- **Diagnosis is a set of criteria, not an expert**: these criteria cover the objective evidence a container
  reports about itself and **know nothing about the business**. Whether an error can be ignored is a human (or
  model) decision on the other side of "hand it to the agent". The cost: one diagnosis runs **four** read-only
  commands, which on an SSH target means up to four channels (the short-command gate caps concurrency at 2, so
  two batches).
- **Event collection gets its own budget (8MB, keeping the tail)**: the `exec_create` / `exec_start` /
  `exec_die` triple dominates one hour of a single container's events, so the generic 512KB budget would leave the
  timeline **permanently empty**. Diagnosis therefore widens event collection to 8MB and keeps the tail — on a
  container with very many events the timeline covers only the **most recent** span.
- **The equivalent `docker run` is an approximation, not a backup**: a Compose-managed container loses network
  aliases / labels / depends_on; `--privileged` / `--link` / an overridden ENTRYPOINT / custom health checks /
  anonymous volumes are **deliberately not restored** and listed in `omitted`. **It cannot replace
  `docker commit` / volume backups**.
- **The disk view has two independent truncations**: 100 rows per class on the host side (`truncated`) and 20 rows
  on the tool side; on a host with thousands of volumes the `system df -v` output itself can hit the 8MB budget
  (then `degraded: true` and the summary stays usable). The "total reclaimable" parses human-readable sizes into
  bytes and sums — **if a row cannot be parsed the whole line shows `—`**.
- **The Overview only summarises "the container picture" and is entirely read-only**: counter cards and the
  attention table only, with **no cross-target operations** and no log / stats / event merging. In addition,
  "attention" covers only `unhealthy` and `restarting`: `ContainerSummary` has no `exitCode`, so a "crashed exit"
  cannot be told from a "manually stopped" one — look at dead containers under "stopped" in the counter card.
- **The connection-bar button needs a matching target to have data**: the button always shows on an SSH tab, but
  with no corresponding `kind=ssh` target (neither the book name nor `host:port` matches) clicking it only shows a
  "not configured as a Docker target" hint; the connection bar on local tabs is hidden. Target additions and
  removals are picked up within 30 seconds (saving the settings card refreshes immediately).
- **`enabled: false` takes effect on save**: tools are unregistered immediately, the announcement is withdrawn, and
  data routes other than `/config` return 403 (long streams in progress are wrapped up too). The route objects are
  not unloaded; `/config` stays readable and writable, and the settings card is the way back in with no restart.
- **The usage audit goes to the host's stdout, and exec commands appear in it**: every mutation / exec that
  **passes the capability gate** (the panel routes and the agent tools `docker_action` / `docker_image_remove` /
  `docker_image_prune` / `docker_image_pull` / `docker_exec`; 403s and validation 400s are not logged — "a use =
  something that passed the gate") lands one `[dsh-docker] capability-use: capability=allowMutations|allowExec
  source=http|tool action=… target=… ref=… ok=true|false durationMs=…` line in the same key=value style as kit
  elevation's authorization lines; the pull stream logs a start / end pair. **The outlet is `console.log`**
  (`D162`: `ctx.logger` lines were measured to reach neither stdout nor any file on 0.2.x hosts) — the terminal
  running `dsh web` shows them and grep works. **The cost**: the exec command goes into the trailing `detail`
  field (with the exit code), truncated to 200 characters with control characters escaped — a line meant for
  humans has to accept appearing in the terminal-visible log stream. A docker error also counts as a use
  (`ok=false`); tier-gate asks / denies are not logged. There is no query UI and no separate audit file.
- **The boundaries of cross-target aggregation**: concurrency cap 4; a **90s per-target budget (fallback)**, while
  each command's own timeout (30s) is the one actually honoured — when a budget fires, the underlying child
  process / SSH channel is **really cancelled**, otherwise the timed-out command keeps holding a remote session
  slot (D161). A single target failing or timing out affects only its own cell. With many targets the Overview's
  request volume grows linearly and auto refresh multiplies it.

## How it works

```
Browser half (client.js)
  ├─ sidebar "Containers" entry → panel (target picker / container list / card actions / five-tab details /
  │   cross-target Overview / Compose · images · networks · volumes · disk pages) + terminal drawer
  │   (ttyTerminal.mount)
  ├─ four SSE streams (/logs/stream incl. ids=, /stats/stream, /events/stream, /images/pull/stream)
  │   + ordinary fetch → /api/dsh-docker/* (loopback fence; write routes also need the same-origin proof)
  └─ optionally consumes tty's ttyConnbar / ttyPanel / ttyTerminal (each degrades without tty)

Host half (src/index.ts)
  ├─ settings namespace docker → normalizeConfig (clamping / allowlisted keys)
  ├─ read-only reuse of tty settings' sshHosts (connection book) and hostKeys (fingerprint seed)
  ├─ resolveTarget → one DockerApi per target (src/docker.ts) + RemoteExec (src/ssh-exec.ts):
  │   argv construction + assertRef + output cap; lazy pool / non-PTY exec channel / shJoin / TOFU
  ├─ openSseStream: one substrate for all four streams (ready / heartbeat / registry / backpressure / teardown)
  └─ routes + agent tools (read tools always registered, write / exec tools by switch) — see the two tables above
```

## Development and acceptance

```bash
pnpm --filter @hyzyn/dsh-docker build       # tsc → lib/ (host half) + esbuild → client.js (browser half)
pnpm --filter @hyzyn/dsh-docker typecheck
pnpm --filter @hyzyn/dsh-docker smoke       # three offline regression suites, none needing a docker daemon
pnpm test                                    # repo-level vitest (this package's suites under test/ are included)
```

> **Which half changed, and how it takes effect**: `client-src/*` (browser half) → esbuild emits `client.js`, the
> host polls for client HMR, so it goes live **hot** on a page refresh; `src/*.ts` (host half) → tsc emits `lib/`,
> which **needs a new process** (a running `dsh web` loaded `lib/` into memory at startup), so rebuild and restart.
> Forgetting the restart shows up as **a new client and an old host**: a newly added host-side message simply never
> appears.

The verification surface has three layers: **three offline smoke suites** (no docker daemon needed), **this
package's vitest suites**, and the **manual acceptance checklist against a real daemon**. Per-item coverage, the
browser-side performance budget and the manual steps live in
[docs/verification.md](./docs/verification.md) — README only keeps "how to run".

## Version / license

`@hyzyn/dsh-docker` (see `package.json` for the version) · [Apache License 2.0](../../LICENSE)
