/**
 * **冷启动那一档**的真机档：本机一次性容器，真的慢启动，于是报告的「等待过程」真的分成几段。
 *
 * ## 它补的是哪个洞（ROADMAP 待办 A 第 1 条最后那一步）
 *
 * 记-12 把「等待过程」与取消落地了，门槛在**假时钟**下逐条验过（`test/wait.test.ts` 12 条）；
 * 真时钟只验了两条**机制**用例（`test/plugin.test.ts`：过程账进报告、取消 0.7s 返回）。
 * **没验的是这件事本身**：对一套真的慢启动的服务跑一次，看那份报告读起来够不够回答
 * 「它在等什么」——也就是压出来的段是不是 ≥3 段、段间那句话**真的在变**、最后一段是就绪。
 *
 * ## 靶子：一个容器，三段现场
 *
 * 现场刻意做成真实冷启动的样子（**端口先不开 → 开了但那条路由还没有 → 路由挂上**）：
 *
 * | 段 | 容器里在发生什么 | 探针看到 |
 * |---|---|---|
 * | ① ~17s | `javac` 编译 + `sleep 12`：**还没有进程监听那个端口** | 见下面那条真机事实 |
 * | ② ~8s | 服务起来了，但「那条路由」还没挂上 | `HTTP 404` |
 * | ③ 之后 | 路由挂上 | `HTTP 200` → 就绪 |
 *
 * 三段的处置**各不相同**（等 / 等 / 就绪），所以它顺带钉住「`4xx` 算 `unready` 而不是
 * `refuted`」这条判据在真机上的样子——判错的话第二段会直接「别等了」，而 `4xx` 恰恰是
 * **可以等**的（应用可能刚换了个上下文路径，见 `probe.ts` 的文件头）。
 *
 * ### 一条真机事实（2026-10-04，Docker Desktop 28.3.2 / macOS）——**它当场抓出一条缺陷**
 *
 * 端口已发布、容器里还没人监听时，Docker Desktop 的转发器**先接受 TCP 连接、再空回**，
 * 于是探针拿到的是 `socket hang up`（`ECONNRESET`），**不是** `probeFailureDetail` 里那句
 * 「连接被拒（端口还没起来）」。跑之前没人知道这一档会落到哪个分支（`ECONNREFUSED` 那条分支
 * 的单元用例一直是绿的）；跑完才知道：**用户盯得最久的那一段（连续 5 次观测 ≈15s）报的是一个
 * 英文 Node 错误**，既看不出「还没起来」也看不出「该继续等」。
 *
 * 于是 `probeFailureDetail` 多了一支：`ECONNRESET` → 「连接被重置（多半是端口上还没有能应答的
 * 东西）」。断言因此**不钉**第一段的具体文案（换台机器可能是「连接被拒」），只钉它**必须是那几句
 * 中文映射之一**——即「报告里不许出现没被映射的裸英文错误」。钉死某一句话会让这条用例在别的
 * 平台上谎报；不钉「必须是映射过的」就等于放它漂回去。
 *
 * ## 为什么靶子是 `javac` 现场编译的一个最小 HTTP 服务
 *
 * 本机到 Docker Hub 不通、本机镜像里没有 `busybox httpd` / python（`busybox --list` 里没有
 * `httpd`，Nashorn 那个构建里也没有 `JavaAdapter`），而本机唯一的可用镜像是个 JDK。
 * 与其为了靶子去改环境，不如用镜像里已有的东西起一个**可控**的服务——这档要验的是等待报告的
 * 读法，不是靶子有多真。镜像仍按本包惯例取 `DEVENV_LOCAL_IMAGE`（见 README 的验证表）。
 *
 * ## 前提缺失就 SKIP（不是红）
 *
 * 连不上 daemon / 没有可用镜像 / 镜像里没有 `javac` → 整档 SKIP，理由写在套件名里。
 *
 * ## 自己建的自己删，而且要看得见
 *
 * `afterAll` 里 `docker rm -f` 之后**读回**两个名字都真的没了（独立通道，不经过被测代码）。
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { makeHost } from './fake-host.js'
import { containerExists, docker, pickImage, probeDaemon, uniqueName } from './local-docker.js'

/** 冷启动那一段：服务起来之前先干等这么久（真机上就是「容器在跑但端口还没开」）。 */
const COLD_START_MS = 12_000
/** 服务起来之后、那条路由挂上之前，故意让它先回 404 的时长。 */
const ROUTE_DELAY_MS = 8_000
/** 轮询间隔（ROADMAP 待办 A 写的就是 3s）。 */
const POLL_MS = 3_000
/** 等待上限（写 180s：判据要的是「它真的等到了」，而不是「它没超时」）。 */
const WAIT_TIMEOUT_MS = 180_000
/** 容器内部监听的端口（`-p` 只把宿主那一侧留成随机，见 `beforeAll`）。 */
const CONTAINER_PORT = 18080
/** 清单里声明的路径：靶子对**任何**路径都先 404 后 200。 */
const PATH = '/ready.txt'

