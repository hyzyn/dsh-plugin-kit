import { configDefaults, defineConfig } from 'vitest/config'

/**
 * 仓库级测试底座：收 packages/<pkg>/test/ 与 scripts/test/ 下的用例。
 *
 * 测试文件刻意放在各包 tsconfig include（"src"）之外——packages/<pkg>/lib 是
 * 随 git 分发的预构建产物（.gitignore 为它开了入库例外），测试放进 src 会被
 * tsc 编译进 lib/ 随包发布。
 *
 * environment 固定 node：用例覆盖宿主半体纯逻辑（解析器、托管区块、排序等），
 * 以及**从浏览器半体抽出来的纯模块**（credential-ref / ws-url / stats-bar…）
 * 和仓库级脚本抽出来的纯逻辑——**被用例直接 import 的纯模块**就放在 `scripts/` 根、
 * 与脚本同目录（如 client-lint 用的宿主地址来源规则在 `scripts/client-host-url.mjs`，
 * 用例是 `scripts/test/client-host-url.test.ts`）。`scripts/lib/` 放的是另一类：**真机脚本
 * 共享的隔离引导**（`live-harness.mjs`：临时目录 / 隔离 DSH_HOME / profile 播种 / 补丁自证），
 * 它不起宿主、不被 import 进来跑，而由 `scripts/test/live-scripts-safety.test.ts` 读源码钉住。
 *
 * **打包后的 client.js 不在本层测**——它是 esbuild 产物，走各自的管线。所以
 * 浏览器半体里凡是要判对错的逻辑，请抽成不依赖 DOM 的纯模块：`client-lint.mjs`
 * 只查名字解析与宿主地址来源（静态），**不验行为**，留在 client.js 里的逻辑
 * 等于没有测试入口（tty D61 就是这么漏掉的——推导逻辑埋在 client-src/index.js 里）。
 */
/**
 * CI 的 Windows 腿把并发降下来（2026-10-17 加）。
 *
 * **为什么**：`packages/codegraph/test/cli-route.test.ts` 在 Windows 上有一条**负载敏感**的间歇红
 * （codegraph `ROADMAP.md` §「cli-route.test.ts 在 Windows 上的负载敏感」）——干净 stub 的正常
 * 路径偶发拿到 500（约 148ms，**不是超时**）。按那条记录的排除法，它只能是「`cmd.exe` → `node`
 * 这条 shim 没跑成」；本机能复现的是它的**超时**形状（同一份文件 6 份并发 → 30 次子进程里 10 次
 * 失败），共同点是「真子进程在负载下起不来」。worker 数就是这层进程创建压力的阀门。
 *
 * **为什么写在这里、不写进 `ci.yml`**：两条 workflow 里同一个入口的命令必须**逐字一致**
 * （`scripts/ci-script-truth.mjs` 判据 3，它防的正是「某一侧被偷偷加参数」）——在 ci.yml 给
 * `pnpm test` 挂个 `--maxWorkers` 会当场判成 `ci.crossWorkflow.mismatch`（release.yml 那边是裸的）。
 * 而 worker 数本来就是**运行器**的事，归 vitest 配置更贴。
 *
 * **代价与边界**：Windows 腿变慢（并发度下降），另两条腿与本机开发一字不变。**这不是治本**——
 * 成因仍未定性：`cli-route.test.ts` 的 `call()` 现在会把每个 500 的响应体打出来，下一次红就能
 * 直接读到是 spawn 的 `error` 事件还是子进程非零退出，届时按证据收口（若这次降并发仍红，
 * 下一手是让那个文件在 Windows 上单独跑，见那条台账的选项 ②）。
 *
 * 纯函数 + 参数注入：本机是 macOS，只能验「不生效」那一支——两支都要能被用例钉住，
 * 否则这条判据在非 Windows 机器上等于没人验（`scripts/test/vitest-config.test.ts`）。
 */
export function workerCap({ ci, platform }: { ci: string | undefined; platform: NodeJS.Platform }) {
  const inCi = ci !== undefined && ci !== ''
  return inCi && platform === 'win32' ? { maxWorkers: 2 } : {}
}

