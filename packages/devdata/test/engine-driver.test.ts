/**
 * 可选驱动加载器的行为测试（配套守卫见 `engine-deps.guard.test.ts`）。
 *
 * 这一层要守的**不是**「能不能加载」，而是**失败时说哪句话**：
 * 可选依赖的典型失败是一句 `Cannot find module 'mysql2'`——它既不说是哪个引擎要用它、
 * 也不说怎么补，而「以为漏装了 → 顺手写进 `dependencies`」正好把「驱动可选」这条规矩拆掉。
 */

import { describe, expect, it } from 'vitest'

import { KNOWN_ENGINE_DRIVERS, loadOptionalDriver, missingDriverMessage } from '../src/index.js'

describe('缺驱动时的恢复路径', () => {
  it('说清三件事：哪个引擎、装哪个包、以及**为什么不预装**', () => {
    const text = missingDriverMessage({ driver: 'tedious', engine: 'sqlserver' })
    expect(text).toContain('sqlserver')
    expect(text).toContain('tedious')
    expect(text).toContain('npm install tedious')
    // 「为什么不预装」必须在里面：否则下一个人会以为这只是漏装，然后把驱动写进 dependencies
    expect(text).toContain('刻意不预装')
    expect(text).toContain('Azure')
  })

  it('驱动名不是写死的：known 清单只用来把话说准，清单外也能问', () => {
    expect(KNOWN_ENGINE_DRIVERS).toContain('mysql2')
    expect(missingDriverMessage({ driver: 'some-future-driver', engine: 'whatever' })).toContain('npm install some-future-driver')
  })
})

describe('loadOptionalDriver', () => {
  it('装了的模块正常加载（**正向对照**：没有它，下面那条只会证明「总是抛」）', async () => {
    // `js-yaml` 是 devdata 的真实运行时依赖，必然可解析。
    const mod = (await loadOptionalDriver({ driver: 'js-yaml', engine: '对照' })) as { load?: unknown }
    expect(typeof mod.load).toBe('function')
  })

  it('没装的驱动 → 抛的是**可执行的那句话**，不是 `Cannot find module`', async () => {
    // `mysql2` 刻意不在依赖里（这正是这条规矩要的），所以它必然加载失败。
    await expect(loadOptionalDriver({ driver: 'mysql2', engine: 'mysql' })).rejects.toThrow(/npm install mysql2/)
    await expect(loadOptionalDriver({ driver: 'mysql2', engine: 'mysql' })).rejects.toThrow(/验 mysql /)
    // 反向也钉住：不许把原来那句原样漏出去
    await expect(loadOptionalDriver({ driver: 'mysql2', engine: 'mysql' })).rejects.not.toThrow(/^Cannot find module/)
  })

  it('**驱动自己加载时抛的错原样穿出去**——不许说成「没装」', async () => {
    /*
     * 夹具是个「装好了、但加载时自己炸」的模块（`test/fixtures/driver-boom.mjs`）。
     * 把它说成「没装」会让人去重装一个本来就装好的包，那是把排障带偏。
     *
     * **必须传绝对 URL**：`loadOptionalDriver` 里的 `import(spec)` 是相对
     * `src/engine-driver.ts` 解析的，`'./fixtures/…'` 会指向 `src/fixtures/`（不存在），
     * 于是走了「没装」分支——这一条第一次写错就是这么错的（用例自己发现的）。
     */
    const boom = new URL('./fixtures/driver-boom.mjs', import.meta.url).href
    await expect(loadOptionalDriver({ driver: boom, engine: '夹具' })).rejects.toThrow(/驱动自己炸了：配置格式不对/)
    await expect(loadOptionalDriver({ driver: boom, engine: '夹具' })).rejects.not.toThrow(/刻意不预装/)
  })
})
