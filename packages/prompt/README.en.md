# @hyzyn/dsh-prompt

[中文](README.md) | English

> The “Prompt Management” card under DSH **Settings → Plugins**: visually edit systemPrompt, with version management and A/B testing. Configuration lives in `~/.dsh/prompts.yml` (overridable with `DSH_PROMPT_FILE`).

## Features

- **Two-level model: Prompts and versions**: one Prompt holds many versions — one step to save a new version, one step to roll back, with old versions fully preserved.
- **A/B split by ratio**: randomly hit the A/B versions by ratio, validating prompt changes on real traffic.
- **Enabling injects it as a systemPrompt section**: the selected Prompt is injected as a `systemPrompt` section and takes effect hot as soon as it is saved.
- **Exportable and importable**: export as `json` / `markdown`, import JSON, and copy a shareable form in one click.

![Prompt management card: visual editing / version management / A/B testing](https://cdn.jsdelivr.net/gh/hyzyn/dsh-plugin-kit@main/docs/dsh-plugin-kit-prompt.png)

## Routes

Loopback + same-origin access only:

- `GET /api/dsh-prompt/list` — list all Prompts and their activation state
- `POST /api/dsh-prompt/save` — create / save a Prompt as a whole
- `POST /api/dsh-prompt/activate` — activate a Prompt (the activated version can be specified; an empty `promptId` means deactivate)
- `POST /api/dsh-prompt/abtest` — configure A/B testing
- `POST /api/dsh-prompt/delete` — delete a Prompt
- `GET /api/dsh-prompt/active` — inspect the text currently injected into systemPrompt and the matched version
- `GET /api/dsh-prompt/export?format=json|markdown&promptId=...` — export
- `POST /api/dsh-prompt/import` — import JSON

## Installation

```bash
pnpm --filter @hyzyn/dsh-prompt build
dsh plugin --profile web add link:$(pwd)/packages/prompt
```

The plugin's own entry is mounted by `insert: { id: prompt-manager, name: '@hyzyn/dsh-prompt' }` in `cordis.patch.yml`; after a Prompt is saved, the host immediately refreshes the systemPrompt section, no restart required.

## Configuration

```ts
interface Config {
  /** Disable the whole plugin. Defaults to false. */
  enabled?: boolean
  /** Whether to inject the plugin capability announcement to the agent. Defaults to true. */
  announceToAgent?: boolean
  /** Whether to inject the enabled Prompt into systemPrompt. Defaults to true. */
  applyToSystemPrompt?: boolean
}
```

## Notes

- The managed block is marked with `# --- dsh-prompt-manager managed ...`; the plugin only rewrites that block and keeps everything else as is.
- Every Prompt needs at least one version; version content is at most 500KB.
- The A/B random pick happens when systemPrompt is refreshed (save / activate / startup), which suits quickly comparing different system prompt wording; if you need per-session routing, plug in an experimentation platform at a higher layer.
- The browser half of the plugin relies on the core `slots` service, and only the official settings panel of `dsh-web-app` provides that slot.
