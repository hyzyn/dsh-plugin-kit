# @hyzyn/dsh-search

[中文](README.md) | English

> The DSH sidebar “Global Search” entry (**⌘ / Ctrl + K** also opens it): a command-palette-style search that finds past sessions, Prompts, MCP tools, and settings in one place.

## Features

- **Local cache renders first**: no request, zero latency — the cache paints results first, then remote results fill in.
- **Four target classes in one palette**: past sessions, Prompts, MCP tools and settings panels, shown in groups.
- **Keyboard first**: open it with ⌘/Ctrl+K; a row = icon + title (with an optional subtitle) + metadata on the right + a shortcut chip.
- **Results jump directly**: hit a result and go, without first working out "which settings page does this live on".

![Global Search plugin](https://cdn.jsdelivr.net/gh/hyzyn/dsh-plugin-kit@main/docs/dsh-plugin-kit-search.png)
![Global Search results (recent sessions / past sessions / Prompts / MCP tools / settings groups)](https://cdn.jsdelivr.net/gh/hyzyn/dsh-plugin-kit@main/docs/dsh-plugin-kit-search-query.png)

## Panel behavior

**Content on open** (no request, zero latency):

- **Recent**: the recent sessions in the browser-side `ctx.sessions.list` snapshot (empty sessions and subagent sessions are filtered out), with a relative time on the right;
- **Quick actions**: new session / open folder / open settings — the row does not appear when the target is missing (for example, when the directory picker plugin is not installed);
- **Settings**: the top-level settings categories are taken **live** from the `settings.section` slot of the client slots registry — categories registered by third-party plugins such as Skins / Pets / Sidebar cards / Web plugins / Creative workshop / Usage stats / Session archive management also appear, in the same order as the settings window navigation; the in-row keywords and descriptions are filled in by the host's `/api/dsh-search/catalog` directory. When the host does not have that route (the host itself is an older build), or the slots service is unavailable, it falls back to the directory, and then to the client-side fallback list of the four built-in official categories.

**After a keyword is typed**: local candidates (recent session titles, quick actions, the settings directory) are filtered and redrawn instantly, while `/api/dsh-search/query` is requested asynchronously to fill in the host's full-text hits:

- **Past sessions**: uses the `sessionQuery` full-text index that ships with DSH; clicking opens the session and automatically locates the matching text (the session view is a bottom-anchored virtual list, so locating loads earlier messages screen by screen, and the original position is restored when no match is found);
- **Prompts**: reads the managed block of `~/.dsh/prompts.yml`; clicking jumps to the “Prompt Management” settings card (when it cannot jump there, it falls back to copying the snippet);
- **MCP tools**: tools with the `mcp__` prefix, showing the owning server on the right; clicking jumps to the “MCP Server Configuration” card;
- **Settings**: matched locally by title / keyword / description (including plugin cards).

## Keyboard

| Key | Action |
| --- | --- |
| ⌘/Ctrl+K | Open (focuses the input when already open) |
| ↑ / ↓ | Move the highlight through all candidates (the first item is selected by default) |
| ↵ | Open the highlighted item |
| esc | Close |
| ⌥/Alt + 1…9 | Open the Nth "Recent" session |
| ⌥/Alt + N / O / , | New session / open folder / open settings |

Moving the mouse brings the highlight to the row under the pointer; the keyboard and the mouse share a single selection state.

## Routes

Loopback + same-origin access only:

- `GET /api/dsh-search/query?q=<keyword>` — returns `{ sessions, prompts, tools, panels }`: search results for past sessions, Prompts, MCP tools, and settings panels
- `GET /api/dsh-search/catalog` — returns `{ panels }`: the currently available settings panel directory (with `titles` / `keywords` / `description`), used by the browser half for "content on open" and instant filtering

## Installation

```bash
pnpm --filter @hyzyn/dsh-search build
dsh plugin --profile web add link:$(pwd)/packages/search
```

The plugin's own row is mounted by `insert: { id: global-search, name: '@hyzyn/dsh-search' }` in `cordis.patch.yml`; the browser half adds the Global Search entry below "New Session" in the sidebar.

## Configuration

```ts
interface Config {
  /** Disable the whole plugin (no routes registered, no GUI injected). Defaults to true. */
  enabled?: boolean
  /** Maximum number of results per category. Defaults to 8. */
  maxResults?: number
  /** Whether to search past sessions. Defaults to true. */
  includeSessions?: boolean
  /** Whether to search Prompts. Defaults to true. */
  includePrompts?: boolean
  /** Whether to search MCP tools. Defaults to true. */
  includeMcpTools?: boolean
  /** Whether to search settings panels (Settings → Plugins → Plugin configuration). Defaults to true. */
  includePanels?: boolean
  /** Whether to inject the plugin capability announcement to the agent. Defaults to true. */
  announceToAgent?: boolean
  /** Maximum number of sessions for the fallback session scan: when the host FTS is unavailable, sessions are truncated to this many, most recent first, cap 500. Defaults to 80. */
  maxScanSessions?: number
}
```

## Visual preview

`scripts/preview.mjs` loads `client.js` into a pure static fixture page (`scripts/preview/harness.html`, which contains a fake host: module loader / fetch / sessions service), then renders scene-by-scene screenshots with headless Chrome — useful for walking through changes when tweaking styles:

```bash
pnpm --filter @hyzyn/dsh-search preview                          # all scenes (dark) → .preview/shots/
pnpm --filter @hyzyn/dsh-search preview -- --theme=light --out=shots-light
pnpm --filter @hyzyn/dsh-search preview -- --list                # list scenes
```

Scenes: `empty` (content on open), `query` (mixed results after a keyword is typed), `loading` (full-text search in progress). After the screenshot, the `empty` scene also runs a set of keyboard-contract self-checks (default selection / ↑↓ / ↵ / ⌥number / esc), and failures are printed with `⚠`. Chrome/Chromium is required on the machine (by default it looks for the playwright-cached Chrome for Testing; `CHROME_PATH` can be used to point at another one).

## Notes

- The browser half depends on the core client `sessions` service (to read recent sessions and to open a session on click), and injects the sidebar entry through the DOM;
- "Click a session to open it" is **view navigation**: DSH 0.1.6 moved it to `uiWorkspace.openSession(id)` (the session domain's `sessions.open()` left the contract), while older hosts still go through `sessions.open()`. An implementation that only knows the legacy call turns a click into "cannot open a session in this environment" on a new host — indistinguishable from "nothing happened";
- Closing the panel restores focus, but **skips elements inside the sidebar entry** (the entry's `focusin` is the open path, so restoring focus there would mean "closed it only for it to pop straight back"), and blocks the entry's focusin within 250ms as a fallback;
- "New session" calls the GUI's own `uiWorkspace.startSession()` first (reuse the current workspace's empty session → create → select, all in one step); when that service is unavailable it falls back to clicking the sidebar "New Session" button, and only as a last resort does it call `sessions.create()` + `sessions.open()` itself — create without open shows up as "clicked but nothing happened";
- "Open folder" is located by the aria-label of the sidebar "Add workspace" button; when the directory picker plugin is absent the button does not exist, and the row is hidden automatically;
- The settings directory is built into the host half: the panels that are always present officially (General Settings, Models, Plugins, Agent presets, Plugin marketplace, Terminal, Agent loop, Web search) are always searchable; plugin cards are filtered by the plugins currently loaded in the host;
- If the host does not have the `sessionQuery` service installed, session search returns an empty array instead of throwing an error;
- If the `session-query` full-text index is configured with `openAt: "never"`, past-session search automatically degrades to scanning the raw events session by session instead of failing the whole search; the fallback scan is truncated by most-recent-first (`maxScanSessions`), and hits are returned in reverse chronological order;
- Session documents / query results / visible session sets / Prompt parsing all have short TTL caches, so repeated queries are cheap;
- Session results are filtered to the sessions currently visible / jumpable in DSH, avoiding the "searchable but not openable" case.
