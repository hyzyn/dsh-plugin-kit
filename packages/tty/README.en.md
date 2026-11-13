# @hyzyn/dsh-tty

[中文](README.md) | English

> The DSH sidebar “Terminal” panel: a complete terminal built on xterm.js + a **real PTY**, treating local and SSH alike, with sessions kept alive across disconnects for long-running work.

## Features

- **Real PTY + WebGL rendering**: node-pty real PTY, so TUIs such as vim / htop / a dev server all run; multi-tab.
- **Optional tmux session persistence**: reopen after a host restart / network blip and the scene is back; “command tabs” such as docker exec reopen automatically.
- **Native ssh2 connections**: agent forwarding + host-key TOFU pinning, managed uniformly through the connection book; plus **SFTP** upload/download and **port forwarding** (-L / -R, reconnecting automatically after a drop).
- **The agent reads the terminal at “command” granularity**: shell integration (OSC 133/7) lets `tty_capture{last}` / `tty_expect` read the output and exit code of “the previous command” instead of capturing the screen and guessing; `tty_list` reports whether a command is currently running (`running`, three states), and `tty_run` returns the output and exit code of one command in a single call.
- **Client services for other plugins**: `ttyConnbar` (connection-bar actions), `ttyTerminal` (open a terminal in place) and `ttyPanel` (mount slots inside the panel); dsh-docker’s “Containers / Terminal” buttons go through them.
- **AI assist: explain failures (0.24.0, off by default)**: when a command exits non-zero a chip appears in the corner; clicking it sends **that command's output tail** (cleaned / truncated / secrets masked) plus the current screen to the model and renders a short “what happened / next step”. A suggested command is only typed into the prompt line — never submitted for you. See [AI assist](#ai-assist-explain-failures-0240-off-by-default).

