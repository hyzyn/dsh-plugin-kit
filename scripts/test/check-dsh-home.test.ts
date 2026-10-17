/**
 * `scripts/check-dsh-home.mjs` 的用例 —— 「`DSH_HOME` 卫生」这道闸（codegraph CG35 + codegraph CG68）。
 *
 * 守四件事：
 *
 * 1. **判据 2 的核心形状**：哨兵 home 里出现任何文件都要报，且报错要说清「怎么修」
 *    （指向 `adoption.test.ts` 的文件级 `beforeAll` 写法）——看到红的人只会删文件、
 *    不会去查是哪个用例写的，所以消息本身就是修法的入口。
 * 2. **套件失败时不许放行**（这条是这道闸最容易做反的地方）：`vitest` 非零退出 +
 *    哨兵目录**空的**，看着像「没写东西所以通过」，实际是**用例在写出文件之前就挂了**，
 *    判据根本没被评估。恒绿闸门比没有更坏（本仓 `check-test-collection.mjs` 的判据 2
 *    钉的是同一件事）。
 * 3. **为什么不用文本判据**：实测 36 个「从包 `src` import 了 `apply`」的测试文件里
 *    只有 15 个写了 `process.env.DSH_HOME =`，另 21 个放进空哨兵目录跑**全部写出 0 文件**
 *    （它们压根不碰 home）。所以「调 `apply()` 就必须出现 `DSH_HOME` 字样」会一次造出
 *    21 个假阳性，而那些豁免必然腐烂。这里用夹具把「不该报的形状」钉住：写出为空 = 无违规，
 *    **与文件里有没有 `DSH_HOME` 字样无关**。
 * 4. **判据 1 对真实仓库成立**（CG35 的现状）：全仓除 kit 外没有第二处 `DSH_HOME` 推导。
 *
 * 不真跑 `vitest run`（判据 2 的执行侧只在 CLI 路径上付那 41s）：这里只喂观测结果。
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { evaluateHomeProbe, findRawDerivations, listFilesUnder } from '../check-dsh-home.mjs'

describe('evaluateHomeProbe：哨兵 home 的观察结果 → 违规', () => {
  it('目录空且套件跑完 → 无违规（这就是「用例都兜住了」）', () => {
    expect(evaluateHomeProbe({ written: [], suiteFailed: false })).toEqual([])
  })

  it('写出一个文件 → 报，且消息里点名那个文件', () => {
    const violations = evaluateHomeProbe({ written: ['cordis.patch.yml'], suiteFailed: false })
    expect(violations).toHaveLength(1)
    expect(violations[0]).toContain('cordis.patch.yml')
  })

  it('报错必须给出修法的入口（照哪个文件抄写法）——否则看到红的人只会删文件', () => {
    const message = evaluateHomeProbe({ written: ['env.yml'], suiteFailed: false }).join('\n')
    expect(message).toContain('adoption.test.ts')
    /*
     * 编号断言刻意钉**带包名的形式**：这条消息是给人看的 L2 指针，出现在 scripts/（不是 codegraph
     * 包内），按 docs/conventions.md § 编号规范 硬规矩 2「跨包引用一律写 `<包名> <前缀><号>`」。
     *
     * 也刻意**不新开编号**：这道闸是 `codegraph CG68` 那一条的补记（缺的是闸门，不是隔离），
     * 台账里 CG68 的修复列已经记了它、上限仍是 CG68。这里曾经写着一个台账里并不存在的号，
     * 属悬空引用——**别把断言改成 `CG68` 之外的任何号**，要动先看 DEFECTS.md 的编号口径。
     */
    expect(message).toContain('codegraph CG68')
    expect(message).toContain('真实')
  })

  it('**套件失败 + 目录空 → 仍要报「无法评估」**（空目录不代表通过）', () => {
    const violations = evaluateHomeProbe({ written: [], suiteFailed: true })
    expect(violations).toHaveLength(1)
    expect(violations[0]).toContain('无法评估')
  })

  it('套件失败**又**写出了文件 → 两条都要报（不能因为先命中一个就吞掉污染事实）', () => {
    const violations = evaluateHomeProbe({ written: ['prompts.yml'], suiteFailed: true })
    expect(violations).toHaveLength(2)
    expect(violations.join('\n')).toContain('prompts.yml')
    expect(violations.join('\n')).toContain('无法评估')
  })

  it('判据与「文件里有没有 `DSH_HOME` 字样」无关：写出为空就是过（这条钉住为什么不用文本判据）', () => {
    // 夹具语义：packages/tty/test/tty-run.test.ts 这类文件一个字 `DSH_HOME` 都没有，
    // 但实测放进哨兵目录跑 → 写出 0 文件。文本判据会红，行为判据不会。
    expect(evaluateHomeProbe({ written: [], suiteFailed: false })).toEqual([])
  })
})

describe('listFilesUnder：递归列文件，相对哨兵目录', () => {
  it('嵌套目录里的文件也要数到（home 下的落点不止顶层：tty/ profiles/ dsh-kit/ 都是子目录）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-home-list-'))
    try {
      mkdirSync(join(dir, 'tty'), { recursive: true })
      writeFileSync(join(dir, 'cordis.patch.yml'), '')
      writeFileSync(join(dir, 'tty', 'shell-integration.sh'), '')
      expect(listFilesUnder(dir).sort()).toEqual(['cordis.patch.yml', join('tty', 'shell-integration.sh')])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('目录不存在 → 空数组（不许抛：判据 2 要在套件崩了的时候仍能回答「写出了什么」）', () => {
    expect(listFilesUnder(join(tmpdir(), 'definitely-not-here-dsh-home'))).toEqual([])
  })
})

describe('findRawDerivations：判据 1 对真实仓库成立（CG35）', () => {
  it('全仓除 kit 外没有第二处 DSH_HOME 推导', () => {
    expect(findRawDerivations()).toEqual([])
  })
})
