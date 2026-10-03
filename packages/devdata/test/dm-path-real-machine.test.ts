/**
 * 真机：**达梦那条通路的第一段**（门控在环境变量上，默认跳过）——`ssh → docker exec → 容器内命令`。
 *
 * ```sh
 * DEVDATA_DM_161=1 DEVDATA_SSH_PASSWORD=… npx vitest run packages/devdata/test/dm-path-real-machine.test.ts
 * ```
 *
 * ## 为什么先验这一段（它不需要任何数据库账号）
 *
 * 达梦的数据面按 §17.6 走**通路 B**：客户端 `disql` 在容器 `dm8_test` 里，宿主上没有。于是实际执行形态是
 *
 * ```
 * kit 的执行层（ssh）→ docker exec dm8_test → sh -c '… disql …'
 * ```
 *
 * ——**三层引号叠在一起**，而这恰好是「写出来看着对、真机上全错」的高发区。它**不需要数据库账号**
 * 就能验完，所以应当在写执行器之前先钉住；否则等账号到手，第一次跑 `disql` 的失败会同时混着
 * 「引号错了」与「权限没给全」两种可能，谁也说不清是哪一个。
 *
 * ## 用例覆盖的四件（都是零凭据的只读命令）
 *
 * 1. **能进容器**：`docker exec <容器> ls /opt/dmdbms/bin/disql` 拿到客户端路径；
 * 2. **三层引号没被吃掉**：构造一条**只有引号正确时才输出 `[a b]`** 的命令（按空格断开就会变成
 *    `[a][b]`）——这是这一段最容易错的地方；
 * 3. **stdin 通路**：`docker exec -i` + 喂 stdin（将来 `disql` 要靠它喂 SQL 脚本，避开交互提示）；
 * 4. **错误形状**：容器不存在时，远端到底回什么（将来执行器要把这两种失败分开：容器没了 vs 查询失败）。
 *
 * ## 实测的时序（对将来的超时设置有直接影响）
 *
 * 2026-10-02 首跑：第 ① 条（**冷连接**）**6.5 秒**，其余各条 200~400ms。也就是说**第一条命令的代价
 * 主要是建连**，而 `devdata` 的默认 `timeoutMs` 是 **5000ms**——达梦执行器如果不放宽这一档，
 * 第一次调用会超时（症状是「连接超时」，而不是任何 SQL 的问题）。写执行器时要么把这一档调大、
 * 要么把建连与查询分开计时。
 *
 * ## 真机样本已经录成 fixture
 *
 * `test/fixtures/dm/disql-help.txt` 与 `test/fixtures/dm/docker-exec-errors.txt` 是**逐字抄自 161 的
 * 真实输出**（采集命令写在文件里）。下面的 ④⑤ 两条断言**直接对着它们判**——这样 fixture 不是装饰：
 * 机器上措辞一变，用例会红，然后你会去更新那份「录下来的现实」，而不是去改一条凭空的期望值。
 *
 * ## 跑之前先看输出里有没有 `5 skipped`
 *
 * 门控变量是 **`DEVDATA_DM_161`**（不是 `DEVENV_…`）。**漏拼只会静默跳过 5 条**——不报错、也不红，
 * 屏幕上只有一行 `Tests 5 skipped (5)`。所以跑完先看这两件事：①有没有出现 `5 skipped`（说明门控没生效）；
 * ②有没有 PASS/FAIL（那才是真跑了）。**另外别把 `read -rs` 与后面的命令放进同一次粘贴**：
 * `read` 会把粘贴块里的下一行当成口令吃掉，于是那条命令根本不会执行（2026-10-02 实测踩过）。
 *
 * ## 它不做什么
 *
 * 不连数据库、不发任何 SQL、也不需要任何数据库账号——**这一段的性质就是「通路通不通」**。
 * 凭据只从环境变量取（`DEVDATA_SSH_PASSWORD` / `DEVDATA_SSH_KEY_PATH`），**用例自己绝不读凭据存储**。
 */
import { readFileSync } from 'node:fs'

import { afterAll, describe, expect, it } from 'vitest'

import { RemoteExec } from '@hyzyn/dsh-kit/ssh-exec'
import type { SshSpec } from '@hyzyn/dsh-kit/ssh-exec'

/**
 * 目标主机：**必须显式给**（`DEVDATA_SSH_HOST` / `DEVENV_REAL_SSH_HOST`）。
 *
 * 刻意**不留默认地址**：那台机器是公网 IP，默认值写进仓库就等于把地址入库
 * （闸门：`scripts/check-no-public-ip.mjs`）。没给 host 就整档 SKIP，不会去打任何地址。
 */
const HOST = process.env.DEVENV_REAL_SSH_HOST ?? process.env.DEVDATA_SSH_HOST ?? ''
const USER = process.env.DEVDATA_SSH_USER ?? 'root'
const PASSWORD = process.env.DEVDATA_SSH_PASSWORD ?? process.env.DEVENV_REAL_SSH_PASSWORD
const KEY_PATH = process.env.DEVDATA_SSH_KEY_PATH ?? process.env.DEVENV_REAL_SSH_KEY_PATH
/** 达梦那个容器（可用环境变量换）。 */
const CONTAINER = process.env.DEVDATA_DM_CONTAINER ?? 'dm8_test'
/** `disql` 在容器里的路径（DM 镜像的标准位置）。 */
const DISQL = process.env.DEVDATA_DISQL ?? '/opt/dmdbms/bin/disql'
const CAN_PROBE = process.env.DEVDATA_DM_161 === '1' && HOST !== ''

