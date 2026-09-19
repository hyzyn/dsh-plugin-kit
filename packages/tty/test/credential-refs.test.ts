/**
 * @hyzyn/dsh-tty — 凭据引用名读取单测（DEFECTS D38 第 4 刀 / D45 的 credential-refs 面）。
 *
 * `readCredentialRefNames` 是 `/api/dsh-tty/credential-refs` 路由与 SSH 对话框
 * 引用选择器的数据源：读 `$DSH_HOME/.credentials.yaml` 的 `refs:` 块键名。
 * 只验「键名解析 + 只回键名不回值」——值在任何返回值里都不允许出现。
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readCredentialRefNames, handleCredentialRefsRoute } from '../src/index.js'

let home = ''
const savedDshHome = process.env.DSH_HOME

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'dsh-tty-creds-'))
  process.env.DSH_HOME = home
})

afterEach(() => {
  if (savedDshHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = savedDshHome
  rmSync(home, { recursive: true, force: true })
})

const SECRET_A = 'sup3r-secret-value-A'
const SECRET_B = 'sup3r-secret-value-B'

function writeStore(content: string): void {
  writeFileSync(join(home, '.credentials.yaml'), content, 'utf8')
}

describe('readCredentialRefNames（credential-refs 数据源）', () => {
  it('解析 refs: 块键名，去重排序；值绝不外泄', () => {
    writeStore([
      'version: 1',
      'refs:',
      `  DSH_TTY_BETA: ${SECRET_B}`,
      `  DSH_TTY_ALPHA: ${SECRET_A}`,
      `  DSH_TTY_ALPHA: ${SECRET_A} # 重复键：本地 provider 不会写，容忍`,
      'other_section:',
      '  NOT_A_REF: x',
    ].join('\n'))
    const names = readCredentialRefNames()
    expect(names).toEqual(['DSH_TTY_ALPHA', 'DSH_TTY_BETA'])
    // 只验引用名不验值：两个秘密值都不允许出现在返回结构里
    expect(JSON.stringify(names)).not.toContain(SECRET_A)
    expect(JSON.stringify(names)).not.toContain(SECRET_B)
  })

  it('refs: 之外的顶层区块与缩进不符的行不采集', () => {
    writeStore([
      'version: 1',
      'refs:',
      '  DSH_TTY_GOOD: v',
      '    DSH_TTY_DEEP: v', // 三空格：不是引用条目
      'DSH_TTY_TOPLEVEL: v', // 顶层键：不是引用
      '  lowercase_bad-name: v', // 非 POSIX 标识符（含 -）：不采集
    ].join('\n'))
    expect(readCredentialRefNames()).toEqual(['DSH_TTY_GOOD'])
  })

  it('存储文件不存在 → 空数组（不报错）', () => {
    expect(readCredentialRefNames()).toEqual([])
  })
})

/* ---------------------------------------------------------------- */
/* 路由本身：loopback 闸门 / 方法闸门 / 载荷只带名字（D45 的这一面）      */
/* ---------------------------------------------------------------- */

interface FakeRes {
  status: number
  body: string
  headers: Record<string, string>
}

/** 最小 req/res 替身：足够驱动 handleCredentialRefsRoute 的三条分支。 */
function fakeReq(overrides: { method?: string; remoteAddress?: string; host?: string; origin?: string; secFetchSite?: string } = {}): unknown {
  const headers: Record<string, string> = { host: overrides.host ?? '127.0.0.1:3080' }
  if (overrides.origin !== undefined) headers.origin = overrides.origin
  if (overrides.secFetchSite !== undefined) headers['sec-fetch-site'] = overrides.secFetchSite
  return { method: overrides.method ?? 'GET', headers, socket: { remoteAddress: overrides.remoteAddress ?? '127.0.0.1' } }
}

function fakeRes(): FakeRes & { res: unknown } {
  const captured: FakeRes = { status: 0, body: '', headers: {} }
  const res = {
    writeHead(status: number, headers?: Record<string, string>) {
      captured.status = status
      captured.headers = headers ?? {}
    },
    end(body?: string) {
      captured.body = typeof body === 'string' ? body : ''
    },
  }
  return Object.assign(captured, { res })
}

describe('handleCredentialRefsRoute（/api/dsh-tty/credential-refs）', () => {
  it('loopback + GET → 200，载荷只含引用名', async () => {
    writeStore(['refs:', `  DSH_TTY_ALPHA: ${SECRET_A}`].join('\n'))
    const captured = fakeRes()
    await handleCredentialRefsRoute(fakeReq() as never, captured.res as never)
    expect(captured.status).toBe(200)
    expect(captured.headers['content-type']).toContain('application/json')
    expect(JSON.parse(captured.body)).toEqual({ ok: true, names: ['DSH_TTY_ALPHA'] })
    expect(captured.body).not.toContain(SECRET_A)
  })

  it('非 loopback 来源 → 403，不回名字', async () => {
    writeStore(['refs:', `  DSH_TTY_ALPHA: ${SECRET_A}`].join('\n'))
    const captured = fakeRes()
    await handleCredentialRefsRoute(fakeReq({ remoteAddress: '10.0.0.5' }) as never, captured.res as never)
    expect(captured.status).toBe(403)
    expect(captured.body).toContain('loopback-only')
    expect(captured.body).not.toContain('DSH_TTY_ALPHA')
  })

  it('跨站发起的请求 → 403（sec-fetch-site: cross-site，挡 DNS rebinding 面）', async () => {
    const captured = fakeRes()
    await handleCredentialRefsRoute(fakeReq({ secFetchSite: 'cross-site' }) as never, captured.res as never)
    expect(captured.status).toBe(403)
  })

  it('host 头不是 loopback → 403', async () => {
    const captured = fakeRes()
    await handleCredentialRefsRoute(fakeReq({ host: 'evil.example.com' }) as never, captured.res as never)
    expect(captured.status).toBe(403)
  })

  it('origin 与 host 不一致 → 403', async () => {
    const captured = fakeRes()
    await handleCredentialRefsRoute(fakeReq({ origin: 'http://evil.example.com' }) as never, captured.res as never)
    expect(captured.status).toBe(403)
  })

  it('非 GET（POST/DELETE）→ 405，方法名回显在错误里', async () => {
    const captured = fakeRes()
    await handleCredentialRefsRoute(fakeReq({ method: 'POST' }) as never, captured.res as never)
    expect(captured.status).toBe(405)
    expect(captured.body).toContain('POST')
  })
})
