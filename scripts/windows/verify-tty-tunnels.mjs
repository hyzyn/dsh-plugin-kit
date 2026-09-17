/**
 * `@hyzyn/dsh-tty` 的**隧道真实转发**验证（`local` 与 `remote` 两个方向）。
 *
 * 为什么单独做：`TunnelManager` 是 392 行、用户可见的功能（「把远程数据库映射到本地端口」），
 * 但此前只验过 `tunnel_list` 返回一张空表 —— 「接口在、功能没跑过」正是本轮其它缺陷的温床。
 *
 * 断言的是**数据真的过去了**，不是「状态显示 active」：
 *   - `local`（-L）：从本机连 `127.0.0.1:<localPort>`，期望拿到远端服务的真实响应
 *     （默认拿 SSH banner；给了密钥就再跑一条真 SSH 会话，证明双向都通）；
 *   - `remote`（-R）：远端侧应出现监听端口，且**从远端**连它要能到达本机服务
 *     （默认用本机 DSH 宿主的 HTTP：它的 401 鉴权响应就是「到达了」的证据）。
 *
 * 前置：宿主已按脚本末尾的说明配好两条隧道（settings 里 `tty.tunnels`）。
 *
 * 用法（Windows guest，Ubuntu1 可达）：
 *   node scripts/windows/verify-tty-tunnels.mjs --host http://127.0.0.1:3092 ^
 *        --ssh-host 10.211.55.5 --ssh-user parallels --ssh-key C:\cg-verify\ssh\id_ed25519 ^
 *        --report C:\cg-verify\tunnels.json
 *
 * 隧道配置（把它加进 scratch 的 settings.yaml `tty.tunnels`，然后重启宿主）：
 *
 *   - name: probe-l                 # 本地转发：本机 18822 → 远端 127.0.0.1:22
 *     bookName: u1                  # 引用 tty 连接簿条目
 *     direction: local
 *     localPort: 18822
 *     remoteHost: 127.0.0.1
 *     remotePort: 22
 *     enabled: true
 *   - name: probe-r                 # 远程转发：远端 127.0.0.1:19888 → 本机 3092
 *     bookName: u1
 *     direction: remote
 *     remotePort: 19888
 *     localTargetHost: 127.0.0.1
 *     localTargetPort: 3092
 *     enabled: true
 */
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import http from 'node:http'
import net from 'node:net'

const argv = process.argv.slice(2)
const flag = (name) => {
  const index = argv.indexOf(name)
  return index === -1 ? undefined : argv[index + 1]
}
const hostUrl = flag('--host') ?? 'http://127.0.0.1:3092'
const sshHost = flag('--ssh-host')
const sshUser = flag('--ssh-user') ?? 'parallels'
const sshKey = flag('--ssh-key')
const sshBin = flag('--ssh-bin') ?? 'ssh'
const localPort = Number(flag('--local-port') ?? 18822)
const remotePort = Number(flag('--remote-port') ?? 19888)
const localTargetPort = Number(flag('--local-target-port') ?? 3092)
const bookName = flag('--book') ?? 'u1'
const reportPath = flag('--report')

const results = []
const record = (name, ok, detail) => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '\n      ' + detail : ''}`)
}
const skip = (name, detail) => {
  results.push({ name, ok: true, detail, skipped: true })
  console.log(`SKIP  ${name}${detail ? '\n      ' + detail : ''}`)
}

const target = new URL(hostUrl)
const get = (path) =>
  new Promise((resolve) => {
    const request = http.request(
      { host: target.hostname, port: Number(target.port || 80), path, method: 'GET', headers: { host: `${target.hostname}:${String(target.port || 80)}` } },
      (response) => {
        let text = ''
        response.setEncoding('utf8')
        response.on('data', (chunk) => (text += chunk))
        response.on('end', () => resolve({ status: response.statusCode, text }))
      },
    )
    request.on('error', (error) => resolve({ status: 0, text: String(error?.message ?? error) }))
    request.setTimeout(15_000, () => {
      request.destroy()
      resolve({ status: 0, text: 'timeout' })
    })
    request.end()
  })

/** 连一个 TCP 端口并等首块数据（或断言连得上）。 */
const probeTcp = (port, host = '127.0.0.1', timeoutMs = 8000) =>
  new Promise((resolve) => {
    const socket = net.connect(port, host)
    let data = ''
    const done = (result) => {
      try {
        socket.destroy()
      } catch {
        /* 已关 */
      }
      resolve(result)
    }
    socket.setTimeout(timeoutMs, () => done({ ok: false, error: `超时（已收 ${JSON.stringify(data)}）` }))
    socket.on('data', (chunk) => {
      data += chunk.toString('utf8')
      if (data.includes('\n') || data.length > 8) done({ ok: true, data: data.trim() })
    })
    socket.on('connect', () => {
      // 没有立刻收到数据也算连上（下面靠 data 判断具体内容）
      setTimeout(() => done({ ok: data !== '', data: data.trim(), connected: true }), 1500)
    })
    socket.on('error', (error) => done({ ok: false, error: error.code ?? error.message }))
  })

const runSsh = (args) => {
  const options = [
    ...(sshKey === undefined ? [] : ['-i', sshKey]),
    '-o', 'StrictHostKeyChecking=no',
    '-o', 'UserKnownHostsFile=NUL',
    '-o', 'BatchMode=yes',
    '-o', 'ConnectTimeout=12',
    ...args,
  ]
  return execFileSync(sshBin, options, { encoding: 'utf8', timeout: 40_000 })
}

console.log('# dsh-tty 隧道真实转发验证')
console.log(`# node ${process.version} / 宿主 ${hostUrl} / 本地转发 ${String(localPort)} / 远程转发 ${String(remotePort)}\n`)