const LABEL = 'dsh.devenv.test=coldstart-local'

const daemon = probeDaemon()
const picked: { image: string } | { problem: string } = daemon.ok ? pickImage() : { problem: daemon.detail }
const IMAGE = 'image' in picked ? picked.image : ''

/**
 * 靶子镜像里有没有 `javac`——**在收集期**问一次（一次容器往返，与 `pickImage` 同档的开销）。
 *
 * 不这么问的后果：没有 JDK 的镜像会让靶子容器**起来就退**（退出码 127），而那时症状是
 * 「探针一直不就绪」，看起来像代码坏了。环境前提要在这里说清，而不是让它长成一条假红。
 */
const jdk: { ok: boolean; detail: string } = IMAGE === ''
  ? { ok: false, detail: '' }
  : (() => {
      const probe = docker(['run', '--rm', '--entrypoint', 'sh', IMAGE, '-c', 'command -v javac >/dev/null && echo yes'], 120_000)
      return probe.out.includes('yes')
        ? { ok: true, detail: '' }
        : { ok: false, detail: `靶子镜像里没有 javac（本档要用它现场起一个可控的 HTTP 服务）：${IMAGE}` }
    })()

const SKIP_REASON = 'problem' in picked ? picked.problem : jdk.ok ? undefined : jdk.detail

/** 慢启动的那个靶子（三段现场）。 */
const SLOW = uniqueName('dsh-devenv-coldstart-')
/** 永远不就绪的那个：端口都没发布 → 探针一直拿不到应答，正好用来验取消。 */
const IDLE = uniqueName('dsh-devenv-idle-')

/**
 * 现场编译一段最小 HTTP 服务。
 *
 * `started` 记在 **`java` 进程内部**：404 的那 8 秒是「服务起来之后」的 8 秒，与 `javac` 在
 * 这台机器上（amd64 镜像跑在 arm64 上，编译要几秒）快慢无关——否则「第二段」会随机器快慢飘。
 */
function serverJava(): string {
  return [
    'import com.sun.net.httpserver.HttpExchange;',
    'import com.sun.net.httpserver.HttpServer;',
    'import java.net.InetSocketAddress;',
    'import java.nio.charset.StandardCharsets;',
    '',
    'public class Srv {',
    '  public static void main(String[] args) throws Exception {',
    '    final long started = System.currentTimeMillis();',
    `    HttpServer server = HttpServer.create(new InetSocketAddress(${String(CONTAINER_PORT)}), 0);`,
    '    server.createContext("/", (HttpExchange ex) -> {',
    `      boolean ok = System.currentTimeMillis() - started > ${String(ROUTE_DELAY_MS)};`,
    '      byte[] body = (ok ? "ok" : "nope").getBytes(StandardCharsets.UTF_8);',
    '      ex.sendResponseHeaders(ok ? 200 : 404, body.length);',
    '      ex.getResponseBody().write(body);',
    '      ex.close();',
    '    });',
    '    server.setExecutor(null);',
    '    server.start();',
    '    Thread.sleep(600000);',
    '  }',
    '}',
  ].join('\n')
}

/** 靶子容器的启动脚本：编译 → 干等 → 起服务（路由在 `java` 起来 8 秒后才挂上）。 */
const SLOW_SCRIPT = [
  'mkdir -p /tmp/w',
  "cat > /tmp/w/Srv.java <<'EOJ'",
  serverJava(),
  'EOJ',
  'javac -d /tmp/w /tmp/w/Srv.java || exit 3',
  `sleep ${String(COLD_START_MS / 1000)}`,
  'exec java -cp /tmp/w Srv',
].join('\n')

const projectDirs: string[] = []

