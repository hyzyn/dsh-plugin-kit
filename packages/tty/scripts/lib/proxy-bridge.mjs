#!/usr/bin/env node
/**
 * 最小 `ProxyCommand` 桥：把 stdio 接到 `host port`。
 *
 * 这就是 `ssh -W %h:%p bastion` / `nc host port` 的原语，写成脚本是为了**不依赖系统工具**
 * （CI 上未必有 ssh / nc，参数还各不相同）。真机冒烟 `scripts/proxycommand-smoke.mjs` 用它
 * 当代理命令，从而把「子进程 stdio ↔ SSH 传输」这条链路整条跑通。
 *
 * 用法：node proxy-bridge.mjs <host> <port>
 */
import net from 'node:net'

const [host, port] = process.argv.slice(2)
if (host === undefined || port === undefined) {
  process.stderr.write('usage: proxy-bridge.mjs <host> <port>\n')
  process.exit(2)
}

const socket = net.connect(Number(port), host)
socket.on('connect', () => {
  process.stdin.pipe(socket)
  socket.pipe(process.stdout)
})
socket.on('error', (error) => {
  process.stderr.write(`${error.message}\n`)
  process.exit(1)
})
socket.on('close', () => {
  process.exit(0)
})
