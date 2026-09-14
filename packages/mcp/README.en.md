# @hyzyn/dsh-mcp

[中文](README.md) | English

> The “MCP Server Configuration” card under DSH **Settings → Plugins**: maintain MCP servers graphically, **saving hot-reloads them**, no host restart needed.

## Features

- **Takes effect on save**: rewrites the managed block of `~/.dsh/cordis.patch.yml`; DSH’s HMR watcher reloads it automatically, and tools are registered to the model as `mcp__<server>__<tool>`.
- **Both transports supported**: stdio (command / args / env / cwd) and streamable-http (url / headers, including SSE and session headers); values can be written as `js:` expressions, so secrets never land in the patch file.
- **Connection Test**: the host speaks JSON-RPC directly (initialize → tools/list) without relying on the MCP SDK, returning protocol version / serverInfo / tool list / elapsed time.
- **Visible status and conflicts**: reads liveness from the loader fiber (running / disabled / error / loading) and warns about serverName conflicts with external mcp-client instances; servers can be enabled / disabled (`disabled: true`) / edited / deleted.
- **Self-describing to the agent**: injects a capability notice (systemPrompt section) so that when “MCP config / MCP server” comes up, the model knows it refers to this plugin.

![MCP Server Configuration card: add / Connection Test / hot reload](https://cdn.jsdelivr.net/gh/hyzyn/dsh-plugin-kit@main/docs/dsh-plugin-kit-mcp.png)

## Structure

| File | Description |
| --- | --- |
| `src/index.ts` | Host half: managed block read/write, validation, status reading, JSON-RPC probing, `/api/dsh-mcp/*` routes (loopback-only fence) |
| `client.js` | Browser half: registers the `settings.plugin.item` card (React shell + pure-DOM admin panel, `window.__ModuleLoader__.load` format) |
| `cordis.patch.yml` | Bundle patch: inserts the plugin row into the profile lineup |

Routes (loopback + same-origin only):

- `GET /api/dsh-mcp/servers` — list + status + conflicts
- `POST /api/dsh-mcp/servers/save` — save the whole set (after validation, write back to the managed block)
- `POST /api/dsh-mcp/test` — run one Connection Test with the form configuration

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
- The `!!js` expressions of a Connection Test are evaluated inside the host (the same trust model as the loader)
- The browser half is hand-written ESM (the React shell is resolved through `__ModuleLoader__`’s `require`, and the panel itself is pure DOM), so no tsdown is needed; the host half emits ESM straight from tsc