/** 造一个项目根 + 一份把 `ready` 声明成 `httpProbe` 的清单（清单名必须等于目录名）。 */
function projectFor(service: string, port: number): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-devenv-coldstart-'))
  projectDirs.push(dir)
  const project = basename(dir)
  mkdirSync(join(dir, 'ready'), { recursive: true })
  writeFileSync(
    join(dir, 'ready', `${project}.ready.yaml`),
    [
      'version: 1',
      `project: ${project}`,
      'services:',
      `  - name: ${service}`,
      `    ready: { kind: httpProbe, path: ${PATH}, port: ${String(port)} }`,
      '',
    ].join('\n'),
  )
  return dir
}

/** 一个只读的本机目标（作用域就是那个临时项目根）。 */
function mountReadOnly(dir: string): ReturnType<typeof makeHost> {
  const host = makeHost()
  host.mount({
    probeTimeoutMs: 1000,
    pollIntervalMs: POLL_MS,
    waitTimeoutMs: WAIT_TIMEOUT_MS,
    targets: [{ id: 'here', kind: 'local', scopeDirs: [dir] }],
  })
  return host
}

/** 把 `formatMs` 渲染出来的时长读回毫秒（三种形态，见 `render.ts`）。 */
function durationMs(text: string): number {
  const minutes = /^(\d+)m(\d+)s$/.exec(text)
  if (minutes !== null) return (Number(minutes[1]) * 60 + Number(minutes[2])) * 1000
  const seconds = /^(\d+(?:\.\d+)?)s$/.exec(text)
  if (seconds !== null) return Number(seconds[1]) * 1000
  const ms = /^(\d+)ms$/.exec(text)
  return ms === null ? Number.NaN : Number(ms[1])
}

/** 报告尾部「等待过程」里的逐段（渲染格式见 `render.ts` 的 `renderWaitTicks`）。 */
function parsePhases(text: string): { atMs: number; summary: string }[] {
  const phases: { atMs: number; summary: string }[] = []
  for (const line of text.split('\n')) {
    const matched = /^ {2}[·✓✗] \+([\d.]+(?:ms|s)|\d+m\d+s) (.+)$/.exec(line)
    if (matched === null) continue
    phases.push({
      atMs: durationMs(matched[1] ?? ''),
      // 「（连续 N 次结论相同）」是**记账**不是话术：比「话术有没有变」时要摘掉它。
      summary: (matched[2] ?? '').replace(/（连续 \d+ 次结论相同）$/, ''),
    })
  }
  return phases
}

/** 独立通道读回宿主侧的发布端口（**不经过被测代码**）。 */
function publishedPort(name: string): number {
  const out = docker(['port', name, `${String(CONTAINER_PORT)}/tcp`], 20_000).out
  const matched = /:(\d+)\s*$/.exec(out)
  return matched === null ? 0 : Number(matched[1])
}