/* ---------- T1 隧道表 ---------- */
const listed = JSON.parse((await get('/api/dsh-tty/tunnels')).text)
const rows = Array.isArray(listed?.tunnels) ? listed.tunnels : []
const localRow = rows.find((row) => row.direction === 'local')
const remoteRow = rows.find((row) => row.direction === 'remote')
record(
  'T1 /api/dsh-tty/tunnels：本地转发（-L）处于 active 且规则正确',
  localRow !== undefined && localRow.state === 'active' && String(localRow.rule).includes(String(localPort)) && String(localRow.rule).includes(':22'),
  `localRow=${JSON.stringify(localRow ?? null)}`,
)
record(
  'T1 /api/dsh-tty/tunnels：远程转发（-R）处于 active 且规则正确',
  remoteRow !== undefined && remoteRow.state === 'active' && String(remoteRow.rule).includes(String(remotePort)),
  `remoteRow=${JSON.stringify(remoteRow ?? null)}`,
)

/* ---------- T2 本地转发：数据真的过去了 ---------- */
const banner = await probeTcp(localPort)
record(
  `T2 -L：从本机连 127.0.0.1:${String(localPort)} 拿到了远端服务的真实响应`,
  banner.ok === true && typeof banner.data === 'string' && banner.data.startsWith('SSH-'),
  `收到=${JSON.stringify(String(banner.data ?? banner.error).slice(0, 120))}`,
)

if (sshHost === undefined || sshUser === undefined) {
  skip('T2 -L：经隧道跑一条真 SSH 会话', '未给 --ssh-host/--ssh-user')
} else {
  try {
    const out = runSsh(['-p', String(localPort), `${sshUser}@127.0.0.1`, 'echo VIA-LOCAL-TUNNEL-OK; hostname'])
    record(
      'T2 -L：经隧道跑真 SSH 会话（双向数据、不是只读到 banner）',
      out.includes('VIA-LOCAL-TUNNEL-OK'),
      `远端返回=${JSON.stringify(out.trim().slice(0, 160))}`,
    )
  } catch (error) {
    record('T2 -L：经隧道跑真 SSH 会话', false, String(error?.message ?? error).slice(0, 240))
  }
}

/* ---------- T3 远程转发：从远端连回来 ---------- */
if (sshHost === undefined) {
  skip('T3 -R：从远端连它的监听端口', '未给 --ssh-host')
} else {
  try {
    const listening = runSsh([`${sshUser}@${sshHost}`, `ss -ltn 2>/dev/null | grep -c ':${String(remotePort)}' || true`]).trim()
    record(
      `T3 -R：远端上出现了 ${String(remotePort)} 的监听`,
      Number(listening) >= 1,
      `远端 ss 命中行数=${listening}`,
    )
    const code = runSsh([
      `${sshUser}@${sshHost}`,
      `curl -s -o /dev/null -w '%{http_code}' --max-time 8 http://127.0.0.1:${String(remotePort)}/`,
    ]).trim()
    // 本机目标是 DSH 宿主：它的 401 就是「请求真的被转发到本机服务」的证据
    record(
      `T3 -R：从远端连 127.0.0.1:${String(remotePort)} 到达了本机服务（期望 DSH 宿主的鉴权响应）`,
      code === '401' || code === '200',
      `远端 curl → http=${code}（本机目标端口 ${String(localTargetPort)}）`,
    )
  } catch (error) {
    record('T3 -R：从远端连回来', false, String(error?.message ?? error).slice(0, 240))
  }
}

/* ---------- T4 计数 ---------- */
const after = JSON.parse((await get('/api/dsh-tty/tunnels')).text)
const afterLocal = (after?.tunnels ?? []).find((row) => row.direction === 'local')
record(
  'T4 计数：连接数与累计数真的在涨（不是摆设）',
  (afterLocal?.totalConnections ?? 0) >= 1,
  `local totalConnections=${String(afterLocal?.totalConnections)} connections=${String(afterLocal?.connections)}`,
)

const failed = results.filter((item) => item.ok !== true)
console.log(`\n# 汇总：PASS ${results.filter((r) => r.ok === true && r.skipped !== true).length} / SKIP ${results.filter((r) => r.skipped === true).length} / FAIL ${failed.length}`)
if (failed.length > 0) {
  console.log('# 失败项：')
  for (const item of failed) console.log(`  - ${item.name}${item.detail ? `：${item.detail.split('\n')[0]}` : ''}`)
}
if (reportPath !== undefined) {
  writeFileSync(reportPath, `${JSON.stringify({ hostUrl, bookName, localPort, remotePort, results }, null, 2)}\n`)
  console.log(`# 报告：${reportPath}`)
}
process.exit(failed.length === 0 ? 0 : 1)
