/**
 * 本机 docker 的测试夹具（`real-write-local.test.ts` / `real-health-local.test.ts` /
 * `real-coldstart-local.test.ts` 三个本机真 daemon 档共用）。
 *
 * ## 为什么是共享的而不是各抄一份
 *
 * 「探 daemon / 挑靶子镜像 / 跑一条 docker 命令」这三件事在**三个本机真 daemon 档**里一模一样，
 * 而它们各自踩过的坑（见下）只该被记一次——所以上收进测试夹具层（`test/`，不进产物）。
 *
 * **第三个消费者到了（2026-10-04，冷启动等待报告那一档）时的判断：仍然不往 `kit` 抬。**
 * 那三条「出现第三个消费者就上收」的判据来自**跨包**重复（`fake-host` 是 `devenv` / `devdata` /
 * `devfront` 各一份才搬进 `kit` 的）；而这三个消费者**都在本包内**，夹具本来就在本包的 L1 测试层，
 * 再抬一层只会让「本机 docker 的坑」住到一个别的包不会用的地方。
 *
 * ## 两条被真机教过的判据
 *
 * 1. **探 daemon 只看退出码，不依赖任何模板**：实测（2026-10-03，Docker Desktop 的 CLI 28.3.2）
 *    ——`docker version --format '{{.ServerVersion}}'` 在这台机器上直接报模板错（那个字段不在
 *    `version` 的 JSON 里），于是「daemon 明明在跑」也会被判成 SKIP。探针必须比被探的东西更笨：
 *    先看 `docker info` 的退出码，版本号另取一次、只用于**显示**。
 * 2. **前提缺失是 SKIP、不是红**：连不上 daemon 或本机没有可用镜像且拉不下来，都是环境状况。
 *    拿环境状况当失败信号只会训练人忽略红灯（见 [docs/agent-real-test.md](../../../docs/agent-real-test.md)）。
 */
import { spawnSync } from 'node:child_process'

/** 跑一条 docker 命令（同步；靶子的准备与读回都是短命令）。 */
export function docker(args: string[], timeoutMs = 60_000): { code: number; out: string } {
  const result = spawnSync('docker', args, { encoding: 'utf8', timeout: timeoutMs })
  const out = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim()
  return { code: result.status ?? 1, out }
}

/** daemon 探测结果（`ok=false` 时 `detail` 是喂给 SKIP 理由的那一句话）。 */
export interface DaemonProbe {
  ok: boolean
  /** 只用于显示；取不到就是空串，**不参与判定**。 */
  serverVersion: string
  detail: string
}

/** 探一次 daemon（判据只有「`docker info` 退出码是 0」这一条）。 */
export function probeDaemon(): DaemonProbe {
  const info = docker(['info'], 20_000)
  if (info.code !== 0) return { ok: false, serverVersion: '', detail: `连不上 docker daemon（${info.out.split('\n')[0] ?? ''}）` }
  return { ok: true, serverVersion: docker(['info', '--format', '{{.ServerVersion}}'], 20_000).out, detail: '' }
}

/** 挑靶子镜像的结果（`problem` 非空即「前提缺失」，调用方据此 SKIP）。 */
export type ImagePick = { image: string } | { problem: string }

/**
 * 挑一个能长跑的靶子镜像：**先看本机有没有**（不联网），没有才拉最小的那个。
 *
 * 可用 `DEVENV_LOCAL_IMAGE` 指定（例如本机只有内网仓库里的镜像）；写入口那一档历史上用的是
 * `DEVENV_LOCAL_WRITE_IMAGE`，仍然认——两个名字指同一件事，旧名先看，免得把已写在文档里的
 * 用法改坏。
 */
export function pickImage(): ImagePick {
  const override = firstNonEmpty(process.env.DEVENV_LOCAL_IMAGE, process.env.DEVENV_LOCAL_WRITE_IMAGE)
  const candidates = override === undefined ? ['busybox:latest', 'alpine:latest'] : [override]

  for (const image of candidates) {
    if (docker(['image', 'inspect', image], 20_000).code === 0) return { image }
  }
  for (const image of candidates) {
    // 90 秒是有界的：拉不到就当「前提缺失」SKIP，不让它在收集期把整轮测试拖住
    const pulled = docker(['pull', image], 90_000)
    if (pulled.code === 0) return { image }
  }
  return {
    problem: `本机没有 ${candidates.join(' / ')} 且拉取失败——这是前提缺失，不是代码坏了（可用 DEVENV_LOCAL_IMAGE 指定一个本机镜像）`,
  }
}

/** 第一个非空值（`undefined` / `''` 都算「没给」）。 */
function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    if (value !== undefined && value !== '') return value
  }
  return undefined
}

/** 一次性靶子的唯一名字（`<前缀><pid>-<随机>`：人肉兜底清理时一眼看出是谁建的）。 */
export function uniqueName(prefix: string): string {
  return `${prefix}${String(process.pid)}-${Math.random().toString(36).slice(2, 8)}`
}

/** 独立通道读回「这个名字的容器还在不在」——**不经过被测代码**，否则就是自证。 */
export function containerExists(name: string): boolean {
  return docker(['ps', '-a', '--filter', `name=^/${name}$`, '--format', '{{.Names}}'], 30_000).out !== ''
}