describe.skipIf(SKIP_REASON !== undefined)(
  `冷启动等待报告真机档（本机一次性容器：${SKIP_REASON ?? `${IMAGE} · daemon ${daemon.serverVersion}`}）`,
  () => {
    let slowPort = 0

    beforeAll(() => {
      // 宿主端口留成随机（`127.0.0.1::<容器端口>`）：**不猜端口**就不会撞上「已被占用」
      // 这种与本档无关的红。端口起来之后从 `docker port` 读回（独立通道）。
      const slow = docker(['run', '-d', '--name', SLOW, '--label', LABEL, '-p', `127.0.0.1::${String(CONTAINER_PORT)}`, '--entrypoint', 'sh', IMAGE, '-c', SLOW_SCRIPT], 120_000)
      expect(slow.code, `起慢启动靶子失败：${slow.out}`).toBe(0)
      slowPort = publishedPort(SLOW)
      expect(slowPort, `没读回慢启动靶子的宿主端口：${docker(['port', SLOW], 20_000).out}`).toBeGreaterThan(0)

      // 取消那一档：端口都不发布（探针永远拿不到应答），所以它不需要 `-p`。
      const idle = docker(['run', '-d', '--name', IDLE, '--label', LABEL, '--entrypoint', 'sh', IMAGE, '-c', 'sleep 600'], 120_000)
      expect(idle.code, `起「永远不就绪」靶子失败：${idle.out}`).toBe(0)
    }, 180_000)

    afterAll(() => {
      docker(['rm', '-f', SLOW, IDLE], 60_000)
      for (const dir of projectDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
      expect(containerExists(SLOW), '慢启动靶子没被清掉').toBe(false)
      expect(containerExists(IDLE), '「永远不就绪」靶子没被清掉').toBe(false)
    })

    it('★ 真慢启动：报告分成 ≥3 段、段间话术真的在变、最后一段是就绪', async () => {
      const dir = projectFor(SLOW, slowPort)
      const started = Date.now()
      const text = await mountReadOnly(dir).call('env_wait', { target: 'here', cwd: dir, timeoutMs: WAIT_TIMEOUT_MS })
      const elapsed = Date.now() - started

      /*
       * 把整份报告打出来。这一档要回答的问题就是「那段时间里报告读起来够不够说明在等什么」，
       * 而这里的判据（段数、话术在不在变）只有把现场摊开才有人能复核——一份被断言压成
       * 「≥3 段」的报告，读者仍然不知道它长什么样。本档不进 CI，这点输出不占谁的版面。
       */
      console.log(`\n# 真慢启动那一次的等待报告（${String(elapsed)}ms）：\n${text}\n`)

      const phases = parsePhases(text)
      const detail = `（实测 ${String(elapsed)}ms，共 ${String(phases.length)} 段：${JSON.stringify(phases)}）`

      // ① 段数：这正是「一份 50 条的流水账」与「一眼看出在等什么」的分界（`collapseTicks` 的存在理由）
      expect(phases.length, `等待过程没有分成 ≥3 段${detail}`).toBeGreaterThanOrEqual(3)
      // ② 段间话术**真的在变**：压段压过头（全并成一段）或压不动（每段都重复）都会在这里露出来
      expect(new Set(phases.map((phase) => phase.summary)).size, `段间话术没有变化${detail}`).toBe(phases.length)
      // ③ 最后一段是就绪，而且**真的等够了**（没等到冷启动结束就报就绪 = 探针没验到东西）
      const last = phases[phases.length - 1]
      expect(last?.summary, `最后一段不是就绪${detail}`).toContain('全部 1 个服务就绪')
      expect(last?.atMs ?? 0, `就绪来得太早，说明它没真的等过冷启动${detail}`).toBeGreaterThanOrEqual(COLD_START_MS)
      // ④ 中间那一段是 `HTTP 404`：路由还没挂上时**可以等**（判成 refuted 就会「别等了」，那是误判）
      expect(phases.map((phase) => phase.summary).join('\n'), `没有出现 404 那一段${detail}`).toContain('HTTP 404')
      // ⑤ 第一段是「还没人应答」——不钉具体文案（平台上可能是连接被拒，也可能是连接被重置），
      //    但**不许**是没被映射的裸英文错误（`socket hang up` 就是这么被抓出来的），也不许是 404 / 就绪
      const first = phases[0]?.summary ?? ''
      expect(first.includes('HTTP 404') || first.includes('就绪'), `第一段不该就已经是 404 / 就绪${detail}`).toBe(false)
      expect(first, `第一段又出现没被映射的裸错误（那是用户盯得最久的一段）${detail}`).toMatch(/连接被拒|连接被重置|没有响应|解析不了/)

      // 报告自己也要把停止原因说清：是「全部就绪」，不是超时
      expect(text).toContain('停止等待的原因：全部就绪')
      expect(text).toContain(`等待过程（共观测 `)
    }, 150_000)

    it('★ 取消：等一个永远不就绪的目标，调用方 abort 之后立刻返回（不是超时、也不代表环境有问题）', async () => {
      const dir = projectFor(IDLE, CONTAINER_PORT)
      const host = mountReadOnly(dir)
      const tool = host.tools.get('env_wait')
      expect(tool?.execute, 'env_wait 没注册上').toBeDefined()

      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 700)
      const started = Date.now()
      try {
        const value = (await (tool?.execute as (args: unknown, exec?: unknown) => Promise<{ text: string }>)(
          { target: 'here', cwd: dir, timeoutMs: WAIT_TIMEOUT_MS },
          { signal: controller.signal },
        )) as { text: string }
        // 不取消的话它要等满 180s；能在这点时间内返回 = 取消真的转发下去了
        expect(Date.now() - started).toBeLessThan(5000)
        expect(value.text).toContain('被调用方取消')
        expect(value.text).toContain('不是超时')
        // 取消也要留下「取消那一刻它什么样」——否则报告里没有任何事实可说
        expect(value.text).toContain('等待过程')
      } finally {
        clearTimeout(timer)
      }
    }, 60_000)
  },
)
