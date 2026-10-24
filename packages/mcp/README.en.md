# @hyzyn/dsh-mcp

[中文](README.md) | English

> The “MCP Server Configuration” card under DSH **Settings → Plugins**: maintain MCP servers graphically, **saving hot-reloads them**, no host restart needed.

## Features

- **Hot-loaded on save**: rewrites the managed block of `~/.dsh/cordis.patch.yml`; DSH’s HMR watcher reloads it automatically, and tools are registered to the model as `mcp__<server>__<tool>`.
- **stdio and streamable-http transports**: stdio (command / args / env / cwd) and streamable-http (url / headers, including SSE and session headers); values can be written as `js:` expressions, so secrets never land in the patch file.
- **Connection Test without the MCP SDK**: the host speaks JSON-RPC directly (initialize → tools/list), returning protocol version / serverInfo / tool list / elapsed time. The probe also has a verdict for **errors**: a 401/403 on POST or GET is reported at once as `认证失败(HTTP 401)` (with `WWW-Authenticate`), other 4xx/5xx carry their status code — an auth failure is no longer swept into “SSE stream ended”; when a `js:` header or a stdio `env` value evaluates to `undefined` (including the shape hidden inside `Basic …` base64) it names the missing environment variables before sending any request or spawning the process.
- **Liveness and name conflicts are visible**: reads liveness from the loader fiber (running / disabled / error / loading). Name clashes come in two distinct tiers, never conflated (issue #5): `conflicts` holds only rows that **actually reuse** an external serverName — both instances would claim the same `mcp__<serverName>__*` tool names, so the warning banner appears only then; the inventory of instances outside this card travels in `externalServers` and is shown as a neutral info banner (“these names are already taken elsewhere — don’t reuse them here”). Servers can be enabled / disabled (`disabled: true`) / edited / deleted. **“Mounted” is not the same as “connected”**: fiber liveness comes from the loader, while a server that cannot be reached still resolves its `mcp-client` apply (`failOnStartupError` defaults to `false`, so nothing throws) — an unreachable address therefore keeps showing a green “running”. Each managed row now carries a `toolCount` (the number of `mcp__<serverName>__*` tools in the registry): when the row is `active` and `toolCount === 0`, the badge reads **“Not connected”** instead (overriding the green “running”), and a line underneath spells out the cost (every boot waits once for that connection attempt) with a “disable” button right there. When the tool registry cannot be read, `toolCount` is **absent** (not 0) and the UI draws no conclusion — “cannot read” must never be rendered as “not connected”.
- **Capability notice injected into systemPrompt**: injects a capability notice (systemPrompt section) so that when “MCP config / MCP server” comes up, the model knows it refers to this plugin.

![MCP Server Configuration card: add / Connection Test / hot reload](https://cdn.jsdelivr.net/gh/hyzyn/dsh-plugin-kit@main/docs/dsh-plugin-kit-mcp.png)

Where the settings surface lives depends on the DSH version, but it is always the **same form**: from
`0.2.0-rc.1` it is registered as `plugins.bundle.config` — **inline on the plugin detail page, directly
below the description**, with no extra ">" step; older hosts (the 0.1.6 line) fall back to the row's ">"
sub-page under the Plugins sidebar, and `≤0.1.5` uses the settings-page card.

## Structure

| File | Description |
| --- | --- |
| `src/index.ts` | Host half: managed block read/write, validation, status reading, JSON-RPC probing, `/api/dsh-mcp/*` routes (loopback-only fence) |
| `client.js` | Browser half: registers the `settings.plugin.item` card (React shell + pure-DOM admin panel, `window.__ModuleLoader__.load` format) |
| `cordis.patch.yml` | Bundle patch: inserts the plugin row into the profile lineup |

Routes (loopback + same-origin only):

- `GET /api/dsh-mcp/servers` — list + status (including each row’s `toolCount`, see below) + **real clashes** (`conflicts`) / instances outside this card (`externalServers`). **A failed DTO read returns 500 with the original reason**: the host webserver answers a throwing handler with an empty 400, which shows nothing in the UI (the fence has already passed, so returning the text is safe and makes the next incident obvious at a glance)
- `POST /api/dsh-mcp/servers/save` — save the whole set (after validation, write back to the managed block)
- `POST /api/dsh-mcp/test` — run one Connection Test with the form configuration

**Fence** (same tier as `docker` / `tty` since 2026-09-25): the loopback fence uses
`isLoopbackRequestStrict` from `@hyzyn/dsh-kit` (the whole 127/8 range plus DNS confirmation for
alias hostnames), and the two write routes above additionally require a **same-origin proof**
(`Sec-Fetch-Site: same-origin` or a matching `Origin`; when both are absent, only requests carrying
the host session cookie pass — that is the desktop shell's forwarding chain, see `docker D139`).
The read-only `GET /servers` needs no proof, so bare curl still works. The rationale and the single
implementation live in `packages/kit/src/http.ts`.

## Installation

```bash
pnpm --filter @hyzyn/dsh-mcp build
dsh plugin --profile web add link:$(pwd)/packages/mcp
```

`dsh plugin add` installs this package into the profile dependencies and, because it declares `dsh.bundle`,
also adds it to the `dsh.profile.bundles` patch layer — which is what makes the
`insert: { id: mcp-config, name: '@hyzyn/dsh-mcp' }` plugin row in `cordis.patch.yml` take effect,
so **you only mount it once**. After the plugin code is updated, restart `dsh web` for it to take effect.

> ⚠️ Do not manually append the same plugin row to `~/.dsh/cordis.patch.yml` again: inserting the same
> `id` once in each of two patch layers triggers
> `duplicate loader entry id: mcp-config` at startup, and the host process exits immediately.
> The home patch layer should only keep the plugin’s own `# --- dsh-mcp-config managed ...`
> managed block (server rows, not the plugin row).

The plugin row itself needs no HMR: after you save the **MCP Server Configuration** (the rows inside the managed
block), DSH’s watcher on the home patch layer hot-loads them as `mcp__<server>__<tool>`
tools within 1–2 seconds. After refreshing the page, expand the “MCP Server Configuration”
card under Settings → Plugins in the Web GUI to manage servers. Note: the browser
half depends on the core `slots` service, and only the official settings panel of
`dsh-web-app` provides that slot.

## Uninstallation

```bash
dsh plugin --profile web remove @hyzyn/dsh-mcp
```

After restarting `dsh web`, the plugin row disappears with it. The managed block can stay (just empty lines when no plugin
is present), or you can first clear the server list in the panel and then manually delete the
`# --- dsh-mcp-config managed ...` block.

## Notes

- The managed block is marked with `# --- dsh-mcp-config managed (auto-generated; do not edit) ---`;
  the plugin only rewrites that block and keeps everything else as is; the configuration inside the block
  aligns with the official mcp-client Config schema. An empty list is written as `- insert: []` (a no-op for the
  entry tree) — be careful not to write a bare `[]`, which would break the top-level YAML document of the home
  patch file, making HMR config refresh fail to parse and deleted servers unable to unload
- The save endpoint validates serverName (`[A-Za-z0-9_-]{1,32}`), required transport fields, and reconnect parameter bounds
- **An empty list needs explicit confirmation to clear**: `/servers/save` replaces the whole table, so `servers: []`
  means clearing the managed block. To stop a startup race or a stale card from silently wiping the servers you
  already configured (measured: the file was left with nothing but `- insert: []`, and there was no way to tell
  afterwards who cleared it), the host answers 400 for a save that is "an empty list without `clearAll: true`" and
  says in the message how many entries would be removed; the card only sets that flag when the user explicitly
  deletes the last row (the delete confirmation says so too). A block that was already empty (no entries to begin
  with) is not destructive and is allowed through — saving an empty card does not error
- The `!!js` expressions of a Connection Test are evaluated inside the host (the same trust model as the loader)
- **The criterion for “mounted but not connected” is a tool count, not the fiber state**: tools are the only
  artefact “a successful connection + `tools/list`” leaves behind, so counting them yields the real connection
  state for free (a walk over the in-memory tool registry, with no network probing). Attribution is by the
  `mcp__<serverName>__` prefix, using the same character rules as `publicName()` in the core
  `@deepseek-ai/dsh-mcp-client`; serverName is capped at 32 characters, so the prefix always stays inside the
  core’s 51-character truncation line and the attribution is reliable — should an over-long prefix ever appear,
  that row is **skipped rather than guessed**. Rows with `disabled` should have no tools anyway and do not count
  as “not connected”. Note this does **not** change startup cost: an unreachable address still costs one
  connection attempt per boot (about 10s; up to 60s when reachable but unresponsive) — disable the row to skip it
- The browser half is hand-written ESM (the React shell is resolved through `__ModuleLoader__`’s `require`, and the panel itself is pure DOM), so no tsdown is needed; the host half emits ESM straight from tsc

## Troubleshooting: triaging `server is disconnected`

**The symptom looks the same, but there are four different causes, and the fixes are nothing alike.**
Do not start by guessing at credentials — locate the row below first, then act (in one real incident on
2026-10-24 **three causes coexisted**: missing injection + no VPN + exhausted reconnect budget; each layer on
its own looked like "authentication failure", which is what made it expensive to diagnose).

| Criterion (one pasteable command / piece of evidence) | Conclusion | Fix |
|---|---|---|
| `nc -z <host> <port>` fails (for an intranet address, first check whether `ping` is 100% packet loss) | **Network unreachable** — nothing to do with the plugin or the credentials | Connect the VPN / move to a network that can reach that host |
| The port is open, but the host log ends with `giving up after N consecutive failed reconnect attempts` | **Reconnect budget exhausted**: once `reconnect.maxAttempts`, which defaults to 10 (`RECONNECT_DEFAULT_MAX_ATTEMPTS`), is used up, the client gives up and unregisters that server's tools — it will **not** retry later even after the network recovers | **Restart the host** (or HMR-reload the plugin) |
| Port open, no give-up record in the log, still not connected | The connection is still being established, or just failed and is awaiting a retry (about 10s for a first attempt; up to 60s when reachable but unresponsive) | Wait one reconnect cycle; if it keeps failing, treat it as the row above |
| 401 / tool count is 0 | **Credentials not injected**: `!!js process.env.X` evaluates to `undefined` and builds `Basic base64("undefined:undefined")` — a **legal but wrong** string, so the server can only answer 401 | Install and enable `@hyzyn/dsh-env`, and confirm those keys **really reached the host process** (`env` provides `dshEnvReady` only after its synchronous pre-injection) |

The other two reconnect defaults work the same way — the backoff doubles from the initial value and is capped:

- `reconnect.initialDelayMs` defaults to 500 ms (`RECONNECT_DEFAULT_INITIAL_DELAY_MS`);
- `reconnect.maxDelayMs` defaults to 30000 ms (`RECONNECT_DEFAULT_MAX_DELAY_MS`), which is also the backoff ceiling.
- All three numbers above are named constants: changing one **breaks nothing at build time**, but the numbers in this
  section are recomputed by `scripts/check-readme-facts.mjs` — **come back and edit this section when you change them**.
- `maxAttempts` is a budget of **consecutive** failures: it resets once a connection has stayed up longer than
  `maxDelayMs`, so "it dropped once" does not mean "it gives up next time".

Three supporting criteria:

- **Whether the auth header is already correct**: `!!js` is evaluated by the loader when it activates the
  `mcp-client` entry (its `process` is the host process), not by this plugin — this plugin's `evalValue()` only
  serves the Connection Test button. So "the card looks fine but the agent side cannot connect" is usually not
  this plugin's problem; work through the table above.
- **The Connection Test can produce the verdict for the credential row**: it reports "the environment variable X
  referenced here has no value in the current host process (not injected)" instead of a vague 401. **But that
  check only runs when you press Connection Test**; it does not cover the connection made at startup.
- **A restart is the only way out once the reconnect budget is spent**: `enabled: true` means "it will retry after
  a failure", not "it will retry forever".