![Terminal panel: xterm modal + server status bar + resource dashboard](https://cdn.jsdelivr.net/gh/hyzyn/dsh-plugin-kit@main/docs/dsh-plugin-kit-tty.png)

## Installation

```bash
dsh plugin --profile web add @hyzyn/dsh-tty    # npm install (after release)
dsh plugin --profile web add link:$(pwd)/packages/tty   # repo development/debugging
```

After installing, restart `dsh web`; a “Terminal” entry appears in the sidebar — click it to open the panel;
the “Terminal Panel” card lets you change the configuration (**saving takes effect immediately**, no restart needed).

## How to use

- Opening the panel automatically creates the first terminal (default `$SHELL`, usually zsh on macOS);
- **Multi-tab**: “+” in the tab bar is a menu (local terminal / SSH connection book (entries have ✎ to edit) /
  SSH connection…), ✕ closes a tab, and **double-clicking a tab renames it** (persisted with the tab); each
  tab is an independent session (local PTY or SSH channel); when the tab bar runs out of room it
  **scrolls horizontally** (with edge fades) and a **“⋯” tab list** appears at the right edge listing only
  the tabs scrolled out of view (status dot + target): one click to switch, an inline ✕ to close it (the
  list stays open so you can close several in a row);
- **Close a batch of tabs**: **right-click** any tab for a menu (Close this tab / Close other tabs / Close
  tabs to the left / Close tabs to the right / Clean up exited tabs; rows with nothing to close are not
  shown), and **middle-click** closes the tab under the pointer. The **“⋯” menu carries the same batch rows**.
  It is always present once there are ≥ 2 tabs. Actions that would **end ≥ 2 live sessions** ask once first
  (how many, and how many of those the AI opened); closing a single live session equals clicking its own ✕,
  so it does not ask;
- **“Hidden from the AI” tabs (off by default)**: the context menu gains one item — once hidden the tab is
  absent from `tty_list` and from the per-turn systemPrompt session block (which only reports “N more tabs are
  set to be invisible to the agent”), and every sid-based read/write tool refuses it. **In your own panel it
  stays fully usable.** **Tabs the AI opened do not get this item**;
- **The working directory follows the current DSH session**: new tabs open in the current session’s working
  directory (the host `cwd` configuration is the fallback);
- Supports TUIs such as vim / htop / less (TERM is injected as `xterm-256color`);
- Panel size changes are resized automatically (xterm fit → native PTY resize); **inactive tabs do not
  follow** — each keeps its own last valid size (D79: when the container is invisible or the probe is
  degenerate, no resize frame is sent at all);
- **Ctrl+F searches inside the terminal** (Enter next / Shift+Enter previous / Esc closes only the search
  box); links in the output are clickable; copy and paste use the terminal’s own shortcuts (Cmd+C /
  Ctrl+Shift+C to copy a selection, Cmd+V / Ctrl+V to paste);
- **Reconnect on disconnect**: after an abnormal disconnect such as a page refresh or a network blip, the
  session is kept alive on the host for `reconnectGraceSec` (120 seconds by default) and the client
  reconnects automatically with exponential backoff (capped at 5s); after reconnecting it **attaches back
  to the original session by sid and replays the output buffered during the disconnect**; after a page
  refresh the tab list is restored from sessionStorage (sessions already finished on the host are dropped);
- **WebGL renderer**: high-throughput output (build logs) renders dramatically faster; on WebGL context loss
  (e.g. too many tabs exceeding the browser quota) it automatically falls back to the DOM renderer;
- **Minimize**: clicking outside the modal, pressing Esc or the title-bar “—” collapses the panel — sessions
  and output buffers stay alive, and the sidebar entry shows a “running / total” badge and a status dot;
  only the floating bar’s ✕ / the title-bar ✕ really closes it and ends every session;
- **Closing the panel asks first**: while there are live sessions, ✕ opens a confirmation that states how
  many sessions this ends and how many of them the AI opened, and puts **Minimize** on the same button row;
  with only exited tabs (or none) it closes straight away (the predicate is *what would be lost*, not *how
  many tabs are open*);
- **Exited sessions no longer cover their output**: the exited state is a strip at the top of the terminal
  area (“Exited code=…” / “The AI finished this session” plus at most one action button), so output stays
  readable, scrollable and selectable; error and “reconnecting” overlays stay (they explain why there is no output);
- **“Clean up exited tabs (N)” in the “⋯” menu**: removes every exited tab in one go and makes the host
  release their read-only retention right away;
- **Tabs opened by the AI follow their session**: once the AI releases a session (`tty_close`, or `tty_run`’s
  default cleanup), its tab goes away with it; the one **you are looking at** gets one step of grace (strip +
  “Dismiss”). Sessions still in read-only retention keep their tabs, swept by the cleanup entry above;
- The title-bar ✕ closes the panel and ends every session (PTY tree-level cleanup; tmux persistent tabs also
  get kill-session); after a session exits, reopen it from the top strip (a local tab opens a fresh session
  from its spec, persistent tabs reattach to tmux, command tabs run again);
- The concurrency limit defaults to 4 (`maxSessions`, 1~16).

![Terminal panel settings card: shell / TERM / concurrency limit and so on take effect on save](https://cdn.jsdelivr.net/gh/hyzyn/dsh-plugin-kit@main/docs/dsh-plugin-kit-tty-setting.png)

## Windows hosts (best-effort)

The default shell is `%COMSPEC%` (guaranteed to exist); for PowerShell, put the full path to
`powershell.exe` / `pwsh.exe` in the settings card’s “Shell path”. **There is no POSIX wrapper layer on
Windows**: plain `[shell]`; the PowerShell family gets `-NoLogo` but deliberately **not `-NoProfile`**
(the user’s profile is where aliases and functions come from); TERM / COLORTERM are meaningless for ConPTY
and are no longer injected.

- **“Run one command” tabs** (docker exec, command tabs opened by the agent) use `cmd /c` or
  `PowerShell -Command`. **PowerShell’s `-Command` collapses a non-zero last command into process exit
  code 1** (`cmd /c exit 5` → 1, both versions), so let the command `exit 5` itself to get a concrete code
  (POSIX `sh -c` does not behave this way).
- **Input line-ending normalisation (D74)**: conhost treats Enter as **CR**, so a bare LF only moves the
  cursor down and **does not submit the command line**. For win32 local sessions the plugin turns a bare LF
  into CRLF (an existing CRLF is not doubled; non-Windows and SSH sessions pass through untouched).
- **Shell integration (OSC 133/7) depends on the shell family**: the **PowerShell family is supported**
  (`powershell.exe` / `pwsh.exe`) through a stable `-File` stub that hooks `prompt` and
  `PSConsoleHostReadLine` — yielding cwd tracking, exit codes, the `running` state and command-granular
  `tty_expect`. **cmd is not** (no command-boundary hooks), so the settings card greys the switch out and
  points at “switch the shell path to PowerShell”. `&&` / `||` are **PowerShell 7** only — on 5.1 `&&` is a
  parse error and not a single command runs.
  - **Exit-code rule**: in the PowerShell family a **parse error** runs nothing yet the D marker reports
    **0** — never judge success by the exit code alone; the error text is in the output.
  - **Stub boundaries**: it only loads through `-ExecutionPolicy Bypass` (process-scoped) — when **Group
    Policy** locks the execution policy, that parameter does not override GPO, so the stub fails to load and
    the tab opens with integration silently absent (the same degradation as “the user turned PSReadLine
    off”); the parameter also writes into `$Env:PSExecutionPolicyPreference`, which PowerShell processes
    started from that session inherit. Wrapping `prompt` also makes the user’s original prompt see its own
    `$?` as the result of our writes (always true), so failure indicators that rely on `$?` stop working.
- **Two things are not supported** (the host turns them off and the settings card explains why): **tmux
  persistence** (no tmux on Windows; SSH into a Linux host still works) and the **server status bar**
  (locally only CPU / memory / uptime are available; disk / TCP / network throughput / temperature show “无”;
  remote **Windows** hosts go through the PowerShell hop).

Full boundaries, what 0.18.1 fixed and the W6–W8 coverage of `windows-smoke` are in the
[ROADMAP § completed](./ROADMAP.md#已完成落点--门槛) section (Chinese).

## Agent tools

The plugin injects twenty tools into the agent (operations show up live in the user’s terminal; **every
call is subject to the session permission tier**, see below):

> **A zero-config install registers only 10** (conditional registration since 0.33.0): the seven `sftp_*`
> tools need an SSH connection-book entry and the three `tunnel_*` tools need a tunnel. The table is the full
> surface **once configured**; a restricted tier trims the write / exec ones further (see below).

| Tool | Purpose |
| --- | --- |
| `tty_list` | List terminal sessions (sid / kind (`local\|ssh`) / target / pid / **cwd tracked live as you `cd`** / activity time; tmux persistent sessions carry `persist`; agent-opened ones carry `owner: 'agent'`). **Includes sessions whose process has exited but which are still in read-only retention** (`exited:true` + exit code/signal); **`running` has three states plus a reason for the unknown one** (true = a command is running, do not send into it now; false = the command has finished; **omitted = cannot tell**, which is *not* the same as “idle” — the cause is spelled out in `runningUnknown`: `ssh` (the remote shell is outside this plugin’s control, **permanently** unknown) / `tmux-attach` (reattaching to tmux replays a screen repaint with no OSC markers, **recovers after the first command completes**) / `no-integration` (unsupported shell such as fish·csh·cmd, or “shell integration” turned off); the three need different next steps, so do not treat them as one sentence); the same-source `lastExitCode` / `lastExitAt` describe the previous completed command |
| `tty_books` | List **connection-book entries** (`name` / `host` / `port` / `username` / auth method / tmux persistence / jump host or proxy command), **never any credential**. The `book` of `sftp_*`, the `bookName` of tunnels and the docker target’s “connection book” dropdown all reference `name`; **`book` also accepts `host` or `user@host`** (resolved only on a unique match — ambiguity lists the candidates instead of guessing). When the name is uncertain, call this instead of guessing or reading config files |
| `tty_open` | **Open a terminal session yourself**: a local shell, or a command via `command` (dev server / watch; it runs as **a whole piece of code in the host shell’s syntax**, Windows cmd / PowerShell use their own syntax; *not* subject to the “single line ≤2000” client rule, D78), with optional tmux persistence via `persistName`; the current shell and syntax are restated every turn in the systemPrompt terminal line. The session **shows up in the user’s terminal panel** as an ordinary tab the user can see and take over — never a hidden session |
| `tty_close` | Close a session opened by `tty_open`. **Only the agent’s own sessions may be closed** (a user-opened tab is refused, so the agent never ends a terminal the user is working in). It also works on an **exited session still in read-only retention** — that is its release entry point |
| `tty_run` | **One-shot command**: open a session, run `command`, wait for it to finish and return the tail output + exit code directly (collapsing open → wait → capture → close into one call). It **closes the session once the command finishes** by default; `keep:true` leaves it in read-only retention. If it is still running at `timeoutSec` (1~600, default 120) it returns `running:true` and **does not kill the session**; when the caller cancels (`exec.signal`) it returns `cancelled:true` immediately — that cancels this call, **not the command**. Use it when the user should **see** the command or when it must run inside a terminal session; for purely non-interactive commands bash is more direct |
| `tty_stats` | Read live host metrics for a session’s machine: CPU / memory / disk / TCP / network rates / temperature / uptime / 1-minute load / swap / SSH round-trip. Local sessions report the host; SSH sessions report that remote host over a separate non-PTY channel that never touches the terminal |
| `tty_capture` | Read recent output (last N lines, ANSI stripped by default, `raw:true` for the raw stream); **`last:true` returns only the output + exit code of the previous completed command** (shell integration markers); when a command is **in flight** it returns `inProgress:true` without the stale result. **A command-type session has no “previous command”**, so `last:true` errors explicitly and points at `lines` (D87) |
| `tty_screen` | Read the **currently visible screen** as rendered (xterm-headless virtual screen, plain text) — it can genuinely read TUI interfaces such as vim / htop / menus. The text is tail-capped at 32KB; beyond that it returns `truncated:true` |
| `tty_expect` | Wait with a regex for a readiness signal. It **looks back first** at output that has not been read yet (including the full output of “the previous command”, so a command that finished instantly no longer burns the whole timeout) and then waits for subsequent output; on a hit it returns `matched:true` plus `matchedFrom` (`live` / `last` / `buffered`). A timeout does not throw (`matched:false` + tail output, and it **does not consume the unread region**), and a command that ends early returns early with its exit code; **the echo of the command just sent never counts as a hit** (the OSC 133 A..B boundary, or the send record where there are no markers; when only the echo ever matched the result carries `echoOnly:true`); at most 5 in-flight calls per session, and the accumulated window keeps only the last 64KB; a caller cancel settles as `cancelled:true` |
| `tty_send` | Send text and/or keys to a session. **Use the named `keys` for control and arrow keys** (`["C-c"]`, `["Down","Down","Enter"]` — a whitelisted lookup: an unknown name errors out instead of being silently sent as a literal), and **never hand-build escape sequences inside `data`** (`"\x1b[B"` gets printed as ordinary characters); give at least one of `data`/`keys`, and when both are present `data` goes first followed by `keys` in order. End a command with `\n` (a local Windows session normalises it to CRLF, D74). On an **exited** session it fails explicitly |
| `sftp_list` | List a remote SSH directory (name/type/size/mtime, directories first); `book` is the connection-book entry name and `path` defaults to the login home; at most 500 entries by default (`truncated:true` beyond that), and `isSymlink` distinguishes a symlink |
| `sftp_read` | Read a remote **text** file (≤256KB by default, adjustable to 1MB, truncated beyond that); `offset` pages from a given byte, an invalid `maxBytes` errors out, and binary detection is a double test (NUL + illegal-UTF-8 ratio) |
| `sftp_write` | Write a remote text file (overwrite by default, `append:true` appends; ≤1MB per call) |
| `sftp_mkdir` | Create a remote directory; `parents:true` fills in missing parents level by level (equivalent to `mkdir -p`, existing directories skipped idempotently) |
| `sftp_rename` | Rename/move a remote file or directory (a `to` in a different directory means a move; never overwrites an existing target) |
| `sftp_remove` | Delete a remote file/directory; a directory uses rmdir by default (a non-empty one errors explicitly), and `recursive:true` deletes the whole tree (irrecoverable); paths pointing at `/`, `~`, or containing `.`/`..` segments are refused |
| `sftp_tree` | Recursively list a remote directory structure (depth-first, directories first; `maxDepth` 1~8 / `maxEntries` 1~2000 cap it, `truncated:true` when exceeded; symlinks are not followed, to avoid cycles) |
| `tunnel_list` | List port-forwarding tunnels and their live state (active/connecting/error/stopped, rules, connection counts); `fatal:true` = needs a human (local listen failure / missing book entry), **never retried automatically** |
| `tunnel_start` / `tunnel_stop` | Start or stop one tunnel (`name` comes from `tunnel_list`). These **rewrite the configuration** — the same thing as ticking/unticking “Enable” in the settings card (settings → hot apply → `reconcile`). The returned snapshot usually still says `connecting` (dialling is async); call `tunnel_list` again for the final verdict |

### Session permission tier gate (tier gate)

Tools are classified by risk; **every call** is judged against the session’s permission tier
(Read Only / Workspace Write / Full access / Auto review) and allowed, asked, or denied — the tier is
switched by the user in the session, and the very next call follows the new tier:

| Class | Tools | Behaviour under a confined tier (Read Only / Workspace Write) |
| --- | --- | --- |
| Read | `tty_list` `tty_books` `tty_capture` `tty_screen` `tty_expect` `tty_stats` `tunnel_list` `sftp_list` `sftp_read` `sftp_tree` `tty_close` | Allowed on every tier |
| Write (bounded mutation) | `sftp_write` `sftp_mkdir` `sftp_rename` `sftp_remove` `tunnel_stop` | Approval prompt (runs only if the user allows this one call); deterministically denied when unattended (approval policy `never`) |
| Execute (unbounded command surface) | `tty_open` `tty_run` `tty_send` `tunnel_start` | Same — these tools can run arbitrary commands on a local or remote shell and open listening ports |

**Full access never prompts**; under **Auto review the plugin does not add its own prompt** (the host’s model
pre-review already examines every call). When the host has not composed the `sandboxPolicy` / `approval`
services the gate is **off**, and the startup log says
`tier-gate: services absent (…), per-call gate disabled`. The mechanism (decision matrix / the two-layer
relationship with `allowProxyCommand`) lives in
[docs/permission-tier-plan.md](../../docs/permission-tier-plan.md).

**A Read Only session does not even see the tools it cannot use** (`tools.restrict`): when the tier is Read
Only, the plugin drops the Write and Execute classes from that session’s **agent-scoped** tool table — the
agent sees 11 tty tools instead of 20. **The per-call matrix above is still the security boundary**: trimming
merely removes, up front, the tools that cannot succeed under the current tier; a missing name, or a tool
registered after the session started, only affects what the model can see, not what it may do. **Full access,
Auto review and Workspace Write are not trimmed** — Workspace Write runs Write / Execute through a per-call
`ask` (one click and it runs), so tools that *can* succeed must not be hidden (2026-11-05 correction: the
old rule hid the whole default tier, pushing users to the prompt-free Full access tier just to get work
done). **A mid-session tier switch does recompute** (upgrades put the tools back, a drop to Read Only removes
them again, both before the next model request).

**The prompt never names a tool that may have been trimmed** (D103): the per-turn systemPrompt terminal block
only says “operate by sid” plus “**available tools are whatever is in your tool table**”, and gives the way out
when they are missing (under Read Only, ask the user to switch to Workspace Write — usable, but every call
asks — or use the sandboxed bash tool). It no longer claims “use `tty_send` … open/close with `tty_open`” —
that wording was not same-source with the tool table, so the model kept calling tools that were not there.
Guards: two counter-example cases in `test/tty-list-running.test.ts`.

Typical agent flow: for a command that simply runs to completion, use `tty_run` to get its output + exit code
in one call; for a **long-lived** session use `tty_open` → `tty_send` starts the command → `tty_expect` waits
for the readiness marker → `tty_capture{last:true}` gets that single command’s result → `tty_close`.
A dynamic context is also registered in `systemPrompt`, so every turn carries a snapshot of active terminals
(sid / kind / cwd / owner, plus a `[running]` marker) without calling `tty_list` first.

**Agent-opened session boundaries**: a session opened by `tty_open` is an **ordinary tab in the panel**
(marked “agent”) — the user can see it, take it over and close it. Hidden sessions are deliberately not used.
Such a session has no client bound from birth, so it is **not reaped by the orphan collector**; it ends via
the agent’s `tty_close` or the user closing the tab. Conversely the agent **cannot close a user-opened tab**.

### Read-only retention after the process exits (D77)

A process exit **no longer means the session is gone** — the session turns into a **read-only retained** one,
**kept until it is explicitly closed** by default (`EXITED_RETAIN_MS = ∞`; a host/plugin restart clears them).
While retained:

- **Reads keep working**: `tty_capture`, `tty_screen` and `tty_list` (entry carries `exited:true` +
  `exitCode`/`signal`) still answer; `tty_expect` no longer burns its timeout — it settles against the
  existing output and returns `exited:true`;
- **Writes are refused**: `tty_send` reports an explicit error (the process is gone; a write would vanish
  into a dead PTY), `tty_stats` no longer applies to it (honestly returns `available:false`), and the
  panel's `resize` is meaningless as well;
- **No re-attaching a terminal**: `attach` is explicitly refused (there is no live PTY; the panel does not
  create a tab for it either);
- **Who releases it**: the agent’s `tty_close` (its own sessions only), the user closing that tab in the
  panel, or a host/plugin restart. The concurrency limit counts **live sessions only** (retained ones do not
  consume a slot, and the client’s “+” pre-check counts the same way). At most `MAX_EXITED_SESSIONS` (16)
  retained sessions are kept — the oldest is evicted beyond that (each eviction logs the sid it drops).

Retention is deliberately **not time-based**: memory and handles are not actually time-driven, and a deadline
is a second surprise for whoever reads the output (the gap between “the command finished” and “the next round
reads the result” can be arbitrarily long). If you do want a time bound, set `EXITED_RETAIN_MS` to a
millisecond value / 0 — the `reapExited` path is still wired in. The full fix and its regressions are in
[DEFECTS D77](./DEFECTS.md).

### Shell integration (OSC 133/7, 0.4.0)

On POSIX, hooks are injected through the existing `-c` wrapper layer according to the shell type; on Windows
the PowerShell family gets a stable `-File` stub instead. Both are transparent to the user and change no rc:

- **zsh**: `ZDOTDIR` points at a temporary stub directory (the same approach VS Code uses); the stub sources
  the user’s original rc first and then appends `precmd`/`preexec` hooks;
- **bash**: an `--rcfile` stub (sources `~/.bashrc` first); the command-start marker has two variants by
  version: bash ≥ 4.4 uses `PS0`, bash < 4.4 (the 3.2 shipped with macOS) falls back to a **DEBUG trap**
  (the handler filters by `$BASH_COMMAND` to drop fires caused by the PROMPT_COMMAND machinery itself). Side
  effect: internal commands of compound commands such as loops emit extra B markers, which only affects where
  `tty_capture{last}` starts capturing for those commands;
- **PowerShell (Windows)**: the `-File` stub (pure ASCII — 5.1 reads .ps1 by the ANSI code page) wraps
  `prompt` and `PSConsoleHostReadLine`, with the user’s profile still in effect. Exit-code rules are in the
  “Windows hosts” section;
- Marker semantics: `133;A` prompt start / `133;B` command start / `133;D;<exit>` command end with exit code /
  `OSC 7 file://…` cwd reporting (`tty_list.cwd` follows `cd`, and SSH sessions report the remote path);
- Other shells (including Windows cmd) are silently disabled; `shellIntegration: false` turns the whole thing
  off (escape hatch).

**Look-back matching and the read watermark (D72)**: `tty_expect` first looks back at output that **has not
been read yet**, with the lower bound raised to “just after the last `B` marker” inside the unread region —
the echo sits between `A` and `B`, so text in the echo never counts as a hit (deliberately no text comparison
here: line wrapping / ANSI / multi-line paste would break it). **Environments without `B` markers**
(integration off / Windows cmd / a remote host without the hooks / PSReadLine turned off by the user) exclude
- **Three-layer `ZDOTDIR` resolution (0.38.0)**: the wrapper and the tmux inner launcher share one rule — the
  `DSH_TTY_ORIG_ZDOTDIR` inherited from a parent session → the inherited `ZDOTDIR` (**only when it is not the
  stub directory**) → `$HOME`. The second layer's exclusion matters: when one dsh is started from another
  dsh's terminal panel, the host process env already carries the stub as `ZDOTDIR`, and using it makes the
  stub `source` itself → zsh recursion (`job table full or recursion limit exceeded`) → the local session
  gets no OSC 133 markers at all. The stub files carry a self-healing fallback on top of that.
the echo by a different test (D75 / D101): the command lines that the most recent `tty_send` submitted are
stripped out of the candidate text and the pattern is retried — only “no longer matches after stripping”
counts as a pure echo; a timed-out wait that only ever matched the echo carries `echoOnly:true`.

**Read watermark**: whatever `tty_capture` / `tty_expect` returns counts as read, and later `tty_expect`
calls will not look back at it; `tty_screen` deliberately does **not** advance it, `tty_send` only
initialises it, and **a timeout does not consume the unread region** either (another pattern can still look
back at the same output). Use `tty_capture` to re-read older output.

SSH sessions are scheduled on the same table: entries with `kind: 'ssh'` in `tty_list` are identified by
`target` (user@host[:port]), and `tty_capture` / `tty_expect` / `tty_send` are used exactly as for local sessions.

### Credential storage (a connection password need not stay plaintext)

Under **Password** in the connection dialog sits a **credential storage** row: tick “store when saving” and
the password is written to the **official credential store**, leaving only an `env:NAME` reference in the
field (the value lives in `~/.dsh/.credentials.yaml`, never materialized into the environment and never sent
back to the browser). **It is ticked by default** (whenever the host provides `remote.credentials`); when the
host lacks that service the box is disabled, with a note that only plaintext saving is available.

- **It rides along with saving — no extra click**: the tick is executed by “save changes” / “connect (and
  save)”, so there is no dangling reference from “stored but not saved”. **Without “save to the connection
  book” it never touches the store** (there would be no configuration to reference the value, only an
  orphan). The settings card’s inline editor is the same row with the same default, except that its commit
  entry point is “apply”.
- **Two side effects of the default**: (1) editing an older connection whose password is **plaintext** and
  saving any unrelated field also moves the password into the store (untick the box if you do not want
  that); (2) when the store refuses the write, **saving is aborted** and the official verbatim error is
  shown, rather than quietly falling back to plaintext.
- **Name rule**: `DSH_TTY_<username>_<host>[_<port>]_<field>`, where the port is **omitted when empty or 22**;
  `field` is `PASSWORD` / `PASSPHRASE`; e.g. `operator@192.0.2.10:22` →
  `DSH_TTY_OPERATOR_192_0_2_10_PASSWORD`. It is **derived from the resource identity and carries no hash**
  (host and username are ASCII identifiers already); the connection name never takes part in the key, so
  renaming a connection never changes it. An empty host or username is refused.
- **Resolution path**: connecting, the probe, SFTP and tunnels all funnel through one `buildConnectConfig`,
  whose `env:NAME` is resolved by the **official credential provider** (re-resolved per operation — a change
  lands on the next operation). Only when the provider has no such reference, or the host has no such
  service, does it fall back to `process.env`. **Why the provider is mandatory**: values in the credential
  store are **never materialized into the environment**, so reading `process.env` alone means “a stored
  password is unreadable at connect time”.
- **Visibility**: the dialog’s reference picker lists the names the store already holds — the host-side
  `/api/dsh-tty/credential-refs` reads back only the `refs:` keys (names only; values never leave the host).
  This is a deliberate deviation from the official “references are not enumerable” design (names reach the
  browser, values do not).
- **The conservative boundary**: `~/.credentials.yaml` is a **0600 plain file with no master password and no
  OS keychain** — it keeps out **other OS users**, not processes running as you, and it is **local to the
  machine** (re-store after moving). Prefer a key / agent over storing a password (both are supported).

## Port forwarding (0.5.0)

The “Terminal Panel” card’s “Port forwarding” block maintains tunnels; each tunnel references one
connection-book entry (host and authentication follow it), in two directions:

- **Local forwarding (-L)**: listen on local `127.0.0.1:localPort` → connect to `remoteHost:remotePort` on the
  server side over SSH (the most common use: `localPort=5432 → db.internal:5432`);
- **Remote forwarding (-R)**: the server listens on `remoteHost:remotePort` (default 127.0.0.1) → inbound
  connections dial back to the local `localTargetHost:localTargetPort`;
- **The host owns the lifecycle**: tunnels are independent of terminal tabs (each has its own SSH
  connection), so they keep running after the panel is closed; SSH drops reconnect with exponential backoff
  (1s→15s cap), and the remote direction re-forwards on reconnect. **Exception**: a local listen failure /
  missing book entry needs a human — the state stays at `error` with `fatal:true` and is **never retried**;
- **Multiple profiles must use different localPorts**: port forwarding is a machine-level resource while
  configuration is stored per profile; two profiles grabbing the same port → the later one gets
  `EADDRINUSE`, and the error names “possibly another DSH profile’s host process”;
- **Ports are probed when saving (0.26.0)**: on save the host probes the local ports (exclusive probe,
  released immediately on success), surfacing “two tunnels share one localPort” and “the port is taken by
  something outside this process” at save time. **A probe only warns, it never blocks saving** (shown as a
  yellow warning; hard-rejecting a whole-table submit would lock the user out of saving anything). Ports
  this process already holds are exempt; a disabled tunnel still counts as a name conflict; the remote
  direction’s `remotePort` is listened on the server and is not probed locally.
- **Status badges**: while the card is expanded it polls live state every 2s (active green / connecting blue /
  error red / stopped gray + last error); the “+” menu shows a `⇄N` badge on book entries; agents query with
  `tunnel_list`;
- **Connection-bar entry**: a connection **with an enabled tunnel** gets a permanent “Tunnel N” button;
  without one it folds into “**⋯ More**” (a discovery path that costs no permanent width). Tunnels must
  reference a book entry, so only entry-based connections have this entry;
- **Form layout**: the direction is a **segmented control**, both ends are shown as a “**host:port**” pair
  with an **arrow** between them indicating the data flow (flipped for -R). Each direction has **exactly one
  fixed end** (-L: `127.0.0.1` on the left; -R: `127.0.0.1` on the right), rendered as static text rather
  than an input box;
- **Editing**: each row’s “Edit” fills the form below and the button becomes “Save changes / Cancel”; saving
  locates the original by **its old name** (the name is derived as `<book entry>-L<local port>`, so “change
  the port” means a new name), and `enabled` keeps its value; a name collision is an explicit error;
- **A local listen failure is sticky**: the state stays at red `error` with the reason, and is not overwritten
  by SSH-side retries; recover by changing the port or freeing it;
- TOFU shares the same `hostKeys` pinning as terminal sessions; ports do not consume a `maxSessions` slot.

## SFTP file transfer (0.7.0, enhanced in 0.8.0/0.9.0)

Remote file operations directly over the SSH connection, without touching the terminal or consuming a session
slot (`ssh2`’s sftp subsystem, host half `src/sftp.ts`):

![SFTP single-pane (docked under the terminal since 0.16.0): remote directory browsing with inline download / rename / delete](https://cdn.jsdelivr.net/gh/hyzyn/dsh-plugin-kit@main/docs/dsh-plugin-kit-tty-sftp-dialog.png)

![SFTP dual pane (0.9.0; docked under the terminal since 0.16.0): local on the left / remote on the right, inline ⇨/⇦ server-side transfer](https://cdn.jsdelivr.net/gh/hyzyn/dsh-plugin-kit@main/docs/dsh-plugin-kit-tty-sftp-dual.png)

- **Placement (0.16.0)**: while the terminal panel is open and **this tab’s** mount slot is free, file browsing
  docks **under the terminal** (path bar / list / transfer progress use the full width) and the terminal
  stays visible and usable; the height is draggable and collapsible to a title bar. When the slot is taken by
  another pane, or the panel is closed, it falls back to the centered dialog (never evicting someone else’s pane);
- **Follows the tab (0.19.0)**: a file browser belongs to the tab that opened it (it is connected to that
  host): switching tabs collapses it (transfers keep running, and it is still there when you come back), and
  closing the tab removes it. Every entry point uses the same rule;
- **Entry points**: (1) book entries in the “+” menu carry 📂; (2) the SSH dialog’s “File browsing” button
  (works without saving a book entry); (3) the “SFTP” button on an SSH tab’s connection bar (belongs to that tab);
- **Operations**: directory browsing (path box + Enter to jump, `..（parent directory）`, a single click on a
  file downloads it), **upload** (multi-select, XHR streaming + progress; **drag & drop** since 0.8.0 —
  folders expand recursively via `webkitGetAsEntry`, directories created with mkdir parents), **download**
  (POST → Blob → `<a download>`), **new directory**, **rename** (inline editor), **delete** (🗑 with a second
  click; a directory is deleted with `recursive`);
- **Progress and cancel**: a thin progress bar + percentage sits at the right of the status row (downloads
  compute it from `content-length`, falling back to transferred bytes); ✕ cancels a transfer — uploads abort
  the in-flight XHR, downloads use `AbortController`, dual-pane transfers send a host-side cancel, **half
  files are deleted automatically**, and the status row says “cancelled”; closing the browser also stops
  in-flight transfers;
- **Connection management**: a lazy pool — the SSH connection is created on first use, reaped after 120s of
  idleness, and reconnected on the next operation; book entries are resolved on every (re)connect (a changed
  password is used next time); TOFU shares `hostKeys` with terminal sessions and tunnels;
- **Resumable downloads (0.25.0, panel downloads)**: a download interrupted mid-way **resumes from the bytes
  already received** — the host’s `/sftp/download` accepts `offset` (>0 returns 206 + `content-range` with
  `content-length` reporting the **remaining** length; `offset ≥ file size` returns 416). The rule lives in
  `client-src/download-resume.js` (`planResume`): **an explicit ✕ never resumes**, zero progress does not
  resume, retries are capped (3 by default), and the progress bar does not reset while resuming. Directory
  transfers are still full re-sends;
- **Dual-pane drag & drop and hidden files (0.25.0)**: drag an item onto the **remote pane** to upload it to
  that pane’s current directory; dragging onto the **local pane** says explicitly “no action available”
  (decided in `client-src/sftp-view.js`’s `planDrop`). Each pane’s toolbar has a “hidden files” toggle
  (preference stored in localStorage); **filtering happens in the renderer only** — the host `list` and
  `sftp_list` always return everything;
- **Transport**: `POST /api/dsh-tty/sftp/list|mkdir|rename|remove|download|upload` (all behind the loopback
  fence); `download` also takes an optional `offset`. Connection specs travel in the JSON body or in the
  upload’s `x-dsh-sftp-meta` header (base64url) — **credentials never go in the URL/query string**; uploads
  and downloads are streamed pipe to pipe, not buffered whole in memory;
- **Agent tools**: `sftp_list` / `sftp_read` / `sftp_write` / `sftp_mkdir` / `sftp_rename` / `sftp_remove` /
  `sftp_tree` — they only accept a `book` entry name, **never inline credentials**;
- **Dual-pane style (0.9.0, config `sftpStyle`)**: local on the left / remote on the right; the local side
  goes through the `/api/dsh-tty/local-fs` routes; inline `⇨ / ⇦` copies an item to the opposite pane’s
  current directory (`/api/dsh-tty/local-fs/transfer` streams it server-side, directories recursive, same
  name overwritten, **bytes never pass through the browser**). Switched in the settings card and applied when
  SFTP is reopened.

## Session persistence (tmux, 0.10.0)

The default security model is unchanged: sessions live and die with the host (kernel-level PTY cleanup). For
work that must outlive the host (dev servers, builds, training jobs), open a **persistent terminal** — the
session is delegated to a tmux server (dedicated socket, fully isolated from your own tmux), so it survives
disconnects and even a host restart:

> **The socket is per profile** (since 0.25.0): `tmux -L dsh-tty-<profile>`, and the runtime assets
> (`<DSH_HOME>/tty/<profile>/`) are layered to match — multiple profiles never see each other’s persistent
> sessions. **A host started without a profile keeps the historical name `dsh-tty`**, so a single-profile
> user’s behaviour and paths are **unchanged after upgrading**.

- **Entry point**: choosing `tmux` for “Session persistence” in the settings card is the only switch — once
  on, **every new tab is persistent by default** (“+” menu’s local terminal, book entries, the SSH dialog
  (“persistent session” ticked by default, cancellable per connection));
- **Per-entry opt-out (`sshHosts[].persist`)**: the checkbox on a book entry stores an **opt-out** — an entry
  with `persist: false` is no longer tmux-managed, while every other entry follows the global switch (entries
  imported from `~/.ssh/config` are unaffected);
- **Mechanism**: spawn/ssh frames carry `persist` plus a stable `persistName` generated by the client and
  saved with the tab spec — locally the `-c` wrapper is replaced by
  `exec tmux -L <socket> -f <conf> new-session -A -s dsh-<name>`; for SSH the remote side runs
  `exec tmux -L <socket> -f /dev/null new-session -A -s dsh-<name>` with a pty channel. `-A` is
  attach-or-create: after a host restart a reopened tab reattaches by name;
- **Recovery path**: after reconnecting, the browser queries `sessions`; for persistent tabs whose sid is gone,
  the client respawns with the original persistName. The keep-alive reaper only kills the PTY (the tmux
  client), **not the tmux session**, so it can still be reattached. An in-host reconnect (attach) does **not**
  replay the host buffer for tmux sessions; it forces one `tmux refresh-client` redraw instead (replaying
  would double-draw). Persistent tab specs are also written to **localStorage** (sessionStorage is only
  visible to the same browser tab, so a new window would otherwise restore nothing);
- **Close semantics**: a kill frame (tab ✕ / closing the panel) runs `tmux kill-session` before killing the
  client — a real end rather than a detach. Closing the whole page keeps sessions alive by default (they can
  be reattached after the keep-alive window); `endOnPageClose: true` also ends the tmux session when the
  keep-alive window expires;
- **Shell-integration compatibility**: tmux swallows escape sequences it does not know — the hooks detect
  `$TMUX` and wrap OSC 133/7 in a DCS passthrough envelope (ESC doubled inside the payload); tmux ≥3.3 with
  `allow-passthrough on` (written by the host into the stub conf) unwraps and forwards it.
  `tty_capture{last}` gets a separate correction: before sending D the hook runs `capture-pane` and streams
  the result as `OSC 133;T` (base64, last 200 lines), which the host prefers as the command output;
- **Runtime assets**: a stable stub directory under `<DSH_HOME|~/.dsh>/tty/` (the tmux server outlives the
  host process, so a temp directory will not do): `tmux.conf` (status off, true-color overrides,
  `default-command` pointing at the inner launcher) and `inner.sh` (execs the inner shell with the current
  configuration). Config changes apply to new panes; `tmux.conf` itself is read only when the tmux server
  first starts;
- **Degradation**: when tmux is not installed locally/remotely, a persistent spawn falls back to an ordinary
  session and prints one gray line in the terminal.

## SSH connections

Besides local terminals, the tab bar’s “+” also opens **SSH tabs**: the host half establishes the connection
natively with `ssh2` and opens a shell channel (not through a local ssh process, not via node-pty), wrapped
into exactly the same session object as a local PTY — input, resize, close, output buffer, backpressure and
agent tools all reuse the same scheduling.

- **Three entries in the “+” menu**: local terminal / **SSH connection book** (entries carry 📂 file browsing
  and ✎ edit) / SSH connection… (a form; you may save before connecting, and “File browsing” at the bottom
  skips the terminal and opens SFTP directly);
- **Connection book**: ticking “save to the connection book” in the dialog stores an entry (same name
  overwrites, an empty name uses the host name); the menu entry’s ✎ and the settings card’s **Edit** use the
  **same form** (three groups: connection / authentication / options, plus credential storage + reference
  picker + test + file browsing), supporting rename and duplicate-name validation. The “connection book name”
  row is **always visible**: typing a name ticks save automatically and clearing it unticks. The dialog is a
  **three-part shell** (title and bottom action row fixed, only the middle scrolls); low-frequency items (jump
  host / proxy command / host-key alias) live in an “**Advanced**” fold;
- **Authentication (auth), one of three**:
  - `agent` (default) — through ssh-agent (`SSH_AUTH_SOCK`), credentials never hit disk, most recommended;
  - `key` — a private key file via `keyPath` (`~` may be omitted), optional `passphrase`;
  - `password` — password authentication, also wired to keyboard-interactive (many servers only enable that);
- **Passwords / passphrases accept `env:VAR`**: resolved through the **credential layer** — the official
  credential provider first, falling back to the host process environment (pair it with dsh-env-manager to
  keep secrets out of the settings file); a resolution failure names the reference and both missing sources;
- **Port**: default 22; a non-default port shows as `user@host:port` in the target;
- **Discoverable names (D104)**: the same machine usually carries three names — the connection-book entry
  name (what `book` / `bookName` really takes), the docker target name, and the `user@host` shown in the panel.
  So `book` accepts `host` / `host:port` / `user@host` in addition to the entry name (**resolved only on a
  unique match**; several entries on one host list the candidates instead of guessing), plus the **docker
  target name** (read from the docker namespace as “target → the entry it references”, topology only, never a
  credential; degrades when docker is absent) — so the `kb-target` shown on the card can be passed as `book`
  directly. When unsure, enumerate with `tty_books` (it lists the alias table too); a miss lists the
  **available entries** (`name — user@host:port`, no credentials) instead of just saying “not found”;
- **Host-key alias (`hostKeyAlias`, 0.25.0)**: TOFU locates records by **connect address** by default, while
  the same real host is often reached through different addresses (an internal IP behind a bastion, or
  `127.0.0.1:2222` through a tunnel) — “same key, different record” then flags **a key change** on every
  address switch (a false MITM alarm that refuses the connection). Filling in one alias makes them share a
  record; semantics match OpenSSH’s `HostKeyAlias` (**only decides which record the fingerprint lives in, not
  the connect address**);
- **Labels and status**: an SSH tab is titled by its connection name or `user@host` (local tabs are “Terminal
  N”); the status bar describes the **currently active tab** — switching or closing tabs swaps in that tab’s
  own state (failure reasons and exit codes are recorded on the tab), and a background tab’s own failure does
  not overwrite the active tab’s display;
- **`~/.ssh/config` import**: parses `HostName/User/Port/IdentityFile` into candidate entries (wildcard blocks
  and entries without User are skipped, `Include` is not expanded), skips same names, and writes them with
  “Save”. **Every kind of skip is explained on the spot**; `ProxyJump` is resolved into the entry’s jump host
  (single hop) and imported too, while `ProxyJump none` / `ProxyCommand none` are explicit direct connections
  and import normally; `ProxyCommand` is **never imported automatically** (it only runs after being typed
  manually with the switch on);
- **Proxy command / ProxyCommand (0.21.0, off by default)**: a book entry (or the dialog) may carry a **local
  command** whose stdin/stdout become the SSH transport to the target (typically `ssh -W %h:%p bastion`).
  `%h` `%p` `%r` `%n` `%%` are supported; **substituted values are whitelisted to alphanumerics and
  `._@:[]-` — a value containing shell metacharacters is refused outright**. **Gate**: the settings switch is
  **off by default** and can be elevated two ways: (1) the startup environment variable
  `DSH_TTY_ALLOW_PROXY_COMMAND=1` (only the inherited `process` layer counts — writing a project `.env` or
  `~/.dsh/env.yml` is **not** authorization); (2) **in-place elevation** (no restart): click the switch → the
  panel gives a “run in the host terminal” command → executing it unlocks within ten seconds. HTTP / the UI
  **cannot open it out of thin air** (passing `true` without authorization is rejected with 400), but
  **closing** it always works. Authorization is **persistent** (`<DSH home>/dsh-kit/capability-grants.json`,
  0600): it applies after a host restart and the card shows the time plus a “revoke” entry. When off, a
  connection carrying a proxy command **fails explicitly instead of falling back to a direct connection**.
  With a jump host also set, OpenSSH semantics apply: **the jump host wins**. The gate lives in one place
  (this plugin’s settings): the docker container panel reads the same switch. Like jump hosts, **it is a
  separate transport whose teardown must pair** (all four paths share one `dispose()`);
- **Credential reference picker**: next to the password/passphrase field is a filter box + capped list;
  candidates = **names already in the credential store** (the host reads the `refs:` keys of
  `.credentials.yaml`, **names only, never values**) ∪ **references already used in the connection book**;
  clicking fills `env:NAME`, and you may type any name. With no candidates at all the row **degrades to a
  single explanatory line**. The settings card’s edit form has the same row and the same candidates (inline
  there rather than a popover);
- **Host-key TOFU pinning**: after the first successful connection the host’s (host:port) sha256 fingerprint is
  recorded in `hostKeys` (persisted with settings); every later connection verifies it and any recorded
  fingerprint matching is allowed, while **a changed fingerprint refuses the connection** (anti-MITM) with
  reset guidance. Multiple keys of the same host (e.g. rsa + ed25519) are kept as separate fingerprints in one
  record. After a host reinstall/key change, delete the record in “SSH host key records” and reconnect.
  **“Import from known_hosts”** prefills them in bulk (all records of a host are kept);
- **Connection test**: the settings card’s row-level “Test” and the dialog’s “Test” both do **link diagnosis
  only** (no session, no slot, no shell): TCP pre-check first (DNS + connect, classified as
  refused/timeout/DNS/unreachable), then an ssh2 handshake for TOFU comparison, then authentication. The
  entry’s “Test” performs full TOFU (recording a new fingerprint on first test); the dialog’s only compares
  and does not persist;
- **Counts against `maxSessions`**; closing behaves like a local session: tab ✕ / a `kill` frame closes the
  ssh2 channel, and an `exit` frame still carries the exit code / signal.

## Server status bar (0.17.0)

![Minimal-mode server status bar + the same resource dashboard: CPU / memory / network, each with a ~60-second trend line and a large number](https://cdn.jsdelivr.net/gh/hyzyn/dsh-plugin-kit@main/docs/dsh-plugin-kit-tty-stats.png)

(The full-mode bar is in the screenshot at the top; a **three-state button** at the top right of the panel
header switches between them. Both screenshots are SSH sessions; local sessions use the same fields.)

Each **visible** tab carries a thin status bar above the terminal showing that session’s host metrics in real
time (styled after FinalShell):

    CPU ▮▮▯▯ 6% │ 核心 16 │ 内存 ▮▮▮▮ 78% (49.6/62.3 GB) │ 磁盘 ▮▮▮ 63% (40.8/68.8 GB) │
    在线 2w4d7h16m │ TCP 570 │ CPU温度 无 │ 网络 ↓92.3K/s ↑93.1K/s

- **One item per resource**: percentage, mini meter and used/total share one group
  (`内存 78% (49.6/62.3 GB)`), and the label appears once.
- **Cells appear by machine capability**: `CPU温度` / `Ping` / `Swap` only appear when **this session has
  reported that field** (Linux `/sys/class/thermal`, `/proc/meminfo`, SSH round-trip; macOS local and most
  cloud hosts have no temperature sensor). The test is “has ever reported it”, not “does this frame carry
  it” — an occasional sensor read failure must not make the cell flicker every second.
- **Minimal mode**: the header’s **three-state button** cycles full → minimal → hidden; the minimal bar keeps
  only **CPU / memory / network** (plus Ping / Swap when available), each as “small label + last-60-second
  trend line + large number”. Line colour follows the tier: **<80 green / 80~90 orange / ≥90 red**
  (`STATS_WARN_LIMIT`, the same source as the 80% dashed guide); network uses a square-root scale with a
  64 KB/s floor (linear would flatten everything but a burst), and dropped frames are drawn as gaps.
- **Resource dashboard (floating)**: the **▾** at the right end expands a card with three columns — **CPU**
  (one bar per core, orange/red at the 80/90 thresholds, the title reports the worst core), **network I/O**
  (last-minute up/down lines, downstream thicker and brighter, upstream thinner and dimmed; fixed 60-second
  x-axis; 1-2-5 range + square-root y-scale), and **processes** (Top 5, the host samples `ps` every 5 seconds
  and sends the union of top-5 CPU and top-5 memory; column headers switch between CPU / memory sorting;
  process names are middle-truncated by executable name).
- **Item hover card**: resting on a cell for 140ms pops a small card — the first line is the **current**
  reading, the following lines the **1-minute peak** plus context (cores for CPU, used/total for memory). The
  peak comes from 60 samples the client accumulates; gaps do not participate and are not treated as 0; a cell
  with no data does not pop a card.
- **“Load / time” on the right**: `负载 0.15 │ 10:45:23`; load comes from `/proc/loadavg` (macOS uses
  `os.loadavg()`, and Windows hides the cell when unavailable); the clock has its own 1s timer, not the stats frame.
- **Give-way ladder**: the whole bar hides cells in **one** order — **cores → uptime → clock → load + clock
  as a group** — stopping as soon as it fits. Live metrics (CPU / memory / disk / TCP / Ping / Swap / network /
  load) are never dropped. The test is **real overflow** (`scrollWidth > clientWidth`) rather than a width
  calculation, recomputed from “show everything” every frame.
- **Two collection paths, one frame shape**: an SSH session opens another **non-PTY exec channel** on the same
  ssh2 connection and the remote side runs a resident loop printing one JSON line per second; local sessions
  are sampled by the host itself (Linux reads `/proc`, macOS uses os/netstat/vm_stat). Neither path touches
  the PTY data stream. Remote platforms cover Linux / Windows (PowerShell fallback), and a macOS/BSD remote
  gets nothing — the whole bar hides.
- **Subscriptions, lazy start**: the client sends `{t:'statsOn'}` / `{t:'statsOff'}` by tab visibility, and the
  host only starts collecting on the first subscription; unsubscribing, session exit, orphan reaping, plugin
  disable and configuration off all stop the timer and close the remote channel.
- **best-effort**: a missing field is simply omitted (the UI shows “无”); a collection failure silently stops
  the timer and hides the whole bar (no new frame for 8s — **not 3s**: a slow sampling child process can
  stretch the interval, and too tight a window makes the bar flicker). It never writes to the PTY and never
  pops an error. Meter colours: <70 normal / 70~90 yellow / ≥90 red.
- **Slow commands never dictate the pace**: subprocess-backed fields (df / netstat / vm_stat / ps) wait once
  on the first sample and afterwards always “use the previous value + refresh in the background”
  (`SLOW_TTL_MS = 5000` slots locally, a `REMOTE_SLOW_EVERY = 5` phase gate in the remote loop) — a stuck
  command only makes one cell show a few-seconds-old value.
- **Fixed slots + incremental refresh**: every value has a fixed character slot (right-aligned) and items are
  created once, then only text that actually changed is written, so a number jumping does not push the items
  after it sideways; horizontally scrolling to the right end is not yanked back by the next refresh.
- **Hot apply**: turning `statsEnabled` off stops collection immediately; turning it back on resumes from the
  still-present subscriptions.

## AI assist: explain failures (0.24.0, off by default)

When a command exits **non-zero**, a discreet chip (showing the exit code) appears in the bottom-right corner
of the terminal; clicking it sends **that command's output tail** to the model and renders “what happened /
next step”.

- **Zero input, but nothing is sent automatically**: the chip only says “this one failed — want a look?”;
  sending terminal content is always the user’s click. `Ctrl-C` (130) and `SIGPIPE` (141) do not raise it
  (they happen all day), and neither does an unavailable exit code.
- **What is sent**: that command’s output tail (ANSI and `\r` overwrites stripped, consecutive duplicate
  lines folded, truncated to 40 lines / 6000 characters, secrets / tokens / passwords in connection strings
  masked) **plus the current screen** — **no scrollback**. The output answers “what did this command do”, the
  screen answers “which command was typed”.
- **How the answer is used**: the panel header is “why this command failed” plus an exit-code pill; a
  suggested command renders as its own “suggested command” block whose button is “**insert into the prompt**”
  — it only writes bytes into the prompt (after a `Ctrl-U` to clear any half-typed input), **never presses
  Enter**; “copy answer” and “close” sit alongside. The answer lives in the panel UI only and is never echoed
  into the terminal.
- **A way out on failure too**: when the host errors, the panel offers a copyable “copy error” block instead of
  a dead message with no buttons.
- **The same failure is asked once**: answers are cached per command, so dismissing with Esc and clicking the
  chip again **replays** it; only a previously **errored** answer is retried. A host-side in-flight
  de-duplication keeps two tabs from spending two calls.
- **Model routing**: candidates come from the host’s registered model catalog (`provider` / `model` **as a
  pair**; empty follows the host default). The card shows **one read-only “model route” control**
  (`provider/model`); opening it lists candidates grouped by provider, and picking one writes both keys.
  Missing candidates are reported distinctly as “cannot get candidates: the host may not have restarted” vs
  “the host has no available model”.
- **Privacy**: off by default. Turning it on authorizes a **terminal-content egress** — only the slice above,
  with light masking applied before sending (shape-based rules only; better to miss a rare format than to
  mangle normal logs).

## Configuration (saving takes effect immediately)

Where the settings surface lives changes with the DSH version, but it is **always the same form** — the
per-generation landing spots and the four registration contracts live in
[conventions.md § client settings surface](../../docs/conventions.md#客户端设置面内联优先).

| Key | Default | Description |
| --- | --- | --- |
| `enabled` | true | Disable the whole plugin (needs a restart) |
| `announceToAgent` | true | Whether to announce terminal-panel capabilities to the agent (systemPrompt injection) |
| `maxSessions` | 4 | Concurrent PTY session limit (1~16) |
| `shell` | `$SHELL` | Shell path; the settings card offers selectable + typed input (the dropdown is a popover sourced from `/etc/shells` + `$SHELL` + common install paths, listing only existing executables); any path may be typed |
| `term` | `xterm-256color` | TERM value |
| `colorTerm` | `truecolor` | COLORTERM value |
| `cwd` | host start directory | Fallback working directory (the client’s current session cwd wins) |
| `reconnectGraceSec` | 120 | Seconds a session is kept alive after an abnormal disconnect (0~3600): a page refresh / network blip waits for reconnect, otherwise the reaper ends it; `0` = end immediately |
| `sshHosts` | `[]` | SSH connection-book entries `{name, host, port=22, username, auth=agent\|key\|password, keyPath, passphrase, password, agentForward, hostKeyAlias='', persist=false}`; replaced wholesale on save, same name overwrites; `password` / `passphrase` accept an `env:VAR` reference; `persist=false` is an **opt-out**; an empty `hostKeyAlias` locates the fingerprint by host address |
| `hostKeys` | `[]` | SSH host fingerprints (TOFU, auto-maintained): `{host, port, fingerprints[]}` unique per host:port, multiple keys of one host in one record; the first connection appends, any matching fingerprint is allowed, all mismatching refuses the connection |
| `shellIntegration` | true | Inject OSC 133/7 shell integration (command-boundary markers + cwd reporting; `tty_capture{last}` depends on it); zsh/bash/PowerShell supported, other shells are skipped |
| `tunnels` | `[]` | Port-forwarding tunnels `{name, bookName, direction=local\|remote, localPort?, remoteHost?, remotePort?, localTargetHost?, localTargetPort?, enabled}`; `bookName` references a connection-book entry |
| `sftpStyle` | `dialog` | SFTP UI style: `dialog` single pane / `dual` two panes (local left / remote right, inline `⇨/⇦` server-side transfer); applied when SFTP is reopened |
| `persistence` | `off` | Session persistence: `off` sessions live and die with the host; `tmux` makes **every new tab tmux-managed by default**, restorable across host restarts |
| `endOnPageClose` | `false` | When the page disconnects and the keep-alive window expires, whether to end tmux persistent sessions too. Default `false` = keep them restorable |
| `sftpLimits` | `{maxDownloadMb: 1024, maxUploadMb: 2048, maxUploadFiles: 1000}` | SFTP transfer limits (browser-side protection, **0 = unlimited**); use dual-pane `⇨/⇦` for large files |
| `allowProxyCommand` | `false` | Allow a book entry’s **proxy command to execute locally**. Off by default: with it off, a connection carrying a proxy command **fails explicitly**, and `~/.ssh/config` import **never** brings the field in. The docker container panel reads the same switch. **Two elevation paths**: (1) the startup environment variable `DSH_TTY_ALLOW_PROXY_COMMAND=1` (only the host’s startup environment snapshot counts); (2) **in-place elevation** (no restart). Authorization is persistent (`<DSH home>/dsh-kit/capability-grants.json`) and applies after a restart (see [architecture.md § 7](../../docs/architecture.md#7-一条请求经过什么)) |
| `assistEnabled` | false | AI assist “explain failures”. **Off by default**: once on, a non-zero exit raises the corner chip, and clicking it sends that command’s output tail (cleaned, de-duplicated, truncated, secrets masked) plus the current screen; no scrollback. When off the host also refuses `/api/dsh-tty/assist` |
| `assistProvider` | `''` | Provider for the AI-assist model route; paired with `assistModel` (both empty = follow the host default). Setting only one neither takes effect nor **silently falls back** to the default model |
| `assistModel` | `''` | Model for the AI-assist model route; paired with `assistProvider` |
| `statsEnabled` | true | Server status bar: collects and pushes metrics by tab visibility; turning it off stops the timer (and closes the remote exec channel); save applies immediately |
| `terminalFontFamily` | `''` | Terminal font stack: comma-separated CSS family names placed **before the built-in monospace stack**. Empty = built-in stack only. Rendering only, never the PTY; quotes/backslashes/angle brackets are stripped and each name is quoted (generic families excepted). Existing terminals reflow immediately |
| `terminalFontSize` | 13 | Terminal font size (px, 8~32) |
| `terminalCursorStyle` | `bar` | Cursor shape: `bar` / `block` / `underline`. Programs inside the terminal write this too (DECSCUSR), so the plugin corrects it back after each parsed output batch; **full-screen programs (vim / less / htop / fzf, alternate screen) are left alone** |
| `terminalCursorBlink` | true | Whether the cursor blinks. Programs’ `?12h` / `?12l` override it; corrected back on the normal buffer, left alone in full-screen programs |
| `terminalLineHeight` | 1.35 | Line-height multiplier (1~2). A block cursor usually wants `1`: 1.35 stretches the cell so the cursor is taller than the glyphs |
| `sidebarHostAlign` | false | Align the sidebar “Terminal” entry with the host’s `.panelRow`: width `calc(100% - 4px)`, `margin 0 2px`, 14px font, 16px icon; **`min-height` and `padding` are measured from the host row at mount time** (the two host cohorts use 36/7 and 32/5, so hard-coding either makes the other 4px off), falling back to 36/7 when nothing can be measured. Default false = the plugin’s own sizing (purely additive styling) |

## Connection bar: connection identity and copy

Besides the action buttons, an SSH tab’s connection bar shows **this connection’s identity** on the same row
(all read-only; editing still goes through the settings card):

- **Clickable address**: `user@host:port` on the left is a clickable pill; opening it shows a “connection
  details” popover with target, book entry, authentication, jump host, proxy command, persistence state and the
  latest status. The data comes from the session’s `spawnSpec` + tab state.
- **Jump-host badge**: when a jump host is configured, a badge appears next to the address whose title is the
  full `[user@]host[:port]` — a connection through a bastion looks exactly like a direct one, and that is the
  easiest thing to misread while troubleshooting.
- **Two copy items in “⋯”** (**neither contains any credential**): **copy connection info** (target / entry /
  authentication / jump host / proxy command, one `title: value` per line) and **copy SSH command** (a command
  you can paste into a terminal, with port / jump host / proxy command in OpenSSH spelling). Passwords, private
  key paths and passphrases **never go to the clipboard**.

## Client services (for other plugins)

Other plugins never need tty to know about them; they plug in through the three client services below. **The
built-in actions use the same registration channel**, and behaviour is unchanged when nothing is registered.
These service names are likewise not declared on tty’s `Context` type surface, so consumers inject by string
(optional dependency: injection does not fire when tty is missing or too old).

### Connection-bar extension point (client service `ttyConnbar`, 0.13.0)

Append your own context buttons to the SSH connection bar (the SFTP / tunnel row). Display order = registration
order; “**⋯ More**” is the action area’s overflow entry and **always comes last** (so a new plugin cannot push
“More” into the middle).

```js
// consumer (e.g. dsh-docker) in its own client half, injected optionally: no tty means no trigger
ctx.inject(['ttyConnbar'], (c) => {
  const dispose = c.ttyConnbar.addAction(({ tab, spec, bookName, addAction }) => {
    // called on every renderConnbar; decide whether this render adds a button
    if (spec.t !== 'ssh') return
    addAction(iconSvg, 'Containers', 'Open the Docker containers on this host', () => { /* open your panel */ })
  })
  // call dispose() on unmount
})
```

| Member | Description |
| --- | --- |
| `addAction(factory)` | Register a button factory; returns an unregister function. `factory` receives `{tab, spec, bookName, addAction}`: `spec` is the session’s spawnSpec, `bookName` the connection-book entry name (`''` for inline connections), and `addAction(icon, label, title, onClick)` appends a button in tty’s style |
| `requestRender()` | Ask tty to re-render the connection bar (for a consumer that got new data asynchronously and needs its button to appear now) |

- It only fires on **SSH tabs**; the connection bar is hidden on local tabs.
- **Command tabs do not fire** (`spawnSpec.command` is set, i.e. a tab running one command via
  `ttyTerminal.open`) — these extensions act on **the connection itself**, and hanging them on a command tab
  would mislead (SFTP browses the host, not the container the user has in mind).
- A factory throwing only logs `console.warn`; the connection bar and built-in buttons are unaffected.

### Terminal command tabs (client service `ttyTerminal`, 0.14.0)

> **`open()` reuses by default** (contract v3): when a live tab for the same “connection + command” already
> exists, it focuses that instead of opening another. The motivation was empirical — clicking a container
> card’s “Terminal” button a few times produced three identical `docker exec` tabs, each consuming a session
> slot. Pass `reuse: false` to get two identical sessions side by side.

One step beyond connection-bar buttons: let other plugins **open a tab that runs one command** (typically
dsh-docker’s card “Terminal” button → `docker exec -it <container> sh`).

```js
ctx.inject(['ttyTerminal'], (c) => {
  c.ttyTerminal.open({
    command: "docker exec -it 'demo-consumer' sh",  // required, single line, ≤2000 characters
    book: 'lab-a',        // either: a connection-book entry name → an SSH tab
    // spec: { host, port, username, auth, agentForward },  // inline SSH fields
    // (neither = a local tab; use cwd for the working directory)
    label: 'demo-consumer · exec',
    cwd: '/optional/local/cwd',
  })
})
```

- Command tabs are **not tmux-persistent** (a short command gains nothing from attach) and do not go through a
  login shell; the SSH side uses `conn.exec(command, {pty})`, the local side
  `sh -c 'export TERM=…; exec <same shell> -c <command>'` — the outer `exec` makes the process the command
  itself (faithful exit codes and signals), while **the inner `-c` is what makes the whole thing shell code**
  (`cd x && cmd`, `a; b`, `for …; do …; done` all run, D78).
- **Command tabs reopen automatically**: after a host restart / reconnect the sid is gone, so the client
  re-executes the original command for tabs carrying `spawnSpec.command` (ordinary non-persistent tabs keep the
  old “click to retry”). A page refresh restores them the same way.
- The command comes from a **host-side plugin** (not remote user input), so its trust level is the plugin’s;
  tty only validates the shape: non-empty, single line, ≤2000 characters (a newline would break the local `-c`
  wrapper). **“Single line ≤2000” is this channel’s constraint, not `tty_open`’s**.
- **`ttyTerminal` / WS `spawn` is a command surface with no static capability gate**: this service and the
  `{t:'spawn'}` frame both accept an arbitrary `command` and are **not governed by any `DSH_*_ALLOW_*`** (this
  plugin’s static gate only covers ProxyCommand, the “configuration field drives a local command” tier). That
  is deliberate — the terminal panel is the product, and **its permission ceiling is carried by the user’s own
  actions**: a human clicks “+” to open a tab and types commands in it. **See clearly that the tier gate
  cannot reach this**: the tier gate above hangs off the `tools/pre-execute` waterfall and filters only by the
  `tty_` / `sftp_` / `tunnel_` **prefixes** (`TTY_TIER_PREFIXES`), i.e. it gates **agent tool calls only**;
  the browser’s `spawn` frame and `ttyTerminal.open` are **WS / client-service** channels — this command
  surface **never passes through it**. So do not present it as this command surface’s gate — it blocks not
  one byte (only the agent path, `tty_open`, is governed by it). **Cost**: no consumer may advertise “with tty installed, this plugin’s
  own exec switch” as a “cannot get into the container” boundary — with tty installed, an in-page script can
  reach a stronger arbitrary-command surface through `ttyTerminal.open` or the WS `spawn`. See
  [architecture.md § 7](../../docs/architecture.md#7-一条请求经过什么) for the threat-model boundary.

> `open()` and `ttyPanel.mountPane()` both **make the panel visible**: opening it if closed and **restoring it
> from minimized** — `minimize()` hides rather than closes, and that is a hard guarantee for callers.

### Embedded in-place terminal (`ttyTerminal.mount`, 0.15.0)

`open` borrows tty’s modal to open a tab; when a consumer wants **a terminal in place inside its own panel**
(typically dsh-docker’s terminal drawer), use `mount`:

```js
ctx.inject(['ttyTerminal'], (c) => {
  if (Number(c.ttyTerminal.version ?? 0) < 2) { /* old version: fall back to open */ }
  const dispose = c.ttyTerminal.mount(hostEl, {
    command: "docker exec -it 'demo-consumer' sh",  // the same set of options as open
    book: 'lab-a',                                     // book > spec > local
    label: 'demo-consumer · exec',
  })
  // when collapsing your own drawer:
  // dispose()
})
```

- `hostEl` must be an `HTMLElement`: tty inserts an absolutely positioned `.tt_term`, so the mount point needs
  `position: relative` and a definite size (size changes are caught by a ResizeObserver and synced to the PTY).
- An embedded terminal shares the same WebSocket and session table as tabs, but does not enter the tab bar,
  does not write sessionStorage and does not take part in the tty panel’s visibility; **closing the tty panel
  does not affect it**.
- Reconnect, re-running the original command after a host restart, and click-the-overlay-to-reopen all reuse
  the existing logic; `dispose()` ends the session and removes the DOM. Mounting is **cold-start safe** — even
  with the tty panel closed and no connection yet, `mount` brings the connection up.
- An embedded terminal has no search / clear toolbar from the tty panel head, so Ctrl+F returns to the browser.

### In-panel mount slots (client service `ttyPanel`, 0.16.0)

> tty’s own SFTP browser uses this channel too: it docks below when the slot is free, and falls back to the
> dialog when another pane occupies the same tab’s slot.

`mount` is “consumer gives a host, tty puts a terminal in it”; `ttyPanel` is its **mirror** — tty gives a
consumer a place inside the terminal panel to mount its own UI (typically dsh-docker opening “Containers” from
the connection bar: the pane docks to the terminal’s **right**, and the terminal stays visible, clickable and
typeable).

```js
ctx.inject(['ttyPanel'], (c) => {
  // panel closed (or tty < 0.16): use your own modal
  if (Number(c.ttyPanel.version ?? 0) < 1 || c.ttyPanel.isOpen() !== true) { /* fallback */ }
  const pane = c.ttyPanel.mountPane({
    title: 'Docker containers',  // pane title
    hint: 'prod-web-01',         // gray text next to the title (optional)
    side: 'right',               // 'right' (default) | 'bottom' (wide horizontal tables)
    size: 520,                   // initial size px: right = width (default 460), bottom = height (default 320)
    min: 360,                    // minimum size px (optional, defaults 280 / 160)
    ownerSid: tab.sid,           // owning tab (optional): omitted = current active tab, null = no owner
    onClose: () => { /* called when tty tears the pane down: unmount your React root here */ },
  })
  createRoot(pane.element).render(<MyPanel />)
  // when you collapse it yourself: pane.dispose()
})
```

| Member | Description |
| --- | --- |
| `isOpen()` | Whether the terminal panel is open (minimized does not count). Consumers use it to decide “mount inside” vs “use my own modal” |
| `mountPane(options)` | Mount a place on the right / bottom and return a handle; **only one at a time**, a later call tears the previous one down first (calling its `onClose`). With `side:'bottom'` it spans the width and is sized by height (drag the top edge) and can collapse to a title bar. `ownerSid` records the owning tab (default: current active tab); when switching tabs, panes owned by another tab are **collapsed** (DOM and React tree stay alive and are restored on return) |
| `handle.element` | The host element for the consumer’s render (column flex, already `overflow:hidden`, fills the body area) |
| `handle.setTitle(text)` / `setHint(text)` | Change the title / gray text |
| `handle.expand() / collapse() / toggle() / isCollapsed()` | Collapse to a 32px strip (vertical title + expand/close buttons); the terminal immediately gets the width back |
| `handle.dispose()` | Consumer-initiated collapse (idempotent; does not call `onClose` again) |

- **Lifecycle**: the sidebar’s DOM lives inside the terminal modal — minimize / restore follow the panel; when
  the panel is closed, tty **calls `onClose` first** (consumers unmount there) and only then removes the DOM.
- **Resizing**: a right pane drags its left edge, a bottom pane its top edge (cap = 72% of the panel card’s long
  edge); sizes are remembered per direction for the page session. Terminal-area size changes go through the
  existing ResizeObserver, which refits and syncs the new cols/rows to the PTY.
- **Viewport anchoring**: opening / closing / resizing the pane changes the terminal area’s height, so a refit
  anchors to the user’s intent — pinned to the bottom stays pinned, scrolled into history keeps those lines.
- **Choosing a direction**: vertical lists / list+detail use `right`; wide horizontal tables (file lists, dual
  panes) use `bottom`.

**`minimize()` (contract v2)** folds the whole terminal panel away: the modal is hidden, but the DOM /
WebSocket / xterm buffers are all retained and **sessions keep running**; restore via the sidebar “Terminal”
entry’s badge. Consumers use it to “give the stage away”.

```js
ctx.inject(['ttyPanel'], (c) => {
  if (Number(c.ttyPanel.version ?? 0) < 2 || typeof c.ttyPanel.minimize !== 'function') return false
  if (c.ttyPanel.isOpen() !== true) return false
  return c.ttyPanel.minimize()   // fold the terminal away so the session shows
})
```

> Contract versions: `ttyConnbar.version === 1`, `ttyTerminal.version === 3` (1 = only `open`, 2 = adds
> `mount`, 3 = `open` reuses a live tab for the same “connection + command”), `ttyPanel.version === 2`
> (1 = `mountPane` + `isOpen`, 2 = adds `minimize`). Consumers **check the version number**. On an old tty,
> `inject` still fires but the corresponding fields are absent.

## Frame protocol (/api/dsh-tty/ws, JSON text frames; v3 = one connection with many sessions + reconnect)

| Direction | Frame | Description |
| --- | --- | --- |
| C→S | `{t:'spawn', sid?, cols?, rows?, cwd?, persist?, persistName?, command?}` | Create a session; sid defaults to a host-generated one, cwd defaults to the configuration; `persist` + a stable `persistName` = a tmux persistent session (requires persistence=tmux); `command` = run one command directly (never persistent) |
| C→S | `{t:'ssh', sid?, cols?, rows?, name? \| host, username, …, persist?, persistName?}` | Create an SSH session (native ssh2); `name` references a book entry as the base and inline fields override it; `persist` has the same semantics as spawn |
| C→S | `{t:'input', sid?, d}` | Keystrokes / pasted data |
| C→S | `{t:'resize', sid?, cols, rows}` | Panel size change. **The client only sends it when the container is visible and the size is trustworthy** (D79); the host clamps only as a safety floor, and a non-numeric value falls back to 80×24 |
| C→S | `{t:'refresh', sid?}` | Force a redraw: the host runs `refresh-client` for tmux sessions (no-op otherwise) |
| C→S | `{t:'kill', sid?}` | Close a session (orphan sessions may be killed across connections, preventing leaks) |
| C→S | `{t:'sessions'}` | List the global session snapshot (`attachable` marks the reattachable) |
| C→S | `{t:'attach', sid}` | Reattach an orphaned session (within the keep-alive window): `ready(reattached:true)` followed by one `data` frame replaying the output buffer |
| C→S | `{t:'statsOn' \| 'statsOff', sid}` | Subscribe / unsubscribe that session’s status bar: driven by tab visibility, the host only collects while subscribed |
| S→C | `{t:'ready', sid, pid, kind, target?, persist?, reattached?}` | Session ready; `kind:'local'` carries a pid, `kind:'ssh'` has pid=null and target=user@host[:port] |
| S→C | `{t:'data', sid, d}` | Terminal output (a utf8 text stream; StringDecoder covers multi-byte sequences split across chunks); coalesced into frames **with a 12ms window / 64KB threshold**, and force-flushed before exit/kill to preserve frame order (D76) |
| S→C | `{t:'stats', sid, stats}` | Metric frame: `{cpuPct, cores, memUsed, memTotal, memPct, diskUsed, diskTotal, diskPct, uptimeSec, tcpConns, rxRate, txRate, tempC?, load1?, swapUsed?, swapTotal?, pingMs?}`; missing fields are omitted, byte values are bytes and rates B/s |
| S→C | `{t:'exit', sid, code, signal}` | The PTY exit fact (exactly once; still delivered on whichever connection is current after an attach) |
| S→C | `{t:'error', sid?, m}` | Error |
| S→C | `{t:'sessions', list, tmux?}` | Session snapshot (`{sid, kind, target, pid?, cwd, startedAt, lastOutputAt, attachable, persist?}`); `tmux` = persistent session names on the dedicated socket + retained SSH persistent names |

Keep-alive semantics: a normal panel close sends `kill` for each session before disconnecting; therefore
“WS closed while sessions are still alive” is treated as an abnormal disconnect — the sessions become orphans
(output keeps accumulating in the ring buffer), and the reaper cleans them up after `reconnectGraceSec`.
Meanwhile a new connection can `{t:'sessions'}` and `{t:'attach', sid}` to replay them.

When sid is omitted, routing falls back to “the only session on this connection”; with zero or several
sessions, omitting sid is an error. The upgrade route carries a loopback trust fence (remoteAddress + Host +
Origin checks), so only a local Web GUI can connect.

## Development

```bash
pnpm --filter @hyzyn/dsh-tty build        # tsc host + esbuild browser half (client.js)
pnpm --filter @hyzyn/dsh-tty typecheck
pnpm --filter @hyzyn/dsh-tty probe        # M0 probe: PTY primitives (needs a real PTY)
pnpm --filter @hyzyn/dsh-tty integration  # integration: real plugin × real DSH services
pnpm --filter @hyzyn/dsh-tty live         # liveness smoke: start dsh web first
pnpm --filter @hyzyn/dsh-tty tui          # TUI smoke: vim/htop full-screen rendering (start dsh web first)
pnpm --filter @hyzyn/dsh-tty ssh-smoke    # SSH smoke: in-memory SSH server × real spawnSsh end to end
pnpm --filter @hyzyn/dsh-tty probe-smoke        # probe classification and TOFU
pnpm --filter @hyzyn/dsh-tty probe-route-smoke  # probe HTTP routes + connection book
pnpm --filter @hyzyn/dsh-tty sftplimits-smoke   # sftpLimits normalisation
pnpm --filter @hyzyn/dsh-tty windows-smoke      # Windows end to end (other platforms print why and skip)
pnpm --filter @hyzyn/dsh-tty preview      # visual preview: headless Chrome scenario screenshots (see below)
```

CI (`.github/workflows/ci.yml`) runs `integration` + `ssh-smoke` + three smokes on ubuntu and `windows-smoke`
on windows-latest, plus a “build artifacts match the sources” gate (`client.js` + `lib/`). The defect ledger is
in [`DEFECTS.md`](./DEFECTS.md).

The browser half’s source is `client-src/index.js`, its stylesheet is `client-src/tty.css` (inlined into
`client.js` by esbuild’s text loader). After changing the client, rebuild with `pnpm build` and refresh the
page (a hard refresh may be needed).

### Visual preview / screenshot regression (`scripts/preview.mjs`)

Style changes should not rely on “refresh the page and take a look”: the script loads `client.js` into a purely
static fixture page (`scripts/preview/harness.html` + a fake DSH host in `mock-host.js`) and uses headless
Chrome to render **each** UI state and screenshot it into `packages/tty/.preview/shots/` (the scene list and
its count come from `node packages/tty/scripts/preview.mjs --list`; this file does not hard-code them):

```bash
node scripts/preview.mjs                 # every scenario
node scripts/preview.mjs local menu ssh  # selected scenarios
node scripts/preview.mjs --list          # list scenarios
node scripts/preview.mjs --theme=light   # light theme
```

Coverage: local terminal / multiple tabs + SSH connection bar / “+” menu / SSH dialog / settings card / SFTP /
the docked pane following the tab / minimized badge / exit strip and error overlays / batch tab closing
(including the confirmation layer) / tunnel popover / search box / toasts / embedded terminal / the docker pane
and its “container → terminal drawer”.

Scenarios may attach a **function-shaped** assertion to `window.__previewAssert` (returning `null` = pass,
a string / array = fail); the script runs it and counts it in the `✓/✗` report. The fixture renders the
`--dsw-*` skin variables alongside the real UI, so questions like “is there still a white panel after a
light/dark theme switch” can be verified. The `.preview/` artifact directory is gitignored.

> The fixture’s `ctx.inject` has the same semantics as real cordis: **a callback does not fire when one of its
> dependencies is missing**, rather than stuffing `undefined` into the scope. The fixture needs Chrome/Chromium
> (it looks for playwright’s cached Chrome for Testing by default; `CHROME_PATH` overrides it).

## Known limitations

- **Not available behind a reverse proxy or from another machine**: non-local requests get 403, read-only routes included — these routes are the PTY / SSH / SFTP execution surface and are not opened to remote sessions (see [ROADMAP.md](../../ROADMAP.md) item 5 § 5.4). From another machine, use an **SSH tunnel**: `ssh -L 3080:127.0.0.1:3080 <host>` and open `http://localhost:3080` — the host sees a loopback source and a `localhost` Host, so the fence admits it and the session cookie is minted for that authority.
- **resize is an internal coupling**: DSH’s `spawnTerminal` handle does not expose resize, so the plugin passes
  through `(handle).terminal.resize(cols, rows)` (the native node-pty API). If a DSH upgrade changes the
  internals, since 0.3.0 it warns once and degrades to a fixed size instead of throwing every frame (D79).
- **TERM injection uses the `-c` wrapper layer (POSIX only)**: DSH hard-codes node-pty `name:"dumb"`, and in
  node-pty the name takes precedence over env.TERM, so the shell is started as
  `sh -c 'export TERM=...; exec "$shell"'` (transparent to the user; TERM / COLORTERM values are whitelisted).
  **There is no such layer on Windows.**
- **Windows hosts**: local terminals work, but shell integration / tmux persistence / disk·TCP·network·temperature
  do not apply or are unavailable — see the “Windows hosts” section for the full boundary.
- **terminate() has a “survivor” race**: DSH’s tree cleanup occasionally reports
  `terminal cleanup failed; surviving pids`; the plugin treats it as best-effort (falling back to SIGKILL on the
  top-level shell), and the exit code/signal may be null.
- **Output is a utf8 text stream**: non-UTF-8 bytes are replaced (e.g. `cat` on a binary), as expected;
  multi-byte UTF-8 sequences split across chunks are covered by StringDecoder, so fast Chinese output no longer
  garbles.
- The browser half depends on the official `dsh-web-app` sidebar structure (`[data-pane="sidebar"]`); an
  unofficial Web GUI may not show the entry.
- **The keep-alive window is finite**: after an abnormal disconnect a session is kept only for
  `reconnectGraceSec`; a host process restart ends all sessions; scrollback beyond the output buffer (last 256KB)
  cannot be recovered.
- **Shell integration covers zsh / bash / PowerShell only**: other shells are skipped (`tty_capture{last}`
  reports an explicit error rather than a wrong result). bash < 4.4 uses the DEBUG trap fallback: internal
  commands of compound commands emit extra B markers, so `tty_capture{last}` only captures after the last
  internal command (the exit code and `tty_expect` are unaffected). If the user’s rc overrides
  `PROMPT_COMMAND`/the hook array, integration may stop working.
- **Port-forwarding boundary**: local listeners are fixed to 127.0.0.1 (not exposed to the LAN); the remote
  direction is further limited by the server sshd’s `GatewayPorts`; spec changes (port/target/enable) apply on
  “Save”, while changed book credentials apply on the next reconnect.
- **Session persistence (tmux) boundary**: persistent tabs are hosted by the tmux server (dedicated socket, per
  profile) — if the host is hard-killed / the keep-alive reaper runs / the browser loses tab specs, the tmux
  session **survives** (that is what makes recovery possible) until the machine restarts or you run
  `tmux -L <socket> kill-server`; `tty_capture{last}` depends on tmux ≥3.3’s DCS `allow-passthrough` (older
  versions still persist, but that capability degrades); reattaching redraws only the current visible screen,
  while scrollback before the disconnect lives in tmux’s own history buffer; a persistent tab’s `exit` frame
  carries the tmux client’s exit code (0), and the shell exit code remains available via the OSC 133;D marker;
  `tmux.conf` is read only when the tmux server first starts; `grace=0` also kill-sessions persistent tabs; a
  persistent SSH session requires tmux on the remote (otherwise it degrades silently); **two windows
  reattaching to the same persistent session** share one host PTY (no double slot consumption).
- **SFTP boundary**: file permissions are those of the SSH account’s shell (no extra sandbox/chroot); downloads
  go through browser memory (use terminal `scp`/`rsync` for very large files); the agent tools `sftp_read` are
  ≤1MB and refuse binaries, `sftp_write` is ≤1MB per call; overwrites use a same-directory temp shard
  `.dsh-part-<uuid>` + rename for atomicity, and a crash may leave a shard orphan (the next overwrite upload
  cleans up leftovers older than 24h).
- **SSH host keys are TOFU-pinned**: if the very first connection already hit a MITM, the recorded fingerprint is
  the attacker’s; a fingerprint change must be confirmed by a human in the settings card and the record deleted.
- **Browser tab persistence contains no plaintext credentials**: the spec copy written to sessionStorage /
  localStorage strips plaintext `password` / `passphrase` (an `env:` reference is kept) and marks
  `credsStripped` — restoring/reopening prompts for them again.
- **Status-bar boundary**: a remote host gets two fallbacks (POSIX → PowerShell), and a **macOS/BSD remote**
  fails both, so the whole bar hides; on Linux the CPU temperature only exists where `/sys/class/thermal` is
  exposed; the disk is fixed to the filesystem holding `/` (the system drive on Windows); a local session’s
  metrics belong to the **host machine** (all local tabs share one sample) and macOS temperature is always
  “无”, with memory counted as vm_stat’s active+wired+compressed; metrics are **instantaneous**, with no history
  API (the front end accumulates 60 samples itself).
- **SSH sessions have no local pid**: an ssh2 shell channel is not a local process, so `ready.pid` is `null`,
  `tty_list` shows `target` instead of a pid, and the local `ps` / `kill` cannot touch the remote process —
  close it with the tab ✕ or a `kill` frame.

## How it works

```
browser half (client.js, esbuild bundle)
  ├─ sidebar “Terminal” entry → large modal
  ├─ tab bar: one xterm.js instance per tab (independent sid; WebGL renderer, DOM fallback on loss)
  ├─ reconnect: exponential-backoff reconnect + sessions query + attach restore;
  │  tab list in sessionStorage (after a refresh, reattach kept-alive sessions by sid)
  ├─ sessions client service: new tabs carry the current session cwd
  └─ WebSocket ──→ /api/dsh-tty/ws (webServer.registerUpgrade)
                        │
host half (src/index.ts)
  ├─ per-connection session table (sid → local PTY / SSH channel, many sessions per connection)
  ├─ SessionManager (maxSessions limit, hot-adjustable; SSH sessions scheduled on the same table;
  │  orphan reaper clears abnormally disconnected sessions after reconnectGraceSec)
  ├─ per-session 256KB ring buffer (tty_capture / reconnect replay) + xterm-headless
  │  virtual screen (tty_screen) + StringDecoder (utf8 framing fallback)
  ├─ shell integration (src/shell-integration.ts): zsh ZDOTDIR / bash --rcfile
  │  stubs inject OSC 133/7 hooks; output parsing (feedShellIntegration, carry across
  │  chunks) → command boundary capture (tty_capture{last} / tty_expect early stop)
  │  and cwd tracking (tty_list)
  ├─ local path: ctx.get('subprocess').spawnTerminal({ argv: shell -c wrapper, cwd })
  │  persistent tabs: wrapper becomes `exec tmux -L <socket> -f <conf> new -A -s dsh-<name>`
  │  (src/tmux.ts: probe / asset generation / spawn plan / kill-session; stable assets under
  │  <DSH_HOME|~/.dsh>/tty/; tmux swallows unknown sequences, so the hooks wrap
  │  OSC 133/7 in DCS passthrough under $TMUX, unwrapped by tmux ≥3.3)
  ├─ helper routes: /api/dsh-tty/ssh-config (~/.ssh/config import candidates),
  │  /api/dsh-tty/credential-refs (known reference names in the credential store),
  │  /api/dsh-tty/env-vars, /api/dsh-tty/known-hosts, /api/dsh-tty/shells
  │  — all behind the loopback fence (hardened: all of 127/8 + hostname DNS confirmation
  │  + origin check before DNS; one implementation in @hyzyn/dsh-kit); **state-changing
  │  endpoints also prove same-origin**, while read-only ones (incl. sftp /list and
  │  /download) do not. POST /config is deliberately exempt — it is the only recovery
  │  entry after the plugin is disabled
  ├─ SFTP (src/sftp.ts): lazy connection pool (120s idle reap, reconnect on demand, shared
  │  TOFU) → POST /api/dsh-tty/sftp/list|mkdir|rename|remove|download|upload
  │  + sftp_* tools (book names only)
  ├─ port forwarding (src/tunnels.ts): host-owned tunnels (-L/-R both ways), backoff
  │  reconnect, shared TOFU, connection counts; GET /api/dsh-tty/tunnels + tunnel_list
  └─ frame protocol: spawn|ssh / input / resize / kill / sessions / attach
     ↔ ready/data/exit/error/sessions + backpressure

SSH path (src/ssh.ts)
  └─ {t:'ssh'} → spawnSsh: a native ssh2 Client connection (agent / key / password;
     password·passphrase support env:VAR; host key pinned by HostKeyStore TOFU),
     a shell channel wrapped into a TermHandle of the same shape as a PTY
     (pid=null, kind='ssh', target=user@host[:port]), backpressure passed through;
     persist probes tmux first, then `exec tmux -L <socket> -f /dev/null new -A -s dsh-<name>`
     opens a pty channel (no tmux → ordinary shell channel + gray hint)
```

M0 probes, integration tests and live-instance smokes (live / TUI) have verified on real DSH service
compositions: TERM injection, resize passthrough, sid collisions, the concurrency limit, the loopback fence,
multi-session data isolation, cwd tracking and validation, hot configuration, the kill→exit chain, keep-alive +
sessions/attach replay, the tty_screen virtual screen, ANSI cleaning, shell integration, `tty_expect`, port
forwarding, SFTP and its management loop, and session persistence; the SSH path is covered by `ssh-smoke` (an
in-memory SSH server × the real `spawnSsh`). The itemised coverage lists and per-round real-hardware
verification records are in [ROADMAP § completed](./ROADMAP.md#已完成落点--门槛) (Chinese).
