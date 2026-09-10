#!/usr/bin/env node
/**
 * @hyzyn/dsh-docker — 浏览器半体打包脚本。
 * 把 client-src/index.js（含 docker.css）用 esbuild 打成单文件 IIFE 输出 client.js，
 * 宿主以 /plugins/@hyzyn/dsh-docker/client.js 提供。
 *
 * 注意：
 *   - client.js 是经典脚本（非 ESM），必须 bundle 成 IIFE；
 *   - `require('react')` / `require('react-dom/client')` 是 module loader 注入的
 *     参数（作用域内遮蔽全局 require），esbuild 不会把它们打进 bundle —— React
 *     必须与宿主共用同一实例，否则 hooks 的 dispatcher 会错乱；
 *   - docker.css 经 text loader 内联注入 <style>，不依赖宿主静态文件。
 */
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

await build({
  entryPoints: [join(root, 'client-src/index.js')],
  outfile: join(root, 'client.js'),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2020'],
  minify: true,
  sourcemap: false,
  loader: { '.css': 'text' },
  logLevel: 'info',
})

console.log('[dsh-docker] client.js built')
