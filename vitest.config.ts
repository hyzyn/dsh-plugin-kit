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
 * 和仓库级脚本的纯逻辑（scripts/lib/，如 client-lint 用的宿主地址来源规则）。
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
  },
})
