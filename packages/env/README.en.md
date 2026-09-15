# @hyzyn/dsh-env

[中文](README.md) | English

> The “Environment Variables / Secrets” card under DSH **Settings → Plugins**: manage `~/.dsh/env.yml` graphically (overridable with `DSH_ENV_FILE`); **secret plaintext goes into the official credential store by default**, so the env file never holds plaintext.

## Features

- **Secret values never enter the env file**: secret values are written into the official credential store (the refs of `~/.dsh/.credentials.yaml`) and the env file keeps only the manifest; the API never returns plaintext (`value: null`), the GUI renders a password field, and saving with an empty field keeps the stored value.
- **`js:` expressions are evaluated late by the host**: expressions such as `js:process.env.API_KEY` stay in the file and are evaluated by the host (the YAML `!!js` dialect, the same as dsh patch files), so secrets need not be hard-coded.
- **Saving writes into the current process**: the resolved values are written into the current process’s `process.env`, so the host and subsequently started child processes can use them at once — no restart needed.
- **Storage fallback is all-or-nothing**: when the host has no credential seam or `secretsInCredentials` is turned off, the plugin falls back to “env-file-only storage” and never writes a half-migrated state.
- **Fences and file permissions are explicit constraints**: routes are loopback + same-origin only, the env file is always 0600, and the docs explicitly warn against exposing the GUI port through tunnels / reverse proxies.

![Environment variables / secrets card](https://cdn.jsdelivr.net/gh/hyzyn/dsh-plugin-kit@main/docs/dsh-plugin-kit-env.png)

## Routes

Loopback + same-origin access only:

- `GET /api/dsh-env/list` — lists all environment variables (secret entries have a null value and never return plaintext; `storage: refs` means the value lives in the official credential store, `file` means it stays in the env file)
- `POST /api/dsh-env/save` — saves the whole set (validates key names, de-duplicates, then writes back; an entry whose value is null keeps its stored value; secret values are automatically written into the credential store, and on write failure they stay in the file and `warnings` are returned)

## Installation

```bash
pnpm --filter @hyzyn/dsh-env build
dsh plugin --profile web add link:$(pwd)/packages/env
```

The plugin’s own line is mounted by `insert: { id: env-manager, name: '@hyzyn/dsh-env' }` in `cordis.patch.yml`; saving environment variables writes them into `process.env` immediately, with no host process restart.

## Configuration

```ts
interface Config {
  /** Disable the whole plugin. Default false. */
  enabled?: boolean
  /** Whether to inject the plugin capability announcement to the agent. Default true. */
  announceToAgent?: boolean
  /** Whether to write resolved values into process.env on save/startup. Default true. */
  applyToProcessEnv?: boolean
  /** Whether secret values are stored in the official credential store (.credentials.yaml refs). Default true; when disabled, everything stays in the env file. */
  secretsInCredentials?: boolean
}
```

## Note

- The managed block is marked with `# --- dsh-env-manager managed ...`; the plugin rewrites only that block and leaves everything else exactly as it is.
- **Credential-store migration**: on startup, secret entries that carry plaintext values are automatically migrated into the official credential store; it is idempotent and non-destructive — values are removed from the env file only for entries written successfully. Three kinds of entries stay in the env file: `js:` references, empty values (the official store rejects empty strings), and keys shadowed by the startup environment or already present in refs (**values the user stored through the official UI are not overwritten**).
- When the host provides no credential seam, or `secretsInCredentials: false` is configured, the plugin falls back entirely to env-file-only storage mode.
- Key names must match `[A-Za-z_][A-Za-z0-9_]*` and must not repeat.
- `js:` expressions are evaluated inside the host (the same trust model as the loader); only expressions this machine can resolve should be stored.
- The env file is always written to disk with 0600 (it carries the manifest and a small amount of legacy plaintext, and does not inherit pre-existing permissive permissions).
- Upgrade note: after migration the secret values live in `.credentials.yaml`, so rolling back to an older, pre-migration version of the plugin against the same `~/.dsh` is not recommended.
- Security note: the routes trust loopback + same-origin requests only and have no authentication — any process or tunnel that can reach the port with local loopback identity (such as an `ssh -L` port forward, or a local reverse proxy that rewrites Host to localhost) can read values that have not been migrated into the credential store; `js:` prefixed values are executed inside the host process, which is equivalent to local code execution. Do not expose the GUI port to untrusted networks through tunnels / proxies unless authentication is added on top.
