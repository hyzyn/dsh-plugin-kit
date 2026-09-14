# @hyzyn/dsh-profile

[中文](README.md) | English

> The “Profile Management” card in DSH **Settings → Plugins**: view, create, copy, rename, and delete DSH profiles without memorizing commands.

## Features

- **No hand-copied commands to create a profile**: create one from three templates in one click (`@deepseek-ai/dsh-base` core only, or add `dsh-web-app` / `dsh-headless`); copying skips `node_modules` and lockfiles and runs `pnpm install` automatically.
- **Ports are stored with the profile**: a startup port is recorded for each profile, copied startup commands automatically carry `--port`, and multiple web profiles no longer collide on ports.
- **Rename / delete in one step**: the directory move and the manifest rename happen together; deletion asks for a second confirmation inside the panel (irreversible).
- **Status and structure visible at a glance**: initialization badge, bundle layer, dependency count, and directory path; a missing `cordis.patch.yml` is flagged.

## What is a profile

Each profile is a standalone directory under `$DSH_HOME/profiles` (default `~/.dsh/profiles`, overridable with the `DSH_HOME` environment variable), with its own bundle layer and patch file:

```
~/.dsh/profiles/<name>/
├── package.json          # dsh.profile.bundles: the bundle layers for this profile
├── cordis.patch.yml      # Patch layer: loader patches applied after the bundle layers
├── pnpm-workspace.yaml   # Profile workspace (nodeLinker: hoisted)
└── profile.runtime.json  # (Optional) runtime configuration for this plugin, e.g. the startup port
```

## Structure

| File | Description |
| --- | --- |
| `src/index.ts` | Host half: profile directory read/write, validation, create / copy / rename / delete, `/api/dsh-profile/*` routes (loopback-only fence) |
| `client.js` | Browser half: registers the `settings.plugin.item` card (React shell + plain-DOM management panel, `window.__ModuleLoader__.load` format) |
| `cordis.patch.yml` | Bundle patch: inserts the plugin line into the profile roster |

Routes (loopback + same-origin only):

- `GET /api/dsh-profile/list` — list all profiles and their status
- `POST /api/dsh-profile/create` — create (`name` + optional `template` / `port`)
- `POST /api/dsh-profile/duplicate` — copy (`name` + `from`)
- `POST /api/dsh-profile/rename` — rename (`name` + `newName`)
- `POST /api/dsh-profile/port` — set the port (`name` + `port`; leave `port` empty to clear)
- `POST /api/dsh-profile/delete` — delete (`name`)

## Installation

```bash
pnpm --filter @hyzyn/dsh-profile build
dsh plugin --profile web add link:$(pwd)/packages/profile
```

The plugin's own line is mounted by `insert: { id: profile-manager, name: '@hyzyn/dsh-profile' }` in `cordis.patch.yml`; `dsh plugin add` also installs this package into the profile dependencies and adds it to the `dsh.profile.bundles` patch layer, **so this mount step is only needed once** — it takes effect after restarting `dsh web`.

## Configuration

```ts
interface Config {
  /** Disable the whole plugin. Defaults to false. */
  enabled?: boolean
  /** Whether to inject the plugin capability announcement to the agent. Defaults to true. */
  announceToAgent?: boolean
}
```

## UI preview

Settings → Plugins → the “Profile Management” card (configuration UI):

![Profile Management configuration UI](https://cdn.jsdelivr.net/gh/hyzyn/dsh-plugin-kit@main/docs/dsh-plugin-kit-profile.png)

After creating a profile from the `headless` template, you can start a headless session with that profile directly from the command line (answer one task, print the result, then exit):

![Example of starting a headless profile from the command line](https://cdn.jsdelivr.net/gh/hyzyn/dsh-plugin-kit@main/docs/dsh-plugin-kit-profile-example-headless1.png)

```bash
# Start with the headless profile: answer one task, print the result, then exit
dsh --profile headless "run the tests"
# dsh web is an alias for --profile web
```

## Notes

- Creation logic matches `initProfile` in `dsh-app-boot`: it generates `package.json` (`dsh.profile.bundles`), an empty patch file `cordis.patch.yml` (`[]`), and `pnpm-workspace.yaml`
- Names must match `[A-Za-z0-9][A-Za-z0-9._-]*` and cannot be `node_modules` / `.` / `..`
- Copying skips `node_modules` and `pnpm-lock.yaml` automatically and does not carry over installed artifacts, but runs `pnpm install` to rebuild dependencies; `profile.runtime.json` is copied along with the directory
- Port configuration is stored in `profile.runtime.json` and only affects the startup commands this plugin generates; it is never written to DSH's official `package.json` / `cordis.patch.yml`
- Deletion is recursive and irreversible, with a second confirmation inside the panel; the built-in `web` default profile cannot be deleted, while `headless` can be deleted
- A new profile needs its dependencies installed on demand before first use: `dsh plugin --profile <name> add <package>` (runs pnpm inside the profile directory)
- The browser half depends on the core `slots` service; only the official settings panel of `dsh-web-app` provides that slot
