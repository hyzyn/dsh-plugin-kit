/**
 * **数据路由准入只有一份实现**（L0 守卫）——`kit.admitRoute`，不许再在包里自带副本。
 *
 * 背景（ROADMAP 第 13 项，2026-11-13）：`search` / `codegraph` / `env` / `profile` /
 * `prompt` / `rss` 六个包的数据路由此前各自带一份 `isLoopbackRequest` 副本（或在 handler
 * 里直接写 `forbidden: loopback-only`），语义一致但改动必然漂；更要紧的是它们只认回环，
 * 反代 / `--trusted-host` 部署下整块 403。现在统一走 `@hyzyn/dsh-kit` 的 `admitRoute`
 * （行为测试在 `packages/kit/test/http.test.ts`）。
 *
 * 本文件钉的是「只有一份」这件事本身：**行为测试保不住副本**——下一位作者复制粘贴就能把
 * 副本种回来，而没有任何闸门会红。三条判据各配一条反例（旧形状必须被判违规），守卫本身
 * 不许做成恒绿。
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = join(import.meta.dirname, '..', '..')

/** 已接入 `admitRoute` 的六个数据路由包。 */
const ADMITTED_PACKAGES = ['search', 'codegraph', 'env', 'profile', 'prompt', 'rss'] as const

const readSource = (pkg: string): string =>
  readFileSync(join(repoRoot, 'packages', pkg, 'src', 'index.ts'), 'utf8')

/** 判据 1：包里又定义了一份 `isLoopbackRequest`。 */
const definesLocalFence = (src: string): boolean => /function\s+isLoopbackRequest\s*\(/.test(src)
/** 判据 2：包自己写 `forbidden: loopback-only`（错误码该由 `admitRoute` 给）。 */
const writesLoopbackOnly = (src: string): boolean => src.includes('forbidden: loopback-only')
/** 判据 3：路由闸门真的调了 `admitRoute(ctx, req)`。 */
const admitsThroughKit = (src: string): boolean => /admitRoute\(ctx,\s*req\)/.test(src)

describe('数据路由准入只有一份实现（kit.admitRoute）', () => {
  it('六个包都不再定义本地 isLoopbackRequest 副本', () => {
    for (const pkg of ADMITTED_PACKAGES) {
      expect(definesLocalFence(readSource(pkg)), `${pkg} 又自带了 loopback 围栏副本`).toBe(false)
    }
  })

  it('六个包都经 admitRoute(ctx, req) 准入', () => {
    for (const pkg of ADMITTED_PACKAGES) {
      expect(admitsThroughKit(readSource(pkg)), `${pkg} 没走 kit.admitRoute`).toBe(true)
    }
  })

  it('六个包不再自己写 forbidden: loopback-only', () => {
    for (const pkg of ADMITTED_PACKAGES) {
      expect(writesLoopbackOnly(readSource(pkg)), `${pkg} 绕过了 admitRoute 的错误码`).toBe(false)
    }
  })

  it('反例：改动前的形状必须被判违规（守卫不许恒绿）', () => {
    const legacyFence = [
      'function isLoopbackRequest(request: ReqLike): boolean {',
      '  return request.socket.remoteAddress === \'127.0.0.1\'',
      '}',
    ].join('\n')
    const legacyGuard = "writeJson(res, 403, { error: 'forbidden: loopback-only' })"
    expect(definesLocalFence(legacyFence)).toBe(true)
    expect(writesLoopbackOnly(legacyGuard)).toBe(true)
    expect(admitsThroughKit(legacyGuard)).toBe(false)
  })
})

/**
 * 加固档四包**不许**接 `admitRoute`——这是 ROADMAP § 5.4 选③「维持回环专属」的守卫面。
 *
 * 为什么需要这条：上一条只钉「六个体走 admitRoute」，没钉「另外四个不走」。谁给 `docker`
 * 顺手加一句 `admitRoute`，上面全绿——而远程浏览器会话就此拿到了 stop/remove/exec 与
 * 开 shell 的能力，正是 § 5.4 明确拒绝的那条路（②）。文档里那张「反代下能不能用」的表
 * （[troubleshooting.md](../../docs/troubleshooting.md)）靠这一条才和代码绑在一起。
 *
 * 放开的前提是维护者改判 § 5.4（并从 ① 逐端点白名单里选），不是这条测试「顺手放宽」。
 */
const STRICT_TIER_PACKAGES = ['docker', 'tty', 'mcp', 'loglens'] as const

describe('加固档四包维持回环专属（ROADMAP § 5.4 决定 ③）', () => {
  it('docker / tty / dsh-mcp / loglens 都不接 admitRoute', () => {
    for (const pkg of STRICT_TIER_PACKAGES) {
      expect(admitsThroughKit(readSource(pkg)), `${pkg} 接了 admitRoute：远程会话会拿到变更 / 执行面，先改 ROADMAP § 5.4`).toBe(false)
    }
  })

  it('反例：搭好 admitRoute 的闸门必须被判违规（守卫不许恒绿）', () => {
    expect(admitsThroughKit('const rejection = admitRoute(ctx, req)')).toBe(true)
  })
})
