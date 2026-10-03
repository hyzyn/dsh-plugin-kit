/**
 * 通道接线：把「在目标机上跑一条 docker 命令」接到 `kit` 的执行层上
 * （`docs/devdata-plan.md` §16.1 第 3 步的落地处）。
 *
 * ## 这里为什么只有这么薄的一层
 *
 * 「怎么连」（连接池 / TOFU / 跳板机 / 代理命令 / 通道额度）全在 `@hyzyn/dsh-kit/ssh-exec`，
 * 本文件只做两件本地的事：**按目标形态选一根线**（`local` → 子进程，`ssh` → 执行层 + 连接簿条目），
 * 以及**把执行结果翻译成观测层认的形状**。
 *
 * 薄是有意的：这份文件里每多一行，就意味着 `docker` 与本包各有一份「怎么连」的实现——那正是
 * §16.1 的 B1 要消除的东西（守卫 `scripts/test/ssh-single-source.test.ts`）。
 *
 * ## 翻译里最要紧的一条：**超时 / 截断不许被当成正常输出**
 *
 * 执行层把这两种情况标在结果上（`timedOut` / `truncated`），而观测层拿到的若是「半截文本」，
 * 解析出来可能刚好是一个合法但**错的**状态（例如把上一次的日志当成这一次的）。所以它们原样
 * 传下去，由观测层升级成通道级失败。
 */
import { readTtyBooks } from '@hyzyn/dsh-kit'
import type { SettingsLookup } from '@hyzyn/dsh-kit'
import type { SshSpec } from '@hyzyn/dsh-kit/ssh-exec'

import type { LiveTarget } from './plugin-config.js'
import type { DockerRunner, ObservedCommand } from './observe.js'

/** `kit` 执行层的最小形状（`RemoteExec` 符合；写成结构类型是为了能在用例里喂假的）。 */
export interface RemoteExecLike {
  run(spec: SshSpec, argv: readonly string[], options?: { timeoutMs?: number; maxBytes?: number; keepTail?: boolean }): Promise<{
    code: number | null
    stdout: string
    stderr: string
    timedOut?: boolean
    truncated?: boolean
  }>
}

/** 本机执行的最小形状（`kit` 的 `runLocal` 符合）。 */
export interface LocalExecLike {
  (argv: readonly string[], options?: { timeoutMs?: number; maxBytes?: number; keepTail?: boolean }): Promise<{
    code: number | null
    stdout: string
    stderr: string
    timedOut?: boolean
    truncated?: boolean
  }>
}

/** 解析目标失败时给出的可读原因（指到该改哪里）。 */
export interface ChannelProblem {
  message: string
  hint: string
}

/** 解析结果：拿到一根可以跑 docker 的线，或者一句说得清的话。 */
export type ChannelResolution =
  | { kind: 'ready'; runner: DockerRunner; probeHost: string }
  | { kind: 'problem'; problem: ChannelProblem }

/** 观测层的选项（`observe.ts` 的 `DockerRunOptions`）：由调用方按「inspect 还是 logs」给。 */

/**
 * 把一个 `kit` 执行层的返回值翻成观测层认的形状。
 *
 * `timedOut` / `truncated` **原样带下去**——观测层据此升级成通道级失败（理由见文件头注）。
 */
export function toObserved(result: {
  code: number | null
  stdout: string
  stderr: string
  timedOut?: boolean
  truncated?: boolean
}): ObservedCommand {
  const observed: ObservedCommand = { code: result.code, stdout: result.stdout, stderr: result.stderr }
  if (result.timedOut === true) observed.timedOut = true
  if (result.truncated === true) observed.truncated = true
  return observed
}

/**
 * 给一个目标接一根线。
 *
 * @param target - 解析后的目标。
 * @param deps - 执行层与本机的两个实现，外加读连接簿用的 settings 句柄。
 */
export function resolveChannel(
  target: LiveTarget,
  deps: { remote: RemoteExecLike; local: LocalExecLike; settings: SettingsLookup | undefined; execTimeoutMs: number },
): ChannelResolution {
  if (target.kind === 'local') {
    return {
      kind: 'ready',
      probeHost: '127.0.0.1',
      runner: {
        run: async (argv, options) => toObserved(await deps.local(argv, {
          timeoutMs: options?.timeoutMs ?? deps.execTimeoutMs,
          maxBytes: options?.maxBytes ?? 512 * 1024,
          ...(options?.keepTail === true ? { keepTail: true } : {}),
        })),
      },
    }
  }

  const books = readTtyBooks(deps.settings)
  const spec = books.get(target.book)
  if (spec === undefined) {
    const available = [...books.keys()]
    return {
      kind: 'problem',
      problem: {
        message: `目标 ${target.id} 引用 tty 连接簿条目 ${JSON.stringify(target.book)}，但读不到它`,
        hint: available.length === 0
          ? '确认 @hyzyn/dsh-tty 已挂载、且连接簿里确实有这一条（本插件只**只读**它的条目，不自建连接簿界面）'
          : `连接簿里现在有：${available.join(' / ')}——把目标引用改成其中之一，或在终端面板里补一条`,
      },
    }
  }

  return {
    kind: 'ready',
    probeHost: spec.host,
    runner: {
      run: async (argv, options) => toObserved(await deps.remote.run(spec, argv, {
        timeoutMs: options?.timeoutMs ?? deps.execTimeoutMs,
        maxBytes: options?.maxBytes ?? 512 * 1024,
        ...(options?.keepTail === true ? { keepTail: true } : {}),
      })),
    },
  }
}