/** 读一份真机样本，去掉 `#` 注释行与首尾空行。 */
function readSample(relative: string): string[] {
  const text = readFileSync(new URL(relative, import.meta.url), 'utf8')
  return text
    .split('\n')
    .filter((line) => !line.startsWith('#') && line.trim() !== '')
}

const spec: SshSpec = {
  host: HOST,
  port: Number(process.env.DEVDATA_SSH_PORT ?? '22'),
  username: USER,
  auth: KEY_PATH === undefined ? 'password' : 'key',
  ...(KEY_PATH === undefined ? { password: PASSWORD ?? '' } : { keyPath: KEY_PATH }),
}

describe.skipIf(!CAN_PROBE)(`真机：达梦通路第一段（${USER}@${HOST} → docker exec ${CONTAINER}）`, () => {
  // TOFU 记录只放内存（真机用例不往任何持久存储里写东西）
  const exec = new RemoteExec({ info: () => {}, warn: (message) => console.log(`  · [warn] ${message}`) }, {
    get: () => undefined,
    record: () => {},
  }, { tag: 'dsh-devdata-dm' })

  /** 在目标机上跑一条命令（连接层抖动重试两次，真机用例的惯例）。 */
  const run = async (argv: readonly string[], options: { input?: string; timeoutMs?: number } = {}) => {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await exec.run(spec, argv, {
          timeoutMs: options.timeoutMs ?? 20_000,
          ...(options.input === undefined ? {} : { input: options.input }),
        })
      } catch (error) {
        if (attempt >= 3) throw error
        await new Promise((resolve) => setTimeout(resolve, 800))
      }
    }
  }

  it('① 能进容器并拿到 disql 的路径（宿主上没有它是正常的：达梦是容器跑的）', async () => {
    const result = await run(['docker', 'exec', CONTAINER, 'ls', DISQL])
    expect(result.code, `${result.stdout}${result.stderr}`).toBe(0)
    expect(result.stdout.trim()).toContain('disql')
  })

  it('② 三层引号没被吃掉：按空格断开就会输出 `[a][b]` 而不是 `[a b]`', async () => {
    // 只有「ssh 那一层 + docker exec 那一层 + sh -c 那一层」都保住引号，才会得到 `[a b]`
    const result = await run(['docker', 'exec', CONTAINER, 'sh', '-c', 'printf "[%s]" "a b"'])
    expect(result.code, result.stderr).toBe(0)
    expect(result.stdout, '引号在某一层被吃掉了（printf 收到两个参数会重复格式串）').toBe('[a b]')
  })

  it('③ stdin 通路：`docker exec -i` + 喂 stdin（将来 disql 要靠它喂脚本、避开交互提示）', async () => {
    const result = await run(['docker', 'exec', '-i', CONTAINER, 'sh', '-c', 'cat | wc -c'], { input: 'hello' })
    expect(result.code, result.stderr).toBe(0)
    // `hello` 无换行 = 5 字节；这里刻意断言**精确值**：多一个换行就说明某一层动了输入
    expect(result.stdout.trim()).toBe('5')
  })

  it('④ 错误形状：容器不存在时远端回什么（将来要与「查询失败」分开）', async () => {
    const result = await run(['docker', 'exec', 'dsh-devdata-这个容器不存在', 'ls'])
    expect(result.code).not.toBe(0)
    const text = `${result.stdout}\n${result.stderr}`.trim()
    /*
     * 断言**逐字等于**录下来的那句（`test/fixtures/dm/docker-exec-errors.txt`）。
     *
     * 为什么敢钉死：这句是执行器必须认出来的**唯一**入口——「容器没了」与「查询失败」的处置相反
     * （前者去修通路、后者才是 SQL 的问题），所以它必须是一句**可精确匹配**的话。docker 哪天改了
     * 措辞，这里会红，然后我们更新 fixture（那份「录下来的现实」），而不是把断言放宽到认不出来。
     */
    expect(text).toBe(readSample('./fixtures/dm/docker-exec-errors.txt')[0])
  })

  it('⑤ `disql` 能跑起来并吐出它的用法（**不需要任何数据库账号**）', async () => {
    const result = await run(['docker', 'exec', CONTAINER, DISQL, '-h'])
    const text = `${result.stdout}\n${result.stderr}`
    console.log(`  · disql -h（退出码 ${String(result.code)}）首几行：\n${text.trim().split('\n').slice(0, 6).map((line) => `      ${line}`).join('\n')}`)
    /*
     * 首行对着录下来的样本判（`test/fixtures/dm/disql-help.txt` 的第一行就是它）+ 退出码 0（实测）。
     * 这一条要证明的是**客户端能起来、且我们认得出版本**——版本号将来要用来说清「这是哪一版的达梦」
     * （不同版本的 `EXPLAIN` 语法与输出格式可能不同）。
     */
    const sample = readSample('./fixtures/dm/disql-help.txt')
    expect(result.stdout.split('\n')[0]?.trim()).toBe(sample[0])
    expect(result.stdout).toContain(sample[1] ?? '')
    expect(result.code).toBe(0)
  })

  afterAll(() => {
    exec.disposeAll()
  })
})
