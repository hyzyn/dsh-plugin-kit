# @hyzyn/dsh-tty

[中文](README.md) | English

> The DSH sidebar “Terminal” panel: a complete terminal built on xterm.js + a **real PTY**, treating local and SSH alike, with sessions kept alive across disconnects for long-running work.

## Features

- **Real PTY + WebGL rendering**: node-pty real PTY, so TUIs such as vim / htop / a dev server all run; multi-tab.
- **Optional tmux session persistence**: reopen after a host restart / network blip and the scene is back; “command tabs” such as docker exec reopen automatically.
- **Native ssh2 connections**: agent forwarding + host-key TOFU pinning, managed uniformly through the connection book; plus **SFTP** upload/download and **port forwarding** (-L / -R, reconnecting automatically after a drop).
- **The agent reads the terminal at “command” granularity**: shell integration (OSC 133/7) lets `tty_capture{last}` / `tty_expect` read the output and exit code of “the previous command” instead of capturing the screen and guessing.
- **Two client services exposed to other plugins**: `ttyConnbar` (connection-bar actions) and `ttyTerminal` (open a terminal in place); dsh-docker’s “Containers / Terminal” buttons go through them.

![Terminal panel: a multi-tab xterm modal, the toolbar has search/clear/copy/paste, and the title bar has the minimize “—” and close ✕](https://cdn.jsdelivr.net/gh/hyzyn/dsh-plugin-kit@main/docs/dsh-plugin-kit-tty.png)

## Installation

```bash
dsh plugin --profile web add @hyzyn/dsh-tty    # npm install (after release)
dsh plugin --profile web add link:$(pwd)/packages/tty   # repo development/debugging
```

After installing, restart `dsh web`; a “Terminal” entry appears in the sidebar — click it to open the panel; the Settings → Plugins → “Terminal Panel” card lets you change the configuration (**saving takes effect immediately**, no restart needed).

## How to use

- Opening the panel automatically creates the first terminal (default `$SHELL`, usually zsh on macOS);
- **Multi-tab**: “+” in the tab bar creates a new terminal (since 0.2.0 “+” is a menu: local terminal /
  SSH connection book (entries have ✎ to edit) / SSH connection…, see the next section for SSH), and ✕ closes
  a tab; **double-clicking a tab renames it** (the name is persisted with the tab and survives a reconnect);
  each tab is an independent session (local PTY or SSH channel);
- **The working directory follows the current DSH session**: new tabs open in the current session’s
  working directory (the host `cwd` configuration is the fallback). Since 0.1.6 the session list
  snapshot no longer carries `current` (view selection moved to the workspace domain), so the client
  reads `retainedBy.mainView > 0` to find the current session — trusting only the legacy field leaves
  the cwd empty and new tabs fall back to the host’s start directory;
- Supports TUIs such as vim / htop / less (TERM is injected as `xterm-256color`);
- Panel size changes are resized automatically (xterm fit → native PTY resize);
- **Ctrl+F searches inside the terminal** (Enter next / Shift+Enter previous / Esc closes only the search
  box), links in the output are clickable, and the toolbar offers clear / copy selection / paste;
- **Reconnect on disconnect (0.3.0)**: after an abnormal disconnect such as a page refresh or a network
  blip, the session is kept alive on the host for `reconnectGraceSec` (120 seconds by default) and the
  client reconnects automatically with exponential backoff (capped at 5s); after reconnecting it
  **attaches back to the original session by sid and replays the output buffered during the disconnect**;
  after a page refresh the tab list is restored from sessionStorage (sessions already finished on the host are dropped);
- **WebGL renderer (0.3.0)**: high-throughput output (build logs) renders dramatically faster; on WebGL
  context loss (e.g. too many tabs exceeding the browser quota) it automatically falls back to the DOM renderer;
- **Minimize (state folded into the sidebar entry)**: clicking outside the modal, pressing Esc or the
  title-bar “—” collapses the panel — PTY sessions and output buffers stay alive, the sidebar “Terminal”
  entry shows a “running / total” badge and a status dot (pulsing when there is output), and clicking the
  entry restores it; only the floating bar’s ✕ / the title-bar ✕ really closes it and ends every session;
- The title-bar ✕ closes the panel and ends every session (PTY tree-level cleanup; tmux persistent tabs also
  get kill-session); after a session exits, clicking the terminal area reopens it;
- The concurrency limit defaults to 4 (`maxSessions` configuration, 1~16).

![Terminal panel settings card: shell / TERM / concurrency limit and so on take effect on save](https://cdn.jsdelivr.net/gh/hyzyn/dsh-plugin-kit@main/docs/dsh-plugin-kit-tty-setting.png)

## Windows hosts (0.18.1, best-effort)

**Before 0.18.1 a Windows host could not open a single local terminal**, for two reasons on the same path:

1. `$SHELL` **does not exist on Windows**, and the default shell fell back to `/bin/zsh` unconditionally →
   `spawn` fails with ENOENT (measured: `spawn /bin/zsh -> ENOENT`, while `%COMSPEC%` works);
2. the spawn plan was POSIX-shaped (`-c 'export TERM=…; export COLORTERM=…; exec "$shell"'`) — cmd.exe does
   not understand `-c` (it ignores the whole line, runs an empty session and exits, so the tab appears and
   vanishes), and PowerShell understands `-c` but rejects `export` as an unknown cmdlet.

Both were reproduced on **Windows 11 ARM (24H2) + Node 22 ARM64**. The fix:

- **Default shell is `%COMSPEC%`** (guaranteed to exist); for PowerShell put the full path to
  `powershell.exe` / `pwsh.exe` in the settings card’s “Shell path”. On Windows the candidate list offers
  `%COMSPEC%` + Windows PowerShell 5.1 + PowerShell 7 (when installed), with the default first;
- **No wrapper layer on Windows**: plain `[shell]`; the PowerShell family gets `-NoLogo` (drops the copyright
  banner) but deliberately **not `-NoProfile`** — the user’s profile is where aliases and functions come from.
  TERM / COLORTERM are meaningless for ConPTY and are no longer injected;
- **“Run one command” tabs** (docker exec, command tabs opened by the agent) use `cmd /c` or
  `PowerShell -Command`;
- **Three things are not supported** (the host turns them off and the settings card explains why):
  - **Shell integration (OSC 133/7)**: injection relies on POSIX rc stubs plus the `-c` wrapper, neither of
    which exists for cmd / PowerShell, so it is permanently off — **local** tabs therefore lose cwd tracking
    (`tty_list.cwd` following `cd`), `tty_capture{last}` and command-granular `tty_expect` (remote Linux /
    macOS hosts are unaffected);
  - **tmux persistence**: there is no tmux on Windows, so local tabs open normally but are not managed
    (SSH into a Linux host still works);
  - **Server status bar**: locally only CPU / memory / uptime are available (`node:os`); disk / TCP / network
    throughput / temperature show “无” (remote **Windows** hosts go through the PowerShell hop — see the
    status-bar section);
- **How far this was verified**: on Windows 11 ARM a full install (`dsh plugin add @hyzyn/dsh-all`), all nine
  plugins mounting, `dsh web` serving, and the browser half being delivered (the same artifact macOS serves;
  size and new-code markers compared after a build rather than pinning a byte count, which changes on every
  rebuild), plus `[dsh-tty] mounted (shell=C:\WINDOWS\system32\cmd.exe)`.
  x64 Windows is covered by the CI matrix (build / typecheck / test, see Development).
- **End-to-end coverage (0.19.0)**: `scripts/windows-smoke.mjs` drives a real `cmd.exe` through
  spawn → input echo → kill → respawn on the CI windows-latest runner. It caught and now pins a
  Windows-only failure class: force-killing a local PTY crashed the host — node-pty rejects signals
  on Windows, and its `_deferNoArgs` re-throws that error from a socket callback, where the caller’s
  try/catch cannot see it.

## Agent tools (P1)

The plugin injects thirteen tools into the agent (with the same power as the bash tool; operations show up live in the user’s terminal):

| Tool | Purpose |
| --- | --- |
| `tty_list` | List active terminal sessions (sid / kind (`local\|ssh`) / target / pid / **cwd tracked live as you `cd`** / activity time; tmux persistent sessions carry a `persist` marker) |
| `tty_capture` | Read recent output (last N lines, ANSI stripped by default, `raw:true` for the raw stream); **`last:true` returns only the output + exit code of the previous completed command** (shell integration markers, see the next section); when a command is **in flight** (just sent, completion marker not in yet) it returns `inProgress:true` without the stale result, so the previous command is never mistaken for this one (0.19.0) |
| `tty_screen` | Read the **currently visible screen** as rendered (xterm-headless virtual screen, plain text) — it can genuinely read TUI interfaces such as vim / htop / menus |
| `tty_expect` | Wait with a regex for a readiness signal in **subsequent output** (dev server URL, build finished, …); a timeout does not throw (`matched:false` + tail output), and a command that ends early also returns early with its exit code; at most 5 in-flight calls per session, and the accumulated window keeps only the last 64KB (0.19.0) |
| `tty_send` | Send keys/text to a given session (such as `q` to a dev server, or a menu selection) |
| `sftp_list` | List a remote SSH directory (name/type/size/mtime, directories first); `book` is the connection-book entry name and `path` defaults to the login home; at most 500 entries by default (`truncated:true` beyond that), and `isSymlink` distinguishes a symlink from a real directory (0.19.0) |
| `sftp_read` | Read a remote **text** file (≤256KB by default, adjustable to 1MB, truncated beyond that); `offset` pages from a given byte (handy for log tails), an invalid `maxBytes` errors out instead of silently falling back, and binary detection is a double test (NUL + illegal-UTF-8 ratio) (0.19.0) |
| `sftp_write` | Write a remote text file (overwrite by default, `append:true` appends; ≤1MB per call) |
| `sftp_mkdir` | Create a remote directory; `parents:true` fills in missing parents level by level (equivalent to `mkdir -p`, created bottom-up, existing directories skipped idempotently) |
| `sftp_rename` | Rename/move a remote file or directory (a `to` in a different directory means a move; never overwrites an existing target) |
| `sftp_remove` | Delete a remote file/directory; a directory uses rmdir by default (a non-empty one errors explicitly), and `recursive:true` deletes the whole tree (irrecoverable); paths pointing at `/`, `~`, or containing `.`/`..` segments are refused (guard for an irrecoverable operation, 0.19.0) |
| `sftp_tree` | Recursively list a remote directory structure (depth-first, directories first; `maxDepth` 1~8 / `maxEntries` 1~2000 cap it, `truncated:true` when exceeded; symlinks are not followed, to avoid cycles) |
| `tunnel_list` | List port-forwarding tunnels and their live state (active/connecting/error/stopped, rules, connection counts) |

Typical agent flow (recommended): `tty_send` starts a long-running task → `tty_expect` waits for the
readiness marker → `tty_capture{last:true}` gets the result of that single command. In addition, a dynamic
context is registered in `systemPrompt` so that every turn automatically carries a snapshot of active
terminals (sid / kind / cwd) — you have context without calling `tty_list` first.

### Shell integration (OSC 133/7, 0.4.0)

At spawn time hooks are injected through the existing `-c` wrapper layer according to the shell type (transparent to the user, no rc changes):

- **zsh**: `ZDOTDIR` points at a temporary stub directory (the same approach VS Code uses); the stub sources
  the user’s original rc first and then appends `precmd`/`preexec` hooks;
- **bash**: an `--rcfile` stub (sources `~/.bashrc` first); the command-start marker has two variants by
  version: bash ≥ 4.4 uses `PS0`; bash < 4.4 (the 3.2 shipped with macOS) has no PS0 and falls back to a
  **DEBUG trap** (the handler filters by `$BASH_COMMAND` to drop fires caused by the PROMPT_COMMAND
  machinery itself, so phantom markers do not cut the user’s output out of the capture window; on bash 3.2
  `trap - DEBUG` inside the handler does not take effect, hence the “permanently armed + filtered” design).
  Side effect: internal commands of compound commands such as loops emit extra B markers, which only affects
  where `tty_capture{last}` starts capturing for those commands — D/exit-code and `tty_expect` are
  unaffected; the PROMPT_COMMAND hook supports both the string and the array (bash 5.1+) forms;
- Marker semantics: `133;A` prompt start / `133;B` command start / `133;D;<exit>` command end with exit
  code / `OSC 7 file://…` cwd reporting (`tty_list.cwd` follows `cd`, and SSH sessions report the remote path);
- Other shells are silently disabled; `shellIntegration: false` turns the whole thing off (escape hatch).

SSH sessions are scheduled on the same table: entries with `kind: 'ssh'` in `tty_list` are identified by
`target` (user@host[:port]), and `tty_capture` / `tty_expect` / `tty_send` are used exactly as for local
sessions — dev server logs and key interactions on the remote machine remain available as usual.

### Credential storage (a connection password need not stay plaintext)

Under **Password** in the connection dialog sits a **credential storage** row: tick "store when saving" and the
password is written to the **official credential store**, leaving only an `env:NAME` reference in the field (the value
lives in `~/.dsh/.credentials.yaml`, never materialized into the environment and never sent back to the browser).
**That checkbox is ticked by default** (whenever the host provides `remote.credentials`): type a plaintext password,
save, and the value goes to the store while the settings keep only a reference — better than writing the password
plaintext into the settings file, which *is* shipped to the browser while the store's values never are. When the host
lacks that service the box is switched back off and disabled, with a note that only plaintext saving is available.

- **It rides along with saving — no extra click**: the tick is executed by "save changes" / "connect (and save)", so
  there is no dangling reference from "stored but not saved". **Without "save to the connection book" it never touches
  the store** — there would be no configuration to reference the value, only an orphan. **The settings card's inline
  editor is the same row with the same default**, except that its commit entry point is "apply" (that card's
  row-level commit, followed by the card's "save"), so the checkbox reads "store into credential storage on apply";
  the same caveat applies there: the value lands in the store first, and abandoning "save" afterwards leaves a name
  that is not referenced yet (visible and clearable in the reference picker).
- **Two side effects of the default (so neither is a surprise)**: (1) editing an older connection whose password is
  **plaintext** and hitting "save changes" for an unrelated field also moves the password into the store (the settings
  keep a reference instead) — untick the box if you do not want that; (2) when the store refuses the write (typically a
  read-only source shadowing the reference) **saving is aborted** and the official verbatim error is shown, rather than
  quietly falling back to plaintext (the derived name carries a `DSH_TTY_` prefix plus a hash, so shadowing is
  practically impossible).
- **Deliberately compact**: in plaintext mode the row is a single checkbox; only once the field holds a reference does
  it swap in "clear stored credential" and the status (`already stored (source file) · reference name`). The full
  security boundary lives in the checkbox's tooltip instead of taking up dialog space.

- **Model**: configuration holds a **reference**, the store owns the value — the same family as SecureCRT's
  "credential set referenced by title" and iTerm2's "pick a named entry from the password manager". The
  implementation goes through DSH's official `ctx.remote.credentials` (`describe` / `set` / `unset`, where
  **values cross in one direction only — no read path exists**), exactly as the official settings cards do.
- **Name** (the rule is fixed): `DSH_TTY_<username>_<host>[_<port>]_<field>`, where the port is **omitted when
  empty or 22 (the default)** — matching the connecting side's `spec.port ?? 22` (empty means 22), so
  “empty / `22` / `" 22 "`” all collapse into one key and the same account never ends up with two names or one
  password stored twice; a non-default port does take part (the same host on another port is often a different
  box behind NAT). `field` is `PASSWORD` / `PASSPHRASE`; e.g. `hsadmin@192.0.2.10:22` →
  `DSH_TTY_HSADMIN_192_168_80_248_PASSWORD`. It is **derived from the resource identity and carries no hash** — the
  same school as git-credential-store's `protocol://username@host` and docker credential helpers'
  `ServerURL` + `Username`: host and username **are ASCII identifiers already**, so nothing needs sanitizing and
  nothing needs a hash to disambiguate. The old hash-based version was patching over "sanitize a human label into a
  key": the reference grammar accepts ASCII only, so `HS 248` / `lab-a` / `HS_248` collapse to exactly the same
  string and only a hash could stop them silently overwriting each other. A resource identity has no such trap — a
  collision can only happen for **the same host, the same user, the same port**, which is the same password by
  definition (sharing it is correct behaviour). **The connection name never takes part in the key**, so renaming a
  connection or rewriting its label never changes the key. An empty host or username is refused (they are the key's
  entire source; drop either and the derivation degenerates into a constant). The trade-off is readability: this
  dialog's "store" **names it by the rule above and offers no custom name** ✗ — to reuse a custom name, type
  `env:name` into the field directly (the name must already resolve in the credential layer, e.g. managed by the
  official settings or env card).
- **Derivation happens only at store time**: afterwards the `env:NAME` in the configuration is the single source of
  truth and nothing re-derives it — so renaming a connection does **not** invalidate a stored value and no longer
  leaves an orphan (only the old hash-based rule did: with the name in the key, storing again after a rename left the
  previous name behind; clear it with "clear stored credential", which acts on the reference in the field).
- **Shared**: references live in one flat namespace, so any consumer resolving the same way can use it — put
  the same name in a dsh-docker target's `password` and one secret serves both.
- **Visibility**: the dialog's reference picker lists **the names the store already holds** — the host-side
  `/api/dsh-tty/credential-refs` reads back only the `refs:` keys (names only; values never leave the host).
  Why read it ourselves: the reference half is **not enumerable** over the protocol (rationale in the picker
  section), yet “which names have I stored” is exactly the question this picker answers. It also makes
  **orphan references** (old names left behind by a naming-rule change) visible, selectable and
  clearable again.
- **Resolution path (what makes a stored value actually usable when connecting)**: connecting, the probe, SFTP
  and port tunnels all funnel through one `buildConnectConfig`, whose `env:NAME` is resolved by the **official
  credential provider** (`resolve`, re-resolved per operation — a change lands on the next operation, no host
  restart). Only when the provider has no such reference, or the host has no such service, does it fall back to
  `process.env`. **Why the provider is mandatory here**: values in the credential store are **never materialized
  into the environment** (the provider README's own words: “a store the harness owns and never materializes into
  the environment”), so reading `process.env` alone means “a stored password is unreadable at connect time”. A
  provider error is never swallowed — when the environment lacks it too, the error names both sources (otherwise
  “the credential service is broken” masquerades as “you did not configure it”).
- **The conservative boundary (know this)**: `~/.credentials.yaml` is a **0600 plain file with no master
  password and no OS keychain** — it keeps out **other OS users**, not processes running as you, and not the
  agent; and it is **machine-local**, so a new machine means storing again. The industry consensus still
  stands: **prefer keys / agent over stored passwords** (this plugin supports both).
- **Degradation**: without `remote.credentials` (older host) the buttons disable with a reason and plaintext
  saving still works.

## Port forwarding (0.5.0)

Maintain tunnels in the “Port forwarding” block of the Settings → Plugins → Terminal Panel card; each tunnel
references one connection-book entry (host and authentication come with it), in two directions:

- **Local forwarding (-L)**: listen on local `127.0.0.1:localPort` → connect through SSH on the server side
  to `remoteHost:remotePort` — maps a remote database/internal service to the local machine (the most
  frequent use: `localPort=5432 → db.internal:5432`);
- **Remote forwarding (-R)**: the server listens on `remoteHost:remotePort` (default
  127.0.0.1) → inbound connections are dialed back to local `localTargetHost:localTargetPort` — exposes a
  local dev server to a remote network/intranet;
- **The host owns the lifecycle**: tunnels and terminal tabs are independent of each other (each has its own
  SSH connection), and tunnels keep running with the panel closed; SSH disconnects reconnect automatically
  with exponential backoff (1s→15s cap), and the remote direction re-runs forwardIn after a reconnect; after
  the connection-book password changes, a reconnect uses the new credentials automatically;
- **Status badges**: while the card is expanded it polls live status every 2s (active green/connecting
  blue/error red/stopped grey + last error); connection-book entries in the “+” menu show a `⇄N` tunnel
  badge; the agent can query status with the `tunnel_list` tool;
- TOFU shares the same `hostKeys` pinning as terminal sessions; ports do not consume `maxSessions` slots.

## SFTP file transfer (0.7.0, enhanced in 0.8.0/0.9.0)

Remote file operations go straight over the SSH connection without touching the terminal or using a session
slot (`ssh2`’s sftp subsystem, host half in `src/sftp.ts`):

![SFTP single pane (docked in a drawer below the terminal since 0.16.0): browsing a remote directory, with inline download/rename/delete](https://cdn.jsdelivr.net/gh/hyzyn/dsh-plugin-kit@main/docs/dsh-plugin-kit-tty-sftp-dialog.png)

![SFTP dual pane (0.9.0; docked in a drawer below the terminal since 0.16.0): local on the left / remote on the right, with inline ⇨/⇦ server-side direct transfer](https://cdn.jsdelivr.net/gh/hyzyn/dsh-plugin-kit@main/docs/dsh-plugin-kit-tty-sftp-dual.png)

- **Placement (0.16.0)**: when the terminal panel is open and **this tab’s** mount slot is free, the File Browser
  **docks below the terminal** — the path bar / list / transfer progress take the full width (a file list is
  a wide table, so full width below beats a narrow column on the right, and the terminal also keeps its width
  without wrapping; a dual pane side by side needs that width even more), and the terminal stays visible and
  usable. The height is draggable and can collapse into a single title bar (collapsing neither closes the
  panel nor interrupts browsing); when another panel (such as the containers panel) already holds the slot on
  the same tab, or the panel is not open, it falls back to the original centered dialog, **without pushing
  anyone else’s panel out**. The title / collapse / ✕ come from tty’s mount slot;
- **Follows the tab (0.19.0)**: the File Browser talks to the host of the tab that opened it, so it belongs to
  that tab: switching away hides it (in-flight transfers keep running and the scene is restored when you come
  back), and closing the tab tears it down. **Every entry follows the same rule** — the connection bar’s
  “SFTP”, the 📂 on a connection-book entry and “File Browser” in the SSH dialog / settings card all become
  owned by whatever tab was active when they were opened; only “panel open with no tabs at all” counts as
  owned by no tab (always visible). Before this, the pane stayed put across a tab switch — title reading host
  A while the active tab was B, worst case uploading to the wrong host;
- **Entries**: ① connection-book entries in the tab bar “+” menu carry a 📂 (open the File Browser for that
  entry); ② fill in host/authentication in the SSH connection dialog and click “File Browser” (you can
  browse without saving to the connection book); ③ the “SFTP” button in an SSH tab’s connection bar (owned by
  that tab, see the previous bullet);
- **Operations**: directory browsing (Enter in the path box to jump, `.. (parent directory)`, a single click
  on a file downloads it), **upload** (multi-select files, XHR streaming + percentage progress; since 0.8.0
  **drag & drop** is supported — files and folders can be dropped straight into the dialog, folders are
  expanded recursively through `webkitGetAsEntry` and uploaded one by one, and directories are filled in
  level by level with mkdir parents), **download** (POST → browser Blob
  → `<a download>`), **new directory**, **rename** (inline editor), **delete**
  (🗑 with a second click to confirm, directories deleted with `recursive`);
- **Transfer progress bar (0.11.0)**: a thin progress bar + percentage was added on the right of the bottom
  status line — uploads use XHR streaming progress (multi-file shows an `i/n · filename` label); downloads
  now stream `response.body` and compute the percentage live from the response `content-length` (with no
  length it degrades to a transferred-bytes text);
- **Cancelling a transfer (0.12.0)**: the ✕ on the right of the progress bar — **upload** aborts the
  in-flight XHR (remaining files in the batch are skipped too); **download** uses `AbortController` to break
  off the streaming read; **dual-pane ⇨/⇦ direct transfer** became a server-side job (start returns a jobId
  → 400ms polling of real byte progress → ✕ sends cancel to abort), no longer an unbreakable synchronous
  HTTP request. After a cancel the **half-written file is deleted automatically** (the leftover remote file
  of an upload / the leftover local file of a download; a failed cleanup is only logged), the status line
  reads “cancelled” instead of a red failure state; closing the File Browser dialog also collects in-flight
  transfers, leaving no background copying that is “invisible but still writing to the remote”;
- **Connection management**: a lazy connection pool — the SSH connection is created on the first operation,
  recycled after 120 seconds idle, and reconnected automatically on the next operation after a drop;
  connection-book entries are resolved live on every (re)connect (a changed password takes effect
  automatically); TOFU shares the same `hostKeys` pinning with terminal sessions/tunnels, and a changed
  fingerprint is rejected the same way; SFTP does not count against `maxSessions`;
- **Transfer channel**: `POST /api/dsh-tty/sftp/list|mkdir|rename|remove|download|
  upload` (all loopback-fenced). The connection spec travels in the JSON body (connection-book name or
  inline fields, with the same semantics as WS ssh frames: “entry as the base + inline per-field overrides”)
  or, for upload, in the `x-dsh-sftp-meta` header (base64url) — **credentials never enter the URL/query
  string**; uploads and downloads are streamed pipes, and a whole file never enters memory;
- **Agent tools**: `sftp_list` / `sftp_read` / `sftp_write` / `sftp_mkdir` /
  `sftp_rename` / `sftp_remove` / `sftp_tree` (see the table above) — they accept only a
  `book` connection-book entry name and **take no inline credentials** (agent context never carries plaintext secrets);
- **Dual-pane style (0.9.0, optional, `sftpStyle` configuration)**: local left / remote right — browsing and
  file operations on the local side go through the new `/api/dsh-tty/local-fs` route (list/mkdir/rename/
  remove, loopback-fenced); the inline `⇨ / ⇦` copies an entry to the current directory of the opposite pane
  (`/api/dsh-tty/local-fs/transfer` streams the two paths server-side, recursing into directories and
  overwriting same-named files, **with bytes never passing through the browser**); the single-pane style is
  unchanged; switch it in the settings card and reopen SFTP for it to take effect.

## Session persistence (tmux, 0.10.0)

The default safety model is unchanged: sessions live and die with the host (kernel-level PTY cleanup). For
work that must “outlive the host” (dev servers, builds, training jobs), turn on a **persistent terminal** —
session state is delegated to a tmux server (dedicated socket `dsh-tty`, fully isolated from the user’s own
tmux), so it survives the keep-alive timeout and can even be reattached after a host restart:

- **Entry (simplified in 0.10.1)**: choosing `tmux` for “Session persistence” in the settings card is the
  only switch — once it is on, **every newly opened tab is persistent by default**: “Local terminal” in the
  “+” menu, clicking a connection-book entry, and the SSH connection dialog (“persistent session” is checked
  by default and can be unchecked for a single connection). There is no longer a separate “persistent
  terminal” menu item;
- **Per-entry opt-out (`sshHosts[].persist`)**: the “persistent session” checkbox on a connection-book entry
  stores an **opt-out** — entries explicitly unchecked (`persist: false`) are no longer tmux-backed when
  clicked, everything else (`true` or never written, e.g. entries imported from `~/.ssh/config`) follows the
  global switch. Both the settings card and the connection dialog show that checkbox only while the global
  switch is on, and **editing an entry in the settings card no longer drops it** (before 0.17.x, renaming a
  single field silently reset it to `false`);
- **Mechanism**: spawn/ssh frames carry `persist` plus a stable `persistName` generated by the client and
  saved with the tab spec — locally the `-c` wrapper layer becomes `exec tmux -L dsh-tty -f
  <conf> new-session -A -s dsh-<name>` (cwd is inherited from the node-pty spawn); over SSH the remote runs
  `exec tmux -L dsh-tty -f /dev/null new-session -A -s dsh-<name>` to open the pty channel. `-A` is
  attach-or-create: after a host restart, reopening a tab reattaches to the same tmux session by name,
  restoring running programs and pane state exactly;
- **Recovery chain**: after the browser reconnects it queries `sessions` — persistent tabs whose sid is gone
  are respawned automatically by the client with the original persistName (non-persistent tabs keep the drop
  semantics); when the keep-alive reaper times out it kills only the PTY (the tmux client) and **not the tmux
  session**, so it can still be reattached afterwards; a reconnect (attach) within the same host does **not
  replay the host buffer** for a tmux session — replaying would first write the visible screen into a
  brand-new xterm (ghost scrollbar) and then the tmux full-screen redraw would paint it again (double image)
  — instead it forces exactly one `tmux refresh-client` redraw;
  persistent tab specs are also written to **localStorage** (sessionStorage is visible only to the same
  browser tab, so a new window that dsh opens automatically after a restart could not read it and recovery
  broke exactly there) — when a brand-new window opens the panel it respawns straight from the spec: if the
  tmux session is alive it reattaches to the original scene, and if it is gone (remote reinstall/lost) it
  starts a new shell; specs are only dropped when “the tab is actively closed/exited”, with no up-front
  liveness check (once the retained state such a check relies on drifts, recovery would fail silently);
- **Close semantics**: for a tmux-backed session the kill frame (tab ✕ / closing the panel) runs
  `tmux kill-session` before killing the client — a real end, not a detach that leaves a live session
  behind; closing the whole page **retains** by default (recoverable after the keep-alive window), while
  `endOnPageClose: true` also ends the tmux session when the keep-alive window expires;
- **Shell integration compatibility**: tmux swallows escape sequences it does not recognize — the hooks
  detect `$TMUX` and wrap OSC 133/7 in a DCS passthrough envelope (ESC inside the payload is doubled), and
  with tmux ≥3.3 + `allow-passthrough on` (written into the stub conf by the host automatically) it is
  unwrapped and forwarded, so the host parser still sees bare markers: `tty_expect` / OSC 7 cwd tracking keep
  working inside persistent tabs; `tty_capture{last}` has one further correction — tmux pane redraws are
  asynchronous and batched, so command output can land after the D marker and escape the capture window, so
  the hook runs `capture-pane` before emitting D and sends the pane content inline as `OSC 133;T` (base64,
  last 200 lines), and the host prefers the T snapshot as the command output (output beyond 200 lines is
  truncated at the head, consistent with the ring-buffer semantics);
- **Runtime assets**: a stable stub directory under `<DSH_HOME|~/.dsh>/tty/` (the tmux server outlives the
  host process, so a temporary directory will not do): `tmux.conf` (status off to keep redraws from
  polluting captures, true-color overrides, `default-command` pointing at the inner launcher) and `inner.sh`
  (execs the inner shell from the current configuration, with the zsh ZDOTDIR / bash --rcfile stubs injected
  as usual); configuration changes apply hot to newly opened panes, while `tmux.conf` itself is read only
  when the tmux server first starts;
- **Degradation**: with no tmux installed locally/remotely, a persistent spawn falls back to a normal session
  automatically and the terminal prints a grey one-line hint; everything works fine without installing
  anything, just without persistence.

## SSH connections

Since 0.2.0 the tab bar “+” is a one-click menu that, besides local terminals, also opens **SSH tabs**: the
host half connects natively with `ssh2` and opens a shell channel (no local ssh process and no node-pty),
wrapped into a session object identical to a local PTY — input, resize, close, output buffer, backpressure
and the agent tools all reuse the same scheduling.

- **Three entries in the “+” menu**: local terminal / **SSH connection book** (entries saved in the
  configuration, shown as `user@host[:port] · auth`, **entries carry 📂 File Browser and ✎ edit**) / SSH connection…
  (a form for host / port / username / auth with an option to save before connecting, and a “File Browser” at
  the bottom of the dialog to open SFTP with the current information, skipping the terminal);
- **Connection book**: ticking “save to connection book” in the SSH connection dialog stores an entry (the
  same name overwrites; an empty name uses the hostname); the ✎ on a “+” menu entry and the **edit** in the
  settings card use the **same form** — three grouped sections (connection / authentication / options) plus
  credential storage, the credential-reference picker, “test connection” and “File Browser”, renaming
  supported and duplicate names rejected. The only difference is **how it is submitted**: the menu dialog
  (“save changes” / “connect (and save)”) writes through immediately, while the settings card commits into the
  card's form with “apply” and persists with the card's “save”;
- **Authentication (auth), one of three**:
  - `agent` (default) — uses ssh-agent (`SSH_AUTH_SOCK`), credentials never touch disk, most recommended;
  - `key` — `keyPath` private key file (a leading `~` may omit home), `passphrase` optional;
  - `password` — password authentication, with keyboard-interactive attached as well (many servers only offer that);
- **Passwords / passphrases support `env:VAR`**: when `password` / `passphrase` is `env:MY_SECRET`, the value
  is resolved through the **credential layer** — the official credential provider first (layering
  `$DSH_HOME/.credentials.yaml`, the process environment, `project-env` and `user-env`, re-resolved on every
  connection), falling back to the host process environment only when the provider has no such reference
  (pair it with the dsh-env-manager plugin to hold secrets, keeping plaintext out of the settings file). A
  failed resolution names both the reference and the fact that neither source had it;
- **Port**: 22 by default; a non-22 port shows in the target as `user@host:port`;
- **Tabs and status**: an SSH tab title uses the connection name or `user@host` (local tabs are
  “Terminal N”); while connecting it first echoes a grey `Connecting user@host …`, and once ready the status
  bar shows `SSH user@host connected`; a failed connection (connection timeout / authentication rejected /
  host unreachable) comes back in an `error` frame with the reason, and since the tab spec was saved with the
  tab, clicking the terminal area reopens it from the original spec; the status bar describes the **currently
  active tab** — switching or closing a tab immediately swaps in that tab’s own state (the failure reason and
  the exit code are kept on the tab itself), so the red text no longer stays on screen after you close the tab
  that could not connect (host-level messages such as “connection lost — reconnecting” belong to no tab and
  are not wiped by a tab switch); conversely, **a background tab’s own failure is only recorded on that tab**
  (its tab-bar status dot turns red and the terminal overlay carries the full text) and never takes over the
  active tab’s status;
- **Agent forwarding (0.4.0)**: with “agent forwarding” ticked in the SSH dialog, the remote side can use the
  local ssh-agent’s keys (such as `git clone` of a private repository remotely). It can be enabled with any
  authentication method (credentials still never touch disk); if no ssh-agent is running locally the
  connection fails with an explicit error instead of silently doing nothing. Connection-book entries save
  `agentForward` and show `· fwd` in the list;
- **`~/.ssh/config` import (0.4.0)**: “Import from ~/.ssh/config” in the connection-book area of the settings
  card — parses `HostName/User/Port/IdentityFile` into candidate entries (skipping wildcard blocks and
  entries without a User; `Include` is not expanded), skips same names, and writes them on “save”;
- **Credential-reference picker (0.4.0; decoupled from the env plugin since 0.17)**: next to the password /
  passphrase fields in the SSH dialog there is a filter box plus a height-limited list whose candidates are
  **the reference names the credential store already knows** (the host reads the `refs:` keys of
  `.credentials.yaml` — **names only, never values**) ∪ **the reference names this machine's connection book
  already uses**; clicking one fills in `env:NAME`, and any `env:NAME` can still be typed by hand (resolution at
  connect time goes through the **credential layer**: the provider first, `process.env` as the fallback).
  **Why read the file / why not the env plugin's managed list**: the official discovery path for references is
  "a configuration surface learns which references exist **from its own settings schema**" — the reference half is
  **deliberately not enumerable** (the wording in `@deepseek-ai/dsh-credentials`'s `listRecords` docs: “the
  reference half, which has no enumeration because configuration surfaces learn which references exist from
  settings schemas”), and the browser-side `ctx.remote.credentials` opens only `describe` / `set` / `unset` — not
  even `listRecords`. So “what names does this store actually hold” is unanswerable in the browser, while the
  picker's whole purpose is exactly that question. The host therefore exposes a **read-only** route,
  `/api/dsh-tty/credential-refs` (behind the loopback fence; it parses `refs:` keys and never returns values —
  see `readCredentialRefNames`). This is a **deliberate departure** from the official “references are not
  enumerable” design (cost: reference names reach the browser, values never do); to stay strictly on the official
  route, use only the connection-book half. Boundaries: references behind a custom provider `path` / `dshHome` are
  invisible here, and when the host read fails (or an older host lacks the route) the candidates quietly fall back
  to the connection-book half.
  When there are no candidates at all, the row **degrades to a single explanatory line** (rather than an input
  that can never open, which just looks broken): it says either to tick “store on save” above, or to type
  `env:NAME` into the field. The passphrase row has no checkbox above it, so its wording only mentions typing.
  **The settings card's edit form has the same row with the same candidates** (also opening only when the filter
  box takes focus); the only difference is presentation — there it is an **inline** list rather than an overlay,
  because that card is a long scrollable form where an overlay would be clipped;
- **Host-key TOFU pinning (0.3.0)**: after the first successful connection the host’s (host:port) sha256
  fingerprint is recorded in `hostKeys` (persisted with settings); every later connection is verified, any
  fingerprint in the set matches, and **a changed fingerprint rejects the connection outright** (defense
  against impersonation), with a reset pointer in the error message. A host’s multiple keys (0.19.0, e.g.
  rsa + ed25519) are each recorded and merged into one record — algorithm negotiation changes no longer
  cause false alarms. After a host reinstall or key change,
  delete the record under Settings → Plugins → Terminal Panel → “SSH host key
  records” and reconnect (the record list supports deletion). **“Import from known_hosts”
  (0.4.1)**: parses `~/.ssh/known_hosts` in one click to pre-fill existing host fingerprints in bulk, keeping
  all of a host’s rsa/ed25519 entries (no longer first-entry-only); host
  names from the connection book are also used to restore `|1|` hashed entries, and non-default ports are
  parsed as `[host]:port`;
- **Connection test (0.11.0)**: a “Test” button on each connection-book row of the settings card, plus a
  “Test connection” button in the SSH connection dialog — both perform **link diagnostics only** (no session,
  no `maxSessions` slot, no shell): first a TCP pre-check (DNS + connect, failures classified as
  refused/timeout/DNS/unreachable), then the ssh2 handshake for a host-key TOFU comparison, and finally
  authentication. The result is shown stage by stage: on success the elapsed time and “host key matched /
  recorded”; on failure the exact stage reason (such as “authentication rejected: all methods failed” or
  “host key mismatch” with the recorded and current fingerprints plus a reset pointer). **The connection-book
  “Test”** does full TOFU: the first test records the new fingerprint into `hostKeys` (the same semantics as a
  real connection); **the dialog “Test connection”** only compares without persisting (a draft not yet stored
  establishes no pinning).
- **Counts against the `maxSessions` concurrency limit**; closing matches local sessions: the tab ✕ / the
  `kill` frame closes the ssh2 channel, and the `exit` frame brings back the exit code / signal as usual.

## Server status bar (0.17.0)

![Terminal panel (with the server status bar): a thin monitor bar above the terminal showing CPU / memory / disk / cores / uptime / TCP / network speed](https://cdn.jsdelivr.net/gh/hyzyn/dsh-plugin-kit@main/docs/dsh-plugin-kit-tty-stats.png)

(The screenshot shows a **local session**; an SSH session’s status bar is the same bar with the same fields — see the single-pane SFTP screenshot below, where the bar above the terminal shows the remote host’s metrics.)

Every **visible** tab gets a thin status bar above the terminal showing the resource metrics of the host the
session belongs to (visually aligned with FinalShell’s session monitor bar):

    CPU ▮▮▯▯ 6% │ Mem ▮▮▮▮ 78% │ Disk ▮▮▮ 63% │ Cores 16 │ Mem 49.6G/62.3G │
    Uptime 2w4d7h16m │ TCP 570 │ Disk 40.8G/68.8G │ CPU Temp n/a │ Network ↓92.3K/s ↑93.1K/s

- **Two collection paths, one frame shape**: for an SSH session a second **non-PTY exec channel** is opened
  on **the same ssh2 connection**, running a resident loop on the remote that emits one line of JSON per
  second (rates such as CPU%/network speed are computed remotely); local sessions are sampled by the host
  itself (Linux reads /proc directly, macOS uses os/netstat/vm_stat). Neither path touches the PTY data stream.
- **Remote platform coverage: Linux / Windows**: a POSIX sh + awk script runs by default; if the channel ends
  **before a single frame of data has been read** (cmd.exe / PowerShell on Windows cannot parse the script),
  it automatically retries once with the PowerShell version (`-EncodedCommand` delivery, same field shape),
  and only fails when both hops fail — macOS/BSD remotes are exactly this path (no /proc and no PowerShell).
- **Subscription-based, lazy start**: the client sends `{t:'statsOn'}` / `{t:'statsOff'}` according to tab
  visibility, and the host starts collecting only on the first subscription; unsubscribing clears it, and
  session exit, orphan reaping, plugin disable and configuration off all stop the meter and close the remote
  channel, leaving no timers or remote loops.
- **Best-effort**: a field that cannot be obtained is omitted (the frontend shows “n/a”); a collection
  failure silently stops the meter and hides the whole status bar (it collapses after **8s** without a new
  frame — not 3s: when a sampling subprocess on the host occasionally slows down, frames get further apart,
  and too tight a window makes the whole bar blink) — it never writes to the PTY and never raises an error.
  Progress-bar thresholds: <70 normal / 70~90 yellow / >90 red.
- **A slow command cannot stall the cadence**: subprocess-backed fields (df / netstat / vm_stat) are awaited
  only on the very first sample; afterwards the sampler uses the last known value and refreshes in the
  background, so a command that hangs on some machine only leaves that one field briefly stale instead of
  stretching the one-frame-per-second timeline (measured: 3000ms → 3~12ms per frame).
- **Hot effect**: turning `statsEnabled` off stops collection at once (the status bar disappears and no more
  stats frames go over the WS), and turning it back on restores automatically from the subscriptions still in
  place — no restart and no need to reopen tabs.
- **Fixed slots + incremental repaint**: every value owns a fixed-width character slot (right
  aligned, so even the widest form only takes that one slot), and the items are built once — afterwards only
  text that actually changed is written. Hence `CPU 5% → 12%`, `TCP 36 → 1024` and
  `memory 9.2 GB → 17.8 GB` no longer push every following item sideways (which showed up as the whole bar
  jumping once a second), the progress-bar width can finally animate through its CSS transition, and
  horizontally scrolling to `Network` in a narrow window is no longer snapped back to the start by the next
  refresh.

## Configuration (Settings → Plugins → “Terminal Panel”, saving takes effect immediately)

| Item | Default | Description |
| --- | --- | --- |
| `enabled` | true | Disables the whole plugin (needs a restart) |
| `announceToAgent` | true | Whether to announce the terminal panel capability to the agent (systemPrompt injection) |
| `maxSessions` | 4 | Concurrent PTY session limit (1~16) |
| `shell` | `$SHELL` | Shell path; the settings card offers a picker and free input (candidates come from `/etc/shells` + `$SHELL` + common install paths, listing only existing and executable ones, with `$SHELL` first), and any path can also be typed |
| `term` | `xterm-256color` | TERM value |
| `colorTerm` | `truecolor` | COLORTERM value |
| `cwd` | host startup directory | Fallback working directory (the client’s current session cwd wins) |
| `reconnectGraceSec` | 120 | Seconds a session is kept alive after an abnormal disconnect (0~3600): the session survives a page refresh/network blip waiting for a reconnect, and the reaper ends it on timeout; `0` = the old behavior, end immediately on disconnect |
| `sshHosts` | `[]` | SSH connection book (selectable in the panel “+” menu): entries `{name, host, port=22, username, auth=agent\|key\|password, keyPath, passphrase, password, agentForward, persist=false}`; saved as a whole-set replacement, the same name overwrites; `password` / `passphrase` support `env:VAR` references so no plaintext is stored; with persistence on, clicking an entry opens a tmux persistent session by default, and `persist=false` is an **opt-out** |
| `hostKeys` | `[]` | SSH host key records (TOFU, maintained automatically): entries `{host, port, fingerprints[]}` (the legacy single `fingerprint` field is migrated and merged on read); unique by host:port, one record holds all of a host’s keys, appended automatically on the first connection, any matching fingerprint is allowed, and a full mismatch rejects the connection; the settings card can delete them to reset |
| `shellIntegration` | true | Injects the OSC 133/7 shell integration (command boundary markers + cwd reporting; `tty_capture{last}` depends on it); zsh/bash supported, other shells skipped automatically; can be turned off when compatibility problems appear |
| `tunnels` | `[]` | Port-forwarding tunnels: entries `{name, bookName, direction=local\|remote, localPort?, remoteHost?, remotePort?, localTargetHost?, localTargetPort?, enabled}`; `bookName` references a connection-book entry for host and authentication; maintained graphically in the “Port forwarding” block of the card |
| `sftpStyle` | `dialog` | SFTP File Browser UI style: `dialog` single pane (remote directory + upload/download/drag & drop) / `dual` two panes (local left / remote right, inline `⇨/⇦` server-side direct transfer); reopen SFTP for it to take effect |
| `persistence` | `off` | Session persistence: `off` sessions live and die with the host (default); `tmux` makes **every newly opened tab hosted by the tmux server by default**, recoverable across a host restart (requires tmux locally/remotely); the SSH dialog can opt out for a single connection |
| `endOnPageClose` | `false` | Whether to end the tmux persistent session as well when the page (the last connection) disconnects and the keep-alive window ends. `false` by default = retained and recoverable; `true` = nothing is kept alive once the page is closed (a refresh within the keep-alive window still reattaches seamlessly) |
| `sftpLimits` | `{maxDownloadMb: 1024, maxUploadMb: 2048, maxUploadFiles: 1000}` | SFTP transfer limits (browser-side guardrails, all **0 = unlimited**): `maxDownloadMb` per-file download limit (over the limit it aborts and suggests the dual-pane `⇦`/terminal scp), `maxUploadMb` per-file upload limit, `maxUploadFiles` files per batch/drag & drop upload; for large files use dual-pane `⇨/⇦` server-side direct transfer (bytes never pass through the browser, no memory cost) |
| `statsEnabled` | true | Server status bar (0.17.0): collects and pushes CPU / memory / disk / uptime / TCP connections / network speed / CPU temperature by tab visibility; turning it off stops the meter at once (the remote exec channel is closed too), and saving takes effect immediately |

## Connection-bar extension point (client service `ttyConnbar`, 0.13.0)

Other plugins can append their own contextual buttons to the SSH connection bar (the row with the SFTP /
tunnel buttons) without tty knowing about them — tty only exposes one generic client service. **The built-in
actions (reopen / SFTP / tunnel) go through the same registration channel**, and display order = registration
order; with no extension registered the behavior is exactly as before.

```js
// Optional injection in a consumer's own client half (e.g. dsh-docker): it never fires when tty is absent
ctx.inject(['ttyConnbar'], (c) => {
  const dispose = c.ttyConnbar.addAction(({ tab, spec, bookName, addAction }) => {
    // Called once per renderConnbar; decide for yourself whether to add a button this time
    if (spec.t !== 'ssh') return
    addAction(iconSvg, 'Containers', 'Open the Docker container panel for this host', () => { /* open your own panel */ })
  })
  // Call dispose() on unload
})
```

| Member | Description |
| --- | --- |
| `addAction(factory)` | Registers a button factory; returns a deregister function. `factory` receives `{tab, spec, bookName, addAction}`: `spec` is the session’s spawnSpec (`{t:'ssh', name?, host, port, username, ...}`), `bookName` is the connection-book entry name (`''` for an inline connection), and `addAction(icon, label, title, onClick)` appends a button using tty’s button style |
| `requestRender()` | Asks tty to re-render the connection bar (for when a consumer has new data asynchronously and needs the button to appear immediately) |

- It only fires on **SSH tabs**; the connection bar of a local tab is hidden anyway.
- A throwing factory is only logged with `console.warn`, without affecting the connection bar or the built-in buttons.
- The service name `ttyConnbar` is not declared on tty’s `Context` type surface, so consumers can inject it by
  string; when tty is not installed or is older than 0.13.0 the injection never fires, so consumers must treat
  it as an optional dependency.

### Terminal command tabs (client service `ttyTerminal`, 0.14.0)

An extension point one step beyond connection-bar buttons: it lets other plugins **open a tab that runs a
single command** (the typical use is dsh-docker’s card “Terminal” button → `docker exec -it <container> sh`).

```js
ctx.inject(['ttyTerminal'], (c) => {
  c.ttyTerminal.open({
    command: "docker exec -it 'ems-consumer-test' sh",  // required, single line, ≤2000 characters
    book: 'lab-a',        // one of the two: connection-book entry name → SSH tab
    // spec: { host, port, username, auth, agentForward },  // inline SSH fields
    // (neither = local tab, with cwd giving the working directory)
    label: 'ems-consumer-test · exec',
    cwd: '/optional/local/cwd',
  })
})
```

- Command tabs are **not persisted in tmux** (commands are short-lived and attaching is meaningless) and do
  not go through a login shell; the SSH side uses `conn.exec(command, {pty})`, and the local side uses
  `sh -c 'export TERM=…; exec <command>'`.
- **Command tabs reopen automatically**: after a host restart / reconnect the sid is gone, and the client
  re-runs the command from the original spec for tabs with `spawnSpec.command` (ordinary non-persistent tabs
  keep the old “click to retry” behavior). After a page refresh they are restored by the original command too.
- The command comes from a **host-side plugin** (not from remote user input), so its trust level equals the
  plugin’s own; tty only validates the shape: non-empty, single line, length ≤2000 (a newline would break the
  local `-c` wrapper layer).
- The service name `ttyTerminal` is likewise not declared on the `Context` type surface; inject it as an
  optional dependency; when tty is not installed or is older than 0.14.0 it never fires (dsh-docker degrades
  to “copy command”).

### Embedded in-place terminal (`ttyTerminal.mount`, 0.15.0)

`open` is “borrow tty’s modal to open a tab” — the user’s panel gets covered or pushed behind by the modal; if
a consumer would rather **place a terminal inside its own panel** (typically dsh-docker’s terminal drawer:
watch container logs and drop into the container to type commands without losing context), use `mount`:

```js
ctx.inject(['ttyTerminal'], (c) => {
  if (Number(c.ttyTerminal.version ?? 0) < 2) { /* older version: fall back to open */ }
  const dispose = c.ttyTerminal.mount(hostEl, {
    command: "docker exec -it 'ems-consumer-test' sh",  // the same set of options as open
    book: 'lab-a',                                     // book > spec > local
    label: 'ems-consumer-test · exec',
  })
  // When collapsing your own drawer:
  // dispose()
})
```

- `hostEl` must be an `HTMLElement`: tty inserts an absolutely positioned `.tt_term` into it, so the mount
  point needs `position: relative` and a definite size (size changes are caught by a ResizeObserver and
  synced to the PTY).
- An embedded terminal **shares the same WebSocket and session table** as tabs, but its semantics are “a piece
  of terminal inside someone else’s panel”: it does not enter the tab bar, does not write sessionStorage, and
  does not take part in showing/hiding the tty panel; **closing the tty panel does not affect it** (and
  conversely: while an embedded session is running, tty’s connection is not closed).
- Reconnect on disconnect, re-running by the original command after a host restart, and clicking the overlay
  to reopen after exit all reuse the existing logic; `dispose()` ends the session and unmounts the DOM.
  Mounting is **cold-start safe** — with the tty panel closed and no connection yet, `mount` still brings the
  connection up (creation frames are queued first and sent after `onopen`).
- An embedded terminal has no search/clear/copy toolbar from the tty panel header, and Ctrl+F is handed back to the browser.

### In-panel mount slots (client service `ttyPanel`, 0.16.0)

> tty’s own SFTP File Browser goes through this channel too (0.16.0): when the mount slot is free it docks
> below, and when another panel on the same tab has taken it, it falls back to the dialog.

`mount` solves “a consumer gives the host and tty puts a terminal in it”; `ttyPanel` is its **mirror** — tty
gives consumers a slot inside the terminal panel to mount their own UI into. A typical case: dsh-docker opens
“Containers” from the SSH connection bar and the containers panel docks to the **right** of the terminal,
which stays visible, clickable and typable instead of being covered by a full-screen modal (which was exactly
the pain before 0.15).

A mount slot is **connection-scoped**: its credentials / target come from the terminal tab that opened it.
So since 0.19.0 every pane records its **owner tab** (`options.ownerSid`, defaulting to the active tab at
mount time): switching to another tab **hides** the pane (`data-dock-hidden`; its DOM and your rendered tree
survive, in-flight transfers keep running) and switching back restores the scene; closing the owner tab tears
the pane down. Without this, the pane stayed put across a tab switch — its title read `SFTP · lab-b`
while the active tab was `192.0.2.10`, leaving **another host**’s file listing on screen (worst case:
uploading to the wrong host). Passing `ownerSid: null` means “owned by no tab” (always visible); that is what
happens automatically when the panel is open with no tabs at all, and a consumer can use it to declare “this
pane has nothing to do with tabs, do not hide it on a switch”.

```js
ctx.inject(['ttyPanel'], (c) => {
  // Use your own modal when the panel is not open (or tty < 0.16)
  if (Number(c.ttyPanel.version ?? 0) < 1 || c.ttyPanel.isOpen() !== true) { /* fallback */ }
  const pane = c.ttyPanel.mountPane({
    title: 'Docker Containers',  // panel title
    hint: 'prod-web-01',   // grey text right of the title (optional)
    side: 'right',         // 'right' (default, vertical list / list+detail) | 'bottom' (wide horizontal table)
    size: 520,             // initial size in px: right = width (default 460), bottom = height (default 320)
    min: 360,              // minimum size in px (optional, default 280 / 160)
    ownerSid: tab.sid,     // owner tab (optional): omitted = current active tab, null = owned by no tab
    onClose: () => { /* called when tty tears the panel down: unmount your React root here */ },
  })
  createRoot(pane.element).render(<MyPanel />)
  // When collapsing it yourself: pane.dispose()
})
```

| Member | Description |
| --- | --- |
| `isOpen()` | Whether the terminal panel is currently open (minimized does not count). Consumers use it to decide “mount in here” or “use my own modal” |
| `mountPane(options)` | Mounts a slot on the right / at the bottom of the panel and returns a handle; **only one at a time**, and a later `mountPane` first tears the previous one down (calling its `onClose`). With `side:'bottom'` it spans the full width and is sized by height (drag the top edge), collapsing into a title bar. `ownerSid` records the owner tab (default: the active one); panes owned by another tab are **hidden** on tab switch (DOM and your React tree survive, restored when you switch back — see “connection-scoped” above) |
| `handle.element` | The host the consumer renders into (flex column, already `overflow:hidden`, filling the body area) |
| `handle.setTitle(text)` / `setHint(text)` | Change the title / the grey hint |
| `handle.expand() / collapse() / toggle() / isCollapsed()` | Collapse into a 32px strip (vertical title + expand/close buttons), and the terminal immediately gets its width back |
| `handle.dispose()` | The consumer tears it down itself (idempotent, does not fire `onClose` again) |

- **Lifecycle**: the side panel’s DOM lives inside the terminal modal — minimize / restore follow the panel,
  and consumers need not care; when the panel is closed (✕ / host unload) tty **calls `onClose` first**
  (consumers unmount there) and only then detaches the DOM.
- **Resizing**: a right pane drags its left edge, a bottom pane drags its top edge (the cap is 72% of the
  panel card’s long side, leaving room for the terminal), and the size is remembered per direction within the
  same page session. Terminal-area size changes are caught by the existing ResizeObserver, which refits
  automatically and syncs the new rows/cols to the PTY.
- **Viewport anchoring**: opening/closing a pane or dragging its size changes the terminal area’s height, and
  xterm moving its viewport by itself would “push the content up”. Refit anchors to what the user was doing —
  if they were at the bottom (watching the newest output) it stays at the bottom, and if they had scrolled
  back through history it locks to the same lines, so nothing jumps away.
- **Choosing a direction**: vertical lists / list+detail (such as the containers panel) use `right`; wide
  tables (such as the SFTP file list or the local↔remote dual pane) use `bottom` — the full width fits more
  columns and does not squeeze the terminal’s width.
- The title bar (title / collapse / ✕) is provided by tty, and consumers only own their own body; a throwing
  `onClose` is only logged with `console.warn`, without affecting closing the panel.

> Contract versions: `ttyConnbar.version === 1`, `ttyTerminal.version === 3` (1 = `open` only,
> 2 = adds `mount`, 3 = `open` reuses an existing live tab for the same connection + command by default),
> `ttyPanel.version === 2` (1 = `mountPane` + `isOpen`, 2 = adds `minimize`). Consumers **decide capabilities
> by version number**; do not rely on assumptions beyond `typeof fn === 'function'`; on an older tty the
> `inject` still fires, but the corresponding fields are absent.

## Frame protocol (/api/dsh-tty/ws, JSON text frames; v3 = one connection with many sessions + reconnect)

| Direction | Frame | Description |
| --- | --- | --- |
| C→S | `{t:'spawn', sid?, cols?, rows?, cwd?, persist?, persistName?, command?}` | Create a session; sid defaults to one generated by the host and cwd to the configured fallback; `persist` + a stable `persistName` (0.10.0) = tmux persistent session (`dsh-<name>`, requires persistence=tmux); `command` (0.14.0) = run a single command directly (no persistence) |
| C→S | `{t:'ssh', sid?, cols?, rows?, name? \| host, username, …, persist?, persistName?}` | Create an SSH session (native ssh2); `name` references a connection-book entry as the base, and inline `host/port/username/auth/keyPath/passphrase/password/agentForward` can override it field by field; `persist` has the same semantics as spawn (remote tmux hosting) |
| C→S | `{t:'input', sid?, d}` | Key/paste data |
| C→S | `{t:'resize', sid?, cols, rows}` | Panel size change |
| C→S | `{t:'refresh', sid?}` | Force a redraw (0.10.1): the host runs `refresh-client` on a tmux session (the client resets to clear stale scrollback and then asks for a fresh redraw; a no-op for non-tmux sessions) |
| C→S | `{t:'kill', sid?}` | Close a session (orphan sessions can also be killed across connections, to prevent leaks) |
| C→S | `{t:'sessions'}` | List a global session snapshot (`attachable` marks the reattachable ones) |
| C→S | `{t:'attach', sid}` | Reattach an orphan session (inside the keep-alive window): after `ready(reattached:true)` a single `data` frame replays the output buffer |
| C→S | `{t:'statsOn' \| 'statsOff', sid}` | Subscribe/unsubscribe that session’s server status bar (0.17.0): driven by tab visibility, and the host collects only while a subscription exists (lazy start + unsubscribing stops the meter and closes the remote channel) |
| S→C | `{t:'ready', sid, pid, kind, target?, persist?, reattached?}` | Session ready; `kind:'local'` carries a pid, while `kind:'ssh'` has pid=null and target=user@host[:port]; attach reuses this frame with `reattached:true`; `persist:true` means a tmux persistent session (0.10.0) |
| S→C | `{t:'data', sid, d}` | Terminal output (utf8 text, StringDecoder covers multi-byte sequences split across frames); **coalesced into frames over a 12ms window / 64KB threshold** (0.4.1), with a forced flush before exit/kill to guarantee frame order |
| S→C | `{t:'stats', sid, stats}` | Resource metric frame (0.17.0): `{cpuPct, cores, memUsed, memTotal, memPct, diskUsed, diskTotal, diskPct, uptimeSec, tcpConns, rxRate, txRate, tempC?}`; missing fields are omitted (best-effort, the frontend shows “n/a”), byte fields are bytes and rates are B/s |
| S→C | `{t:'exit', sid, code, signal}` | The PTY exit fact (exactly once; after attach moves to a new connection it is still delivered over the current connection) |
| S→C | `{t:'error', sid?, m}` | Error |
| S→C | `{t:'sessions', list, tmux?}` | Session snapshot (`{sid, kind, target, pid?, cwd, startedAt, lastOutputAt, attachable, persist?}`); `tmux` = the persistent session names alive on the dedicated socket + retained SSH persistent session names (0.10.1, an observable field) |

Disconnect keep-alive semantics: when the client closes the panel normally it sends `kill` for each session
before disconnecting; therefore “WS closed with sessions still alive” is treated as an abnormal disconnect —
sessions become orphans (output keeps accumulating into the ring buffer and is sent to no connection), and
after `reconnectGraceSec` of keep-alive the reaper cleans them up; during that window a new connection can
query `{t:'sessions'}` and `{t:'attach', sid}` to reconnect and replay.

When sid is omitted the frame is routed to “the connection’s only session”; with 0 or multiple sessions on the
connection, omitting sid errors out. The upgrade route carries a loopback trust fence (remoteAddress + Host +
Origin checks), so only the local Web GUI can connect.

## Development

```bash
pnpm --filter @hyzyn/dsh-tty build        # tsc host + esbuild browser half (client.js)
pnpm --filter @hyzyn/dsh-tty typecheck
pnpm --filter @hyzyn/dsh-tty probe        # M0 probe: PTY primitive verification (needs a real PTY)
pnpm --filter @hyzyn/dsh-tty integration  # integration tests: real plugin × real DSH service composition
pnpm --filter @hyzyn/dsh-tty live         # liveness smoke: start dsh web first (default ws://127.0.0.1:3080; DSH_TTY_WS_URL overrides)
pnpm --filter @hyzyn/dsh-tty tui          # TUI smoke: vim/htop full-screen rendering (start dsh web first, default :3090; DSH_TTY_WS_URL overrides)
pnpm --filter @hyzyn/dsh-tty ssh-smoke    # SSH smoke: in-memory SSH server (ssh2.Server) × real spawnSsh end to end (build first)
pnpm --filter @hyzyn/dsh-tty probe-smoke        # probe classification & TOFU (7 cases, self-contained)
pnpm --filter @hyzyn/dsh-tty probe-route-smoke  # probe HTTP route + connection book (9 cases)
pnpm --filter @hyzyn/dsh-tty sftplimits-smoke   # sftpLimits normalisation (6 cases)
pnpm --filter @hyzyn/dsh-tty windows-smoke      # Windows end to end (only meaningful on Windows; skips elsewhere)

CI (`.github/workflows/ci.yml`) runs `integration` + `ssh-smoke` + the three smokes on ubuntu and
`windows-smoke` on windows-latest, plus a “build artifacts match sources” gate (`client.js` + `lib/`).
The 48 fixes shipped in 0.19.0 and their audit index live in [`DEFECTS.md`](./DEFECTS.md).
pnpm --filter @hyzyn/dsh-tty preview      # visual preview: headless Chrome screenshots per scene (see below)
```

The browser half’s source is `client-src/index.js`, with the stylesheet living separately in
`client-src/tty.css` (inlined into `client.js` by esbuild’s text loader). The build output `client.js`
(including the xterm core) needs another `pnpm build` and a page refresh (possibly a hard refresh) after
client-side changes.

### Visual preview / screenshot regression (`scripts/preview.mjs`)

Styles should not be changed by “refresh the page and take a look”: the script loads `client.js` into a pure
static fixture page (`scripts/preview/harness.html` + a fake DSH host from `mock-host.js`: module
loader / fetch / WebSocket) and renders 29 UI states one by one with headless Chrome, screenshotting them to
`packages/tty/.preview/shots/`:

```bash
node scripts/preview.mjs                 # all scenes
node scripts/preview.mjs local menu ssh  # specific scenes
node scripts/preview.mjs --list          # list scenes
node scripts/preview.mjs --theme=light   # light theme
```

Coverage: local terminal / multi-tab + SSH connection bar / the “+” menu / SSH dialog (new, edit, probe)/
settings card (also side by side with docker)/ SFTP (single pane, dual pane, placement fallback)/
**mount slot follows the tab** (`dock-pane-tab`, the 0.19.0 regression)/ minimized badge / exit and error
overlays / tunnel popover / search box / toast / embedded terminals (alone and alongside the panel)/
docker panel and “containers → terminal drawer”.

A scene may attach a **function-shaped** assertion to `window.__previewAssert` (returning `null` means pass,
a string / array means fail); the script runs it and folds the result into `✓/✗`. An assertion that only
lives in the fixture, seen by nobody unless someone pulls `diag` by hand, is a regression that is not really
pinned — which is exactly what bit the 0.19.0 “panel does not follow the tab” fix: the assertion was written
already, but because it was mixed into a `diag` object containing a function, the whole evaluation failed
silently and everything reported ✓.

The fixture also renders the `--dsw-*` skin variables together with the real UI, so it can
verify things like “is there still a white panel after switching light/dark themes”. The output directory
`.preview/` is gitignored.

> The fixture’s `ctx.inject` mirrors real cordis: **if any requested service is missing the callback is not
> invoked** instead of receiving `undefined` in the scope. Filling in `undefined` means one optional
> dependency (for example the `sidebarRight` / `sidebarRightTabs` branch of dsh-docker) makes **every** scene
> blow up during mount (`Cannot read properties of undefined (reading 'register')`) — when the fixture does
> not provide a host-side sidebar service, that branch should simply stay unregistered.

> The fixture needs Chrome/Chromium (it looks for playwright’s cached Chrome for Testing by default, or use
> `CHROME_PATH`). If the host environment restricts Chrome’s sandbox (child processes denied), it must be
> loosened before running, otherwise the browser cannot start.

## Known limitations

- **Resize is an internal coupling**: DSH’s `spawnTerminal` handle does not expose resize, so the plugin
  passes through `(handle).terminal.resize(cols, rows)` directly (node-pty’s native API, reachable in the
  same process). If a DSH upgrade changes the internals, since 0.3.0 it warns once and degrades to a fixed
  size instead of throwing on every frame.
- **TERM is injected through a `-c` wrapper layer (POSIX only)**: DSH hardcodes node-pty `name:"dumb"`, and in
  node-pty name takes precedence over env.TERM, so the shell is started as
  `sh -c 'export TERM=...; exec "$shell"'` (transparent to the user; the TERM /
  COLORTERM values are whitelisted to avoid breaking the wrapper command). **There is no such layer on
  Windows** — neither cmd nor PowerShell understands that syntax, and ConPTY does not need TERM (see the
  “Windows hosts” section).
- **Windows hosts**: local terminals work (default `%COMSPEC%`), but shell integration, tmux persistence and
  disk / TCP / throughput / temperature are unsupported or unavailable — the full boundary and verification
  scope are in the “Windows hosts” section.
- **terminate() has a “survivor” race**: DSH’s tree-level cleanup occasionally reports
  `terminal cleanup failed; surviving pids`, which the plugin handles best-effort
  (on failure it degrades to SIGKILL on the top-level shell), and the exit code/signal may be null.
- **Output is a utf8 text stream**: node-pty data is transported by DSH as utf8, so non-UTF-8
  bytes get eaten by replacement characters (such as `cat` on a binary file) — expected behavior; multi-byte
  UTF-8 sequences split across chunks are covered by StringDecoder (0.3.0), so fast Chinese output no longer garbles.
- The browser half depends on the official `dsh-web-app` sidebar structure (`[data-pane="sidebar"]`), so an
  unofficial Web GUI may not show the entry.
- **The keep-alive window is limited**: after an abnormal disconnect a session is kept alive and reattachable
  only for `reconnectGraceSec` (120s by default), and a host process restart ends all sessions; sessions not
  reconnected before the deadline are ended by the reaper, and scroll history beyond the output buffer
  (last 256KB) cannot be recovered.
- **Shell integration is zsh / bash only**: other shells are skipped automatically (`tty_capture{last}`
  reports a clear error rather than a wrong one). bash < 4.4 uses the DEBUG trap fallback: internal commands
  of compound commands such as loops emit extra B markers, and `tty_capture{last}` captures only the output
  after the last internal command for those commands (exit codes and `tty_expect` are unaffected). If the
  user’s rc overrides `PROMPT_COMMAND`/the hook array, the integration may stop working — turn off
  `shellIntegration` or report a patch for compatibility.
- **Port-forwarding boundaries**: local listeners are fixed to 127.0.0.1 (never exposed to the LAN); listening
  on the server side for the remote direction is also limited by the server sshd’s `GatewayPorts`; a tunnel’s
  SSH connection is independent of terminal sessions and both use TOFU pinning and connection-book
  authentication; tunnel spec changes (port/target/start-stop) take effect hot on “save”, while hot-changing
  connection-book credentials takes effect on the next reconnect.
- **Session persistence (tmux) boundaries**: persistent tabs are hosted by the tmux server (dedicated socket
  `dsh-tty`) — when the host is hard-killed / the keep-alive reaper fires / the browser loses the tab spec,
  the tmux session is **retained** (which is exactly what makes recovery possible) until the machine restarts
  or `tmux -L dsh-tty kill-server` is run manually; the agent’s command-granularity tools
  (capture{last}/expect) depend on DCS `allow-passthrough` in tmux ≥3.3, and on older versions persistence
  works but that capability degrades (SSH remote sessions do not inject shell integration hooks, so
  capture{last} was never available there, independently of persistence); recovery redraws the currently
  visible screen, while pre-disconnect scroll history lives in tmux’s own history buffer (copy-mode), not in
  the outer xterm scrollback; a persistent tab’s `exit` frame exit code is the tmux client’s (0), while the
  shell’s exit code remains available through the OSC 133;D marker as usual; `tmux.conf` is read only when the
  tmux server first starts (after changing the configuration, run `tmux -L dsh-tty kill-server` so the next
  spawn rebuilds the server); with `grace=0`, “end immediately on disconnect” also kill-sessions persistent
  tabs (the tmux session does not survive); persistent SSH sessions require tmux on the remote (without it
  they degrade to a normal session automatically, and the connection bar shows a permanent “not persistent”
  marker), and the remote `~/.tmux.conf` does not affect the dedicated socket’s independent conf
  (`-f /dev/null`); SSH persistent session names are retained with settings; when **two windows reattach to
  the same persistent session at the same time** they share one host PTY (0.10.1, single-client fan-out, slots
  do not double), and the row/column count follows the most recently resized window (when the sizes differ,
  the larger side self-heals with a redraw through onResize).
- **SFTP boundaries**: file permissions = the terminal permissions of the corresponding SSH account (no extra
  sandbox/chroot); downloads go through browser memory (for very large files prefer `scp`/`rsync` in the
  terminal); the agent tool `sftp_read` is ≤1MB and rejects binaries, and `sftp_write` is ≤1MB per call (use
  panel upload or the terminal for larger content); the `sftp_*` tools accept only connection-book entry
  names, and inline credentials are for the panel dialog only; overwrite writes go through a same-directory
  temp part `.dsh-part-<uuid>` + rename (atomic) — if the host process crashes / loses power, a part orphan
  may remain, and the next overwrite upload to the same directory automatically cleans parts older than 24h.
- **SSH host keys are TOFU-pinned**: the first connection records the sha256 fingerprint automatically
  (trust on first use), after which any recorded fingerprint matching is allowed and a full mismatch is
  rejected — no longer an
  unconditional accept-and-log. Note TOFU’s inherent boundary: if the first connection already met a MITM,
  what was recorded is a fake fingerprint; `hostKeys` is persisted with settings, and a fingerprint change
  requires a human to confirm in the settings card and delete the record; a host’s multiple key types
  (rsa/ed25519/ecdsa) are merged into one record’s fingerprint set (0.19.0), so algorithm negotiation
  changes no longer report a false “fingerprint changed”; known_hosts import likewise keeps every
  fingerprint of a host.
- **Browser tab persistence contains no plaintext credentials** (0.19.0): the spec copies that SSH tabs
  write into sessionStorage / localStorage have plaintext `password` / `passphrase` stripped (`env:`
  references are kept) and are flagged with `credsStripped` — on restore/respawn the terminal asks for
  re-entry. The in-memory spec of the live session is unaffected.
- **SSH passwords / passphrases should use `env:VAR` references**: the connection book is persisted in the
  settings file, so plaintext `password` / `passphrase` is an exposure surface; prefer `env:VAR` +
  dsh-env-manager, or `agent` authentication outright (credentials never touch disk).
- **Server status bar (0.17.0) boundaries**: the remote side relies on two fallback hops: POSIX first (needs
  `/proc` + `awk`), and if not a single frame appears it falls back to PowerShell — this is what covers
  **Windows remotes** (most components have no temperature and show “n/a”, the disk is the system drive
  `%SystemDrive%`, TCP comes from `netstat -an`, and network speed from `Get-NetAdapterStatistics` deltas;
  integers only, which avoids locale decimal points and scientific notation at the root), while **macOS/BSD
  remotes** satisfy neither hop, get not a single field, and hide the whole status bar; on non-Linux remotes
  every (re)subscription costs one extra doomed exec (about a hundred milliseconds, without affecting frame
  latency); on Linux CPU temperature exists only on machines that expose `/sys/class/thermal` (most cloud
  hosts/VMs do not, showing “n/a”); the disk is always the filesystem holding `/` (the system drive on
  Windows) (no multi-mount support); the remote script is single-quoted through `sh -c` (so it runs even when
  the login shell is fish/csh); local-session metrics belong to the **host machine** (several local tabs share
  one sampling, with a continuous CPU/network delta window), and since macOS has no /proc, `ss` or sysfs it
  uses os/netstat/vm_stat instead, so the temperature is always “n/a” and memory is active+wired+compressed
  from vm_stat (os.freemem counts file cache as used and sits at 99% long-term); the metrics are
  **instantaneous values** with no history curves, and there is no agent tool for them (the agent keeps using
  the command-granularity tty_* capabilities).
- **SSH sessions have no local pid**: an ssh2 shell channel is not a local process, so `ready.pid`
  is `null` and `tty_list` shows `target` instead of a pid; local `ps` / `kill` do not work on remote
  processes — close with the tab ✕ or the `kill` frame (which closes the ssh2 channel).

## How it works

```
Browser half (client.js, esbuild bundle)
  ├─ sidebar “Terminal” entry → large modal
  ├─ tab bar: one xterm.js instance per tab (independent sid; WebGL renderer, DOM fallback on loss)
  ├─ reconnect: exponential-backoff auto-reconnect + sessions query + attach restore;
  │  the tab list lives in sessionStorage (after a refresh, reconnect by sid and keep sessions alive)
  ├─ sessions client service: a new tab carries the current session cwd
  └─ WebSocket ──→ /api/dsh-tty/ws (webServer.registerUpgrade)
                        │
Host half (src/index.ts)
  ├─ per-connection session table (sid → local PTY / SSH channel, many sessions per connection)
  ├─ SessionManager (maxSessions cap, hot-adjustable; SSH sessions scheduled from the same table;
  │  the orphan reaper cleans up abnormally disconnected sessions per reconnectGraceSec)
  ├─ per-session 256KB ring buffer (tty_capture / disconnect replay) + xterm-headless
  │  virtual screen (tty_screen) + StringDecoder (utf8 split-frame fallback)
  ├─ shell integration (src/shell-integration.ts): zsh ZDOTDIR / bash --rcfile
  │  stub injection of OSC 133/7 hooks; output stream parsing (feedShellIntegration, carrying
  │  truncated packets across chunks) → command boundary capture (tty_capture{last} / tty_expect
  │  early stop) and cwd tracking (tty_list)
  ├─ local path: ctx.get('subprocess').spawnTerminal({ argv: shell -c wrapper, cwd })
  │  persistent tabs (0.10.0): the wrapper becomes `exec tmux -L dsh-tty -f <conf> new -A -s dsh-<name>`
  │  (src/tmux.ts: probing / asset generation / spawn planning / kill-session; stable assets under
  │  <DSH_HOME|~/.dsh>/tty/ — tmux.conf + inner.sh + zsh/bash stubs; tmux swallows sequences it
  │  does not recognize, so the shell-integration hook detects $TMUX and wraps OSC 133/7 in a DCS
  │  passthrough envelope, tmux ≥3.3 unwraps and forwards it, and the host parser needs no change)
  ├─ auxiliary routes: /api/dsh-tty/ssh-config (~/.ssh/config import candidates),
  │  /api/dsh-tty/credential-refs (reference names known to the credential store — names only, see
  │  “Credential storage”), /api/dsh-tty/env-vars (variable names managed by the env plugin), /api/dsh-tty/known-hosts
  │  (TOFU fingerprint prefill, src/known-hosts.ts parses hashed entries too),
  │  /api/dsh-tty/shells (shell path candidates) — all behind the loopback fence
  ├─ SFTP (src/sftp.ts, 0.7.0): lazy connection pool (reclaimed after 120s idle, reconnected on
  │  demand when dropped, TOFU shared) → POST /api/dsh-tty/sftp/list|mkdir|rename|remove|download|
  │  upload (spec in body/headers, credentials never in the URL; uploads/downloads streamed via pipe) +
  │  sftp_list/read/write/mkdir/rename/remove/tree tools (accept only a connection-book name;
  │  mkdir supports parents, filling levels bottom-up, tree recurses with depth/count limits)
  ├─ port forwarding (src/tunnels.ts): host-owned tunnels (-L/-R both ways), backoff reconnect on
  │  drop, TOFU shared, connection counters; GET /api/dsh-tty/tunnels live status + tunnel_list tool
  └─ frame protocol: spawn|ssh / input / resize / kill / sessions / attach
     ↔ ready/data/exit/error/sessions + backpressure

SSH path (src/ssh.ts)
  └─ {t:'ssh'} → spawnSsh: native ssh2 Client connection (agent / key / password,
     password·passphrase support taking secrets from env:VAR; the host key is TOFU-pinned
     through HostKeyStore), opening a shell channel wrapped into a TermHandle shaped like a PTY
     (pid=null, kind='ssh', target=user@host[:port]),
     backpressure is passed through to the channel as well — after that it is scheduled just like a local PTY;
     with persist on it first probes `command -v tmux` and then `exec tmux -L dsh-tty -f /dev/null
     new -A -s dsh-<name>` to open a pty channel (remote tmux hosting; without tmux it degrades to a plain
     shell channel + a grey-text hint; kill is finished off by `tmux kill-session` inside the connection)
```

The M0 probe, the integration tests (B1~B24, 58 assertions in total) and real-instance smoke tests
(live / TUI) were verified on a real DSH service composition: TERM injection, resize passthrough, sid
conflicts, the concurrency limit, the loopback fence, multi-session data isolation, cwd tracking and
validation, hot configuration reload (settings/updated), the full kill→exit chain, disconnect keep-alive +
sessions/attach reconnect replay, the tty_screen virtual screen, tty_capture ANSI cleanup, shell integration
(capture{last} + exitCode, OSC 7 cwd tracking), tty_expect matching and timeout, the ~/.ssh/config parser,
port forwarding (two active tunnels + forwardOut round trip + reconcile cleanup),
the shells candidate route, bash 3.2 shell integration (DEBUG trap fallback: capture{last} +
exitCode, tty_expect early stop when the command ends), SFTP file transfer (list/mkdir/upload/
download/remove routes + sftp_* tools, test-sshd in-memory sshd end to end), the SFTP management
loop (agent sftp_mkdir/-rename/-remove/-tree: parents creation, tree depth truncation,
cross-directory moves, non-empty delete rejection and recursive delete); session persistence (B25/B26: persistence
gating, tmux session hosting and kill-session cleanup, the no-tmux degradation hint, capture{last} under DCS
passthrough, keep-alive reaping that kills only the PTY and not the tmux session, reattaching to the same
persistName — with no local tmux it automatically runs only the degraded path). The SSH path is verified by `ssh-smoke`
(in-memory SSH server × real `spawnSsh`): password authentication and prompt,
command round trip, pty-req initial size and resize (window-change), the full terminate /
exit-status chain, plus TOFU fingerprint recording (S7) and fingerprint-change connection rejection (S8);
SFTP is covered by ssh-smoke S9 (test-sshd’s sftp subsystem × the real SftpManager):
directory listing and realpath home, upload overwrite+append, download (stat size as content-length),
mkdir/rename/non-recursive delete rejection/recursive delete, TOFU fingerprint-change rejection; S9g covers mkdir
`parents` creation level by level (idempotent) and `tree` depth truncation/full output.

