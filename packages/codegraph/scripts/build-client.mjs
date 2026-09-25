#!/usr/bin/env node
/**
 * @hyzyn/dsh-codegraph — 浏览器半体打包脚本。
 *
 * 本半体没有第三方依赖（React 由宿主的 require 提供），无需打包：把 client-src/index.js
 * 产成包根的 client.js 即可。但要处理 client-src/pure.js —— 纯逻辑单独成文件是为了能进
 * vitest（DEFECTS.md §4 冻结的「验收记录」点名的覆盖空洞），而 client.js 必须是**单文件、无 import**
 * 的产物，所以这里做两步替换：
 *
 *   1. 删掉 index.js 顶部对 './pure.js' 的 import 行；
 *   2. 把 pure.js 的 `export ` 前缀剥掉，整段内联到 index.js factory 里的
 *      `__CODEGRAPH_PURE_INLINE__` 标记处。
 *
 * 内联点放在 **factory 内**而不是文件顶层：client.js 被页面重载 / HMR 再次执行时，顶层
 * `const` 会「Identifier has already been declared」直接抛错，factory 内的声明每次调用
 * 都是新的。
 *
 * 要点在「产物 = 源码」这道闸：CI 的 artifact-diff 在 `pnpm -r build` 后对全部包的
 * client.js 做 git diff，源码改了而没重跑 build 就会红——以前 client.js 是手写产物，
 * 没有这个闸，漂移只能靠人肉发现（CG28；tty 已经走通同一条路，那边用 esbuild 是因为
 * 有 xterm 依赖）。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/** 内联锚点：写在 index.js 的 factory 体内，独占一行，前后可缩进。 */
const INLINE_MARKER = '/* __CODEGRAPH_PURE_INLINE__ */'
/** 只删这一行 import，别碰文件里其他任何东西。 */
const PURE_IMPORT = /^[ \t]*import\s*\{[^}]*\}\s*from\s*'\.\/pure\.js'[ \t]*\r?\n/m
/** 只剥声明前的 `export`，注释里出现的 export 不受影响。 */
const EXPORT_PREFIX = /^[ \t]*export[ \t]+(?=(?:const|let|var|function|class)[ \t])/gm
/** 内联进 factory 后统一缩进 4 空格，与周围代码对齐。 */
const INDENT = '    '

const purePath = join(root, 'client-src', 'pure.js')
const sourcePath = join(root, 'client-src', 'index.js')
const outPath = join(root, 'client.js')

const source = readFileSync(sourcePath, 'utf8')
if (!PURE_IMPORT.test(source)) {
  // 宁可红：import 没了说明 index.js 已经不再引用 pure.js，此时内联只会塞进一段死代码；
  // 而如果是有意删掉引用，也应该顺手删掉这个脚本里的内联逻辑。
  console.error('[dsh-codegraph] client-src/index.js 里找不到 `import ... from \'./pure.js\'` ——'
    + ' 是引用被删了，还是 import 写法变了？确认后同步 scripts/build-client.mjs。')
  process.exit(1)
}

const markerPattern = new RegExp('^[ \\t]*' + INLINE_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[ \\t]*$', 'm')
if (!markerPattern.test(source)) {
  console.error('[dsh-codegraph] client-src/index.js 里找不到内联锚点 ' + INLINE_MARKER + ' —— 别删它，pure.js 靠它落位。')
  process.exit(1)
}

const inlined = readFileSync(purePath, 'utf8')
  .replace(EXPORT_PREFIX, '')
  .trimEnd()
  .split('\n')
  .map((line) => (line === '' ? '' : INDENT + line))
  .join('\n')

const strippedImport = source.replace(PURE_IMPORT, '')
const residualImport = strippedImport.match(/^[ \t]*import[ \t].*$/m)
if (residualImport !== null) {
  // 产物必须是单文件：宿主经 client-modules 供给时不会解析相对路径，残留 import 只会在
  // 浏览器里变成一句 "Cannot use import statement outside a module"。
  console.error('[dsh-codegraph] client.js 产物里会残留 import：' + residualImport[0].trim())
  process.exit(1)
}

// CG38：replacement 必须是**函数**——字符串替换里 pure.js 内容一旦出现 `$&` / `$'` /
// `$1` 会被当成替换模式吃掉，而且整个过程是确定性的，CI 照绿。函数形式原样返回。
writeFileSync(outPath, strippedImport.replace(markerPattern, () => inlined))
console.log('[dsh-codegraph] client.js built from client-src/index.js（内联 pure.js）')
