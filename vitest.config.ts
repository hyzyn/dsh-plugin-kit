import { defineConfig } from 'vitest/config'

/**
 * 仓库级测试底座：只收 packages/<pkg>/test/ 下的用例。
 *
 * 测试文件刻意放在各包 tsconfig include（"src"）之外——packages/<pkg>/lib 是
 * 随 git 分发的预构建产物（.gitignore 为它开了入库例外），测试放进 src 会被
 * tsc 编译进 lib/ 随包发布。
 *
 * environment 固定 node：现有用例覆盖的都是宿主半体纯逻辑（解析器、托管区块、
 * 排序等），不碰 DOM；浏览器半体（client.js）走各自的 esbuild 管线，不在本层测。
 */
export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts'],
    environment: 'node',
    globals: false,
    /**
     * 默认 5s 是按**纯单测**定的，而本仓库有一大批**集成型**用例要真的 spawn 进程
     * （假 CLI、假宿主、卡片预览渲染器、docker smoke），它们在慢 runner 上远超 5s。
     *
     * 实测（v0.1.41 的 CI，提交 689b6ab8）：同一份用例 ubuntu / macos **全绿**，
     * windows-latest 上 `16 failed | 856 passed`——16 条**全部**是
     * `Test timed out in 5000ms`，没有一条断言失败。根因是套件变大后（本轮 +3034 行测试，
     * 其中 `preview-card.test.ts` 一个文件就要 spawn 8 次 node）在 2 核 Windows runner 上
     * 与同样 spawn 进程的 `cli-route` / `cli-surface` / `auto-reindex` / `projects` 争抢；
     * 本机单条最长约 1.5s，慢 runner 上被放大数倍即越线。
     *
     * 20s 是「一个量级余量」与「仍然有界」之间的取舍：真挂死照样会被判失败，不会靠它蒙混。
     */
    testTimeout: 20_000,
  },
})
