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
  },
})
