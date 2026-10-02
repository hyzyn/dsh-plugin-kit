import { defineConfig } from 'vitest/config'

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
     * 覆盖率口径（`pnpm test:coverage`）。**正文在 `docs/testing.md`**——那里写三条
     * 测试面的划分、排除理由、阈值棘轮规矩与「为什么不进 CI」；这里只留配置本身。
     *
     * **本文不抄会随提交漂的测量值**（用例总数、整体覆盖百分比）——要数字就跑一次
     * `pnpm test:coverage`（写法见 docs/testing.md § 覆盖率口径）；下面保留的只有
     * 阈值与棘轮基线那类技术事实（规矩见 docs/conventions.md § 文档分档）。
     *
     * **只统计「有测试入口」的面，按设计不在本层测的代码不计入**——否则全量口径
     * 会被三份浏览器 bundle 入口与真机 / Windows / E2E 脚本（全是 0%）拖成一个
     * 大家会学会无视的假数字。排除项各有明确理由：
     *
     *   - `client-src/index.js` ×3：浏览器 bundle 入口，esbuild 管线自有验证
     *     （smoke/verify 脚本）。判对错的逻辑留在里面等于没有测试入口（tty D61
     *     的教训）——要测就抽成纯模块，抽出来的自然回到统计里；
     *   - `scripts/lib|fixtures|windows`：真机隔离引导（由 live-scripts-safety
     *     读源码钉住）、测试夹具、Windows E2E；
     *   - `scripts/test`：测试夹具自身；`*.d.ts` 类型声明。
     *
     * **thresholds 是棘轮，不是目标线**：只钉已过 80% 的包，各留 2 个点余量防无意识
     * 回落（codegraph 92→90、kit 86→84——左边是当时的实测，右边是钉的值）。其余包
     * **故意不钉**（当前都远低于 80%，按包现算见 `pnpm test:coverage` 的表格）——钉一条
     * 达不到的线只是把「没测」变成「红」，不会多出任何用例；要爬就改这里的数字，
     * 每爬一格都该是用例落地的结果。
     *
     * 覆盖率是本地工具，不进 CI 门禁；哪天要当门禁用，先验证阈值在 CI 三平台
     * 上稳定（本仓库用例靠参数注入覆盖双平台而非 skip，理论上不漂移）。
     */
    coverage: {
      include: ['packages/*/src/**', 'packages/*/client-src/**', 'scripts/**/*.mjs'],
      exclude: [
        '**/client-src/index.js',
        'scripts/test/**',
        'scripts/lib/**',
        'scripts/fixtures/**',
        'scripts/windows/**',
        '**/*.d.ts',
      ],
      reporter: ['text', 'text-summary', 'json-summary'],
      thresholds: {
        'packages/codegraph/src/**': { statements: 90, lines: 90 },
        'packages/kit/src/**': { statements: 84, lines: 84 },
      },
    },
  },
})
