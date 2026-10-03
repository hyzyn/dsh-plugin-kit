/**
 * 假 docker CLI（测试夹具）：在临时目录里造一个可执行的 `docker`，把它挂到 `PATH` 前面。
 *
 * ## 为什么不用 mock，而是造一个真进程
 *
 * 本包的宿主半体到目标之间隔着四层（插件 → `channel` → `observe` → `kit` 的执行层），而最容易接错
 * 的恰好是**最外面那一跳**：argv 拼对没有、`runLocal` 有没有真的被调用、输出的字节有没有原样回来。
 * mock 掉 `child_process` 就等于把这四层里唯一「真的跑了一遍」的部分换成了我自己写的想象。
 *
 * 造一个真脚本的代价是几毫秒（`spawn` 一个 `/bin/sh`），换来的是**整条链端到端可验**：
 * 插件注册的工具真的执行了、真的解析了、报告真的按判定层的意思写出来了。
 *
 * ## 它是可控的，不是「看起来像」
 *
 * 行为由环境变量驱动（`FAKE_DOCKER_MODE` 等），因此「容器不存在」「daemon 连不上」这些**必须走
 * 不同分支**的形态都能摆出来；每次调用的 argv 追加进一个日志文件，用例据此断言「到底发了哪几条
 * 命令」（例如「没声明 logPattern 就不该取日志」）。
 */
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** 假 docker 的行为开关（都是环境变量，脚本自己读）。 */
export interface FakeDockerPlan {
  /**
   * 总体形态：
   *   - `ok`：一切正常（inspect 给一行五字段、logs 给一行启动完成行）；
   *   - `missing`：`inspect` 报 `No such object`（容器不存在）；
   *   - `daemon-down`：`inspect` 报连不上 daemon（**必须**被当成通道失败，不是「容器没起」）；
   *   - `missing-then-ok`：**第一次**说容器不存在、之后正常——用来验 `env_wait` 真的会轮询
   *     （否则「等到了」这条路径只能靠读代码相信）。
   */
  mode?: 'ok' | 'missing' | 'daemon-down' | 'missing-then-ok'
  /** 覆盖 inspect 的那一行（例如造一个 `exited` 状态）。 */
  inspect?: string
  /** 覆盖 logs 的输出。 */
  logs?: string
  /**
   * 让某个子命令失败（`docker start` / `docker stop` 退出码 1）。
   *
   * 写入口的「单条失败不中断其余」那条判据要靠它——否则只能读到代码相信。
   */
  fail?: 'start' | 'stop'
}

/** 装好的假 docker。 */
export interface FakeDocker {
  /** 这个夹具的临时目录（用例可以断言它被清掉了）。 */
  dir: string
  /** 每次调用的 argv（一行一条，空格分隔）。 */
  calls(): string[]
  /** 还原 `PATH` **并删掉自己的临时目录**。 */
  cleanup(): void
}

/**
 * 造一个只认 `inspect` / `logs` 的 `docker`，并在**本进程**里把它挂到 PATH 最前面。
 *
 * 还原是调用方的责任（`cleanup()`）：漏了会让同文件里后续用例继续用到假 docker 而毫无提示。
 */
export function installFakeDocker(plan: FakeDockerPlan = {}): FakeDocker {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-devenv-fake-docker-'))
  const logFile = join(dir, 'calls.log')
  writeFileSync(logFile, '')
  const script = `#!/bin/sh
# 假 docker：只认本包会发的两条命令（inspect / logs），其余一律非零退出——
# 「多发了没预期到的命令」必须能被用例看见，而不是静默成功。
printf '%s\\n' "$*" >> "$FAKE_DOCKER_LOG"
mode="\${FAKE_DOCKER_MODE:-ok}"
case "$1" in
  inspect)
    if [ "$mode" = "missing" ]; then
      echo "Error: No such object: $4" >&2
      exit 1
    fi
    if [ "$mode" = "missing-then-ok" ]; then
      # 日志在 case 之前已经追加过本次调用：第 1 次调用（只有 1 行）说「不存在」，之后正常。
      n=$(wc -l < "$FAKE_DOCKER_LOG")
      if [ "$n" -le 1 ]; then
        echo "Error: No such object: $4" >&2
        exit 1
      fi
    fi
    if [ "$mode" = "daemon-down" ]; then
      echo "Cannot connect to the Docker daemon at unix:///var/run/docker.sock." >&2
      exit 1
    fi
    printf '%s\\n' "\${FAKE_DOCKER_INSPECT:-running|2026-10-01T12:00:00.000000000Z|0|0|healthy}"
    ;;
  logs)
    printf '%s\\n' "\${FAKE_DOCKER_LOGS:-2026-10-01T12:00:05.000000000Z Started EmsApplication in 12.3 seconds}"
    ;;
  start)
    # docker start <name>：名字是第 2 个参数
    if [ "\${FAKE_DOCKER_FAIL:-}" = "start" ]; then
      echo "Error response from daemon: No such container: $2" >&2
      exit 1
    fi
    echo "$2"
    ;;
  stop)
    if [ "\${FAKE_DOCKER_FAIL:-}" = "stop" ]; then
      echo "Error response from daemon: cannot stop container: permission denied" >&2
      exit 1
    fi
    # docker stop --time <秒> <name>：名字是最后一个参数（脚本是 TS 模板串，注释里不能用反引号）
    for last in "$@"; do :; done
    echo "$last"
    ;;
  *)
    echo "unexpected docker subcommand: $*" >&2
    exit 9
    ;;
esac
`
  const scriptPath = join(dir, 'docker')
  writeFileSync(scriptPath, script)
  chmodSync(scriptPath, 0o755)

  const previousPath = process.env.PATH
  const previous = {
    log: process.env.FAKE_DOCKER_LOG,
    mode: process.env.FAKE_DOCKER_MODE,
    fail: process.env.FAKE_DOCKER_FAIL,
    inspect: process.env.FAKE_DOCKER_INSPECT,
    logs: process.env.FAKE_DOCKER_LOGS,
  }
  process.env.PATH = `${dir}:${previousPath ?? ''}`
  process.env.FAKE_DOCKER_LOG = logFile
  process.env.FAKE_DOCKER_MODE = plan.mode ?? 'ok'
  if (plan.fail !== undefined) process.env.FAKE_DOCKER_FAIL = plan.fail
  if (plan.inspect !== undefined) process.env.FAKE_DOCKER_INSPECT = plan.inspect
  if (plan.logs !== undefined) process.env.FAKE_DOCKER_LOGS = plan.logs

  return {
    dir,
    calls: () => readFileSync(logFile, 'utf8').split('\n').filter((line) => line !== ''),
    cleanup: () => {
      /*
       * **先删目录**（D02）：这个夹具每装一次就建一个临时目录，只还原环境不删目录的话，跑一轮用例
       * 就会在系统临时区留下几百个目录（2026-10-02 实测：一次全量跑完积了 **570 个**，每个里一个
       * `docker` 脚本 + 一个 `calls.log`）。删在最前是因为后面的环境还原不会失败，而此时 PATH 还没还原。
       */
      rmSync(dir, { recursive: true, force: true })
      process.env.PATH = previousPath
      for (const [key, value] of [['FAKE_DOCKER_LOG', previous.log], ['FAKE_DOCKER_MODE', previous.mode], ['FAKE_DOCKER_INSPECT', previous.inspect], ['FAKE_DOCKER_LOGS', previous.logs], ['FAKE_DOCKER_FAIL', previous.fail]] as const) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
    },
  }
}
