/**
 * `dshEnvReady` 的**契约**用例（跨包时序）。
 *
 * 消费者（codegraph 的 per-agent 挂载等）不在加载顺序上赌运气，而是等这个服务；它必须满足：
 *
 * 1. **正常配置**：apply() 里同步注入之后 provide，值为 `{ enabled: true, keys: [...], at }`；
 *    `keys` 是本次注入的**键名**（不含值）；
 * 2. **被禁用**（`enabled: false`）：也必须 provide，值为 `{ enabled: false, keys: [] }` ——
 *    否则等它的消费者会永远等下去（`desktop` 这类宿主可能随时禁用插件）；
 * 3. 服务名与形状是跨包契约，改它等于改公共接口（见 [docs/architecture.md](../../../docs/architecture.md)）。
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ENV_READY_SERVICE, apply } from '../src/index.js'
import type { EnvReadyInfo } from '../src/index.js'

const MARK_START = '# --- dsh-env-manager managed (auto-generated; do not edit) ---'
const MARK_END = '# --- end dsh-env-manager managed ---'

let dir: string
let envFile: string
const originalEnvFile = process.env.DSH_ENV_FILE
const originalCredsFile = process.env.DSH_ENV_CREDENTIALS_FILE

/** 只记录 provide 的最小 ctx：`inject` 不触发任何宿主服务（webServer / systemPrompt 等）。 */
function fakeCtx() {
  const provided = new Map<string, unknown>()
  const ctx = {
    inject: () => {},
    effect: () => {},
    provide(name: string, value: unknown) {
      provided.set(name, value)
      return () => {}
    },
  }
  return { ctx, provided }
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'dsh-env-ready-'))
  envFile = join(dir, 'env.yml')
  process.env.DSH_ENV_FILE = envFile
  process.env.DSH_ENV_CREDENTIALS_FILE = join(dir, '.credentials.yaml')
  delete process.env.READY_ONE
  delete process.env.READY_TWO
})

afterEach(() => {
  if (originalEnvFile === undefined) delete process.env.DSH_ENV_FILE
  else process.env.DSH_ENV_FILE = originalEnvFile
  if (originalCredsFile === undefined) delete process.env.DSH_ENV_CREDENTIALS_FILE
  else process.env.DSH_ENV_CREDENTIALS_FILE = originalCredsFile
  delete process.env.READY_ONE
  delete process.env.READY_TWO
  rmSync(dir, { recursive: true, force: true })
})

describe('dshEnvReady：时序契约', () => {
  it('正常配置：同步注入之后 provide，keys 是键名（不含值）', () => {
    writeFileSync(
      envFile,
      [
        MARK_START,
        '- key: READY_ONE',
        '  value: one',
        '  secret: false',
        '- key: READY_TWO',
        '  value: two',
        '  secret: false',
        MARK_END,
        '',
      ].join('\n'),
    )
    const { ctx, provided } = fakeCtx()
    apply(ctx as never, { announceToAgent: false })

    expect(process.env.READY_ONE, 'apply() 返回时值必须已经写进 process.env').toBe('one')
    const ready = provided.get(ENV_READY_SERVICE) as EnvReadyInfo
    expect(ready, '必须 provide 就绪服务').toBeDefined()
    expect(ready.enabled).toBe(true)
    expect(ready.keys.sort()).toEqual(['READY_ONE', 'READY_TWO'])
    expect(JSON.stringify(ready), '服务值里不许出现密钥值').not.toContain('"one"')
  })

  it('被禁用时也要 provide（enabled: false），否则消费者会永远等', () => {
    const { ctx, provided } = fakeCtx()
    apply(ctx as never, { enabled: false, announceToAgent: false })

    const ready = provided.get(ENV_READY_SERVICE) as EnvReadyInfo
    expect(ready).toBeDefined()
    expect(ready).toEqual({ enabled: false, keys: [], at: expect.any(Number) })
    expect(process.env.READY_ONE, '禁用时不该注入').toBeUndefined()
  })
})