/**
 * 「分道跑」的另一半（2026-10-17 加，配合 CI 上那一步）：Windows 腿**先**把 spawn 密集的
 * `packages/codegraph/test/cli-route.test.ts` 单独跑一遍（那一轮它独占机器），其余文件再由
 * 常规那轮跑——这一支就是给常规那轮用的：把那个文件从本轮里排掉。
 *
 * **为什么用 `configDefaults.exclude` 而不是手抄一份默认列表**：vitest 的默认 excludes 会随
 * 版本变（`node_modules` / `dist` / 各种 config 文件…）。手抄一份就是第二份真相源，而且会
 * **静默腐烂**——`--exclude` 是**覆盖**而不是追加，漏掉一个默认项就可能把依赖树里的测试
 * 一起收进来跑（所以这里用 vitest 自己导出的那份）。
 *
 * **为什么由环境变量驱动、而不是写死在配置里**：那一轮与常规那轮必须是**同一条命令**——
 * `scripts/ci-script-truth.mjs` 判据 3 要求两条 workflow 里同一个入口的命令**逐字一致**，
 * 所以不能给 `pnpm test` 挂 flag、也不能加 `VAR=1 ` 前缀，只能靠 step 的 `env:` 传进来。
 *
 * @returns `undefined` = 不动 excludes（用 vitest 自己的默认）。
 */
export function laneExclude({ skipCliRoute }: { skipCliRoute: string | undefined }) {
  return skipCliRoute === '1'
    ? [...configDefaults.exclude, '**/codegraph/test/cli-route.test.ts']
    : undefined
}

/** 本轮要不要排掉那个 spawn 密集的文件（由 CI 的 `env:` 决定，本机永远不排）。 */
const exclude = laneExclude({ skipCliRoute: process.env.DSH_SKIP_CLI_ROUTE })

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts', 'scripts/test/**/*.test.ts'],
    environment: 'node',
    globals: false,
    /**
     * 默认 5s 是按**纯单测**定的，而本仓库有一大批**集成型**用例要真的 spawn 进程
     * （假 CLI、假宿主、卡片预览渲染器、docker smoke），在慢 runner 上需要更宽。
     *
     * 实测（v0.1.41 的 CI，提交 689b6ab8 / fa1f3a91，两轮对比）：
     *
     *   - 5s：windows-latest `16 failed`，**全部**报 `Test timed out in 5000ms`
     *     （ubuntu / macos 全绿）；
     *   - 20s：同样环境变成 `15 failed`，其中 14 条是**真实断言失败**
     *     （`Unexpected end of JSON input` 等）——即 5s 超时**把真 bug 伪装成了超时**。
     *     那个真 bug 是 stub CLI 在 Windows 上没有 `.cmd` 形态（见 `test/stub-cli.ts`），
     *     与超时无关，已单独修复。
     *
     * 所以这条配置有两个理由，都不是「把红的调绿」：
     *   ① **别让超时掩盖真失败**——集成型用例慢过 5s 时，5s 只会吐出一堆
     *      「timed out」，把真正的原因（spawn 起不来 / 断言错）盖掉；
     *   ② 确实有用例在 2 核 Windows runner 上需要 >5s：`projects.test.ts` 在 20s 下
     *      全过、在 5s 下超时，且它的 stub 形态本来就是对的。
     *
     * 20s 仍是**有界**的：真挂死照样判失败，只是晚 15 秒。
     */
    testTimeout: 20_000,
    /**
     * `hookTimeout` 必须跟着 `testTimeout` 一起放宽（2026-10-03 补）。
     *
     * 起因：新增的 `scripts/test/package-contents.test.ts` 用 `beforeAll` 跑 13 次
     * `pnpm pack --dry-run`。单跑时 3.9s，**并发 3 份全量套件时实测 20.1s**（5 倍）——
     * 而 vitest 的 `hookTimeout` 默认只有 **10s**，于是它间歇性地报
     * `Hook timed out in 10000ms`，三份一起红。
     *
     * 这个坑和上面 `testTimeout` 记的是**同一件事的另一半**：上面那次是「5s 把真 bug
     * 伪装成超时」，这次是「10s 把慢但正确的 hook 判成失败」。两条都是**超时预算与用例的
     * 真实形态不匹配**。既然本仓的集成型用例已经确定需要 20s，hook 没有理由比它更严——
     * hook 里跑的正是同一批子进程。
     *
     * 它同时是**发现渠道**的证明：这条间歇红不是 CI 报出来的，是**新加的 `pnpm flake:check`
     * 车道**（并发跑全量套件）当场抓到的——正是那条车道存在的理由。
     */
    hookTimeout: 60_000,
    // CI 的 Windows 腿降并发；其余环境展开成空对象（一字不变）。理由与边界见 `workerCap` 的注释。
    ...workerCap({ ci: process.env.CI, platform: process.platform }),
    // 同样：只有 CI 的 Windows 腿在「常规那一轮」里排掉 spawn 密集的那个文件（上面那步已单独跑过）。
    ...(exclude === undefined ? {} : { exclude }),
  },
})
