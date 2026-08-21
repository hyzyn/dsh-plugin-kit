#!/usr/bin/env node
/**
 * @hyzyn/dsh-tty — 浏览器半体打包脚本。
 * 把 client-src/index.js（含 @xterm/xterm、@xterm/addon-fit、xterm.css）
 * 用 esbuild 打成单文件 IIFE 输出 client.js，与 search 插件的手写 client
 * 同格式（宿主以 /plugins/@hyzyn/dsh-tty/client.js 提供）。
 *
 * 注意：client.js 是经典脚本（非 ESM），因此必须 bundle 成 IIFE；
 * xterm.css 经 text loader 内联注入 <style>，避免依赖宿主额外静态文件。
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

console.log('[dsh-tty] client.js built')
