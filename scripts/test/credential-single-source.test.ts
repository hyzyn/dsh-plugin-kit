/**
 * 「凭据解析只许一份实现」守卫（L0）。
 *
 * ## 为什么是 L0
 *
 * 判据跨包：唯一实现方在 `kit`，消费者是 `tty`（PTY 那一层）、`docker`（本地再导出壳）与
 * `devfront`（`site_fill` 的引用填值）。放在任一包里都会变成「另一个包的事，我不看」——
 * 与 `ssh-single-source.test.ts` 同一套分法（见 conventions.md § L0 / L1 的边界判据）。
 *
 * ## 它守的两件事（都来自 2026-10-04 那次上收）
 *
 * 1. **实现只有一份**，在 `packages/kit/src/credentials.ts`；别处只许**再导出**。
 *    两份实现曾经并存的代价是实打实的：`tty` 那份与 `kit` 那份各自演进过，于是「引用存在但值是
 *    空串」这条诊断只在一边有；而第三份的诱惑（`devfront` 要 30 行解析）会让人顺手 import
 *    `@hyzyn/dsh-kit/ssh-exec`——那会把 `ssh2` 拉进一个浏览器工具包。
 * 2. **每个绑定点都带 owner**。绑定的载体是按 owner 的映射，缺了 owner 就等于回到那个进程级单例槽：
 *    `tty` / `docker` 谁先卸载，谁就把对方的凭据通道一起关掉（此后静默退回 `process.env`，
 *    症状是「刚才还能连，现在报凭据未设置」）。这条判据**必须**有守卫——它错起来毫无症状。
 *
 * ## 反例
 *
 * 两个检查函数都是纯函数，各配一条 fixture 反例（「把实现抄回来」「绑定漏了 owner」的原始形态），
 * 并断言检查函数**报出**了违规——静态守卫最常见的失败形态是恒绿。
 */
import { readdirSync, readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const REPO = new URL('../../', import.meta.url)

/** 唯一实现方（判据里点名的那个，不靠扫描推断）。 */
export const KIT_CREDENTIALS = 'packages/kit/src/credentials.ts'

/** 判定「这个文件里有实现」的标记：出现即说明它在定义，而不是在再导出。 */
const IMPLEMENTATION_MARKERS = [
  /export\s+async\s+function\s+resolveSecretVia\s*\(/,
  /export\s+async\s+function\s+resolveCredentialVia\s*\(/,
  /export\s+function\s+setCredentialResolver\s*\(/,
  /let\s+credentialsProvider\s*:/,
]

/** 判据 1：返回**实现**了凭据解析的文件（消费者只该出现在再导出里）。 */
export function credentialImplementations(files: readonly { path: string; text: string }[]): string[] {
  return files.filter((file) => IMPLEMENTATION_MARKERS.some((marker) => marker.test(file.text))).map((file) => file.path)
}

/**
 * 注释行：**判前要先去掉**。
 *
 * 这类静态判据最经典的假阳性就在这里——本仓已经踩过一次（`indexforce` 那份夹具抄漏了收尾比对，
 * 而守卫因为正则命中了它的一句注释而保持全绿）。这一条不是保险，是判据的一部分：
 * `tty/src/ssh.ts` 的说明注释里就写着 `setCredentialResolver(null)` 那个旧写法。
 */
function isCommentLine(line: string): boolean {
  const trimmed = line.trim()
  return trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*')
}

/**
 * 判据 2：返回**绑定凭据 provider 却没给 owner** 的调用点。
 *
 * 认的是形如 `setCredentialResolver(<参数>, '<owner>')` 的两参调用；单参（或第二参不是字符串字面量）
 * 一律算违规——包括 `setCredentialResolver(null)` 这种解绑。
 */
export function callsMissingOwner(files: readonly { path: string; text: string }[]): string[] {
  const problems: string[] = []
  for (const file of files) {
    file.text.split('\n').forEach((line, index) => {
      if (isCommentLine(line)) return
      if (!line.includes('setCredentialResolver(')) return
      if (line.includes('setCredentialResolver(resolver') || line.includes('export function setCredentialResolver')) return
      // 行尾是 `, '<owner>')` 就算带上了 owner；`[^)]*` 那种写法会被参数里的类型断言括号骗到。
      if (/,\s*['"][^'"]+['"]\s*\)\s*[;}]?\s*$/.test(line)) return
      problems.push(`${file.path}:${String(index + 1)}`)
    })
  }
  return problems
}

/**
 * 判据 2 的辅助：真正出现**绑定/解绑调用**的文件（去注释之后）。
 *
 * 与「文件里出现过这个字符串」分开——`tty/src/ssh.ts` 的说明注释里就写着旧写法，用它当
 * 「绑定点还在不在」的证据会算错一个文件。
 */
export function bindingSites(files: readonly { path: string; text: string }[]): string[] {
  return files
    .filter((file) =>
      file.text
        .split('\n')
        .some((line) => !isCommentLine(line) && line.includes('setCredentialResolver(') && !line.includes('export function')),
    )
    .map((file) => file.path)
}

/** 扫全仓包源码（`packages/<pkg>/src/*.ts`）。 */
function sourceFiles(): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = []
  const packagesDir = new URL('packages/', REPO)
  for (const dir of readdirSync(packagesDir)) {
    let files: string[]
    try {
      files = readdirSync(new URL(`${dir}/src/`, packagesDir))
    } catch {
      continue
    }
    for (const file of files) {
      if (!file.endsWith('.ts')) continue
      const path = `packages/${dir}/src/${file}`
      out.push({ path, text: readFileSync(new URL(path, REPO), 'utf8') })
    }
  }
  return out
}

describe('凭据解析：实现只许一份', () => {
  it('全仓只有 kit 的 credentials.ts 有实现', () => {
    expect(credentialImplementations(sourceFiles())).toEqual([KIT_CREDENTIALS])
  })

  it('kit 的 ssh-exec 与 tty 的 ssh 是再导出壳（没把实现抄回去）', () => {
    const shells = [
      { path: 'packages/kit/src/ssh-exec.ts', from: "from './credentials.js'" },
      { path: 'packages/tty/src/ssh.ts', from: "from '@hyzyn/dsh-kit'" },
    ]
    for (const shell of shells) {
      const text = readFileSync(new URL(shell.path, REPO), 'utf8')
      expect(text, shell.path).toContain(shell.from)
      expect(IMPLEMENTATION_MARKERS.some((marker) => marker.test(text)), `${shell.path} 里出现了实现`).toBe(false)
    }
  })

  it('反例：把实现抄回来时这条判据会报出来（不是恒绿）', () => {
    const fake = [
      { path: 'packages/kit/src/credentials.ts', text: 'export async function resolveSecretVia(p, v) {}' },
      { path: 'packages/other/src/cred.ts', text: 'export function setCredentialResolver(r) { credentialsProvider = r }' },
    ]
    expect(credentialImplementations(fake)).toEqual(['packages/kit/src/credentials.ts', 'packages/other/src/cred.ts'])
  })
})

describe('凭据绑定：每个调用点都要带 owner', () => {
  it('全仓所有绑定/解绑都带了 owner', () => {
    expect(callsMissingOwner(sourceFiles())).toEqual([])
  })

  it('绑定点真的存在（否则上面那条是「扫了个空」），且只有 tty / docker 绑那个单例', () => {
    expect(bindingSites(sourceFiles()).sort()).toEqual(['packages/docker/src/index.ts', 'packages/tty/src/index.ts'])
  })

  it('反例：漏了 owner 的单参调用会被报出来', () => {
    const fake = [
      { path: 'packages/x/src/index.ts', text: "      setCredentialResolver(provider)\n      return () => { setCredentialResolver(null) }" },
    ]
    expect(callsMissingOwner(fake)).toHaveLength(2)
    // 注释里那句同样的写法不算违规（假阳性就是这么来的）。
    expect(callsMissingOwner([{ path: 'b.ts', text: ' * 从前这里写的是 setCredentialResolver(null)' }])).toEqual([])
    // 带 owner 的两种写法都放行（绑定与解绑）。
    expect(
      callsMissingOwner([{ path: 'a.ts', text: "setCredentialResolver(provider, 'x')\nsetCredentialResolver(null, 'x')" }]),
    ).toEqual([])
  })
})
