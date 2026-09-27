/**
 * 把 `DSH_HOME` 指到一个**临时目录**（每个测试文件一份）——`import './isolated-home.js'` 即可。
 *
 * ## 为什么必须有（tty D69）
 *
 * 本插件 0.21.0 起会读 `<DSH home>/dsh-kit/capability-grants.json`（就地提权那条通道，见
 * `packages/kit/src/grant-store.ts`）。于是**任何挂载插件的用例**都会顺带读开发机上的**真实**
 * 授权：开发机上用卡片授权过一次之后，那批「未授权 → 必须 400 / 必须拒绝」的断言就会在他那儿
 * 红、在 CI 上绿——最坏的那种脆测试（本机实测：`proxy-command.test.ts` 的
 * 「POST /config 想把 allowProxyCommand 打开 → 400」正是这么变红的）。
 *
 * 做法与 `packages/docker/test/*` 里各文件自己那一段一致，只是抽成一行 import：挂载插件的
 * 文件有十来个，抄十遍只会让下一个人漏掉一处。
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll } from 'vitest'

const previous = process.env.DSH_HOME
const dir = mkdtempSync(join(tmpdir(), 'dsh-tty-home-'))
process.env.DSH_HOME = dir

afterAll(() => {
  if (previous === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = previous
  rmSync(dir, { recursive: true, force: true })
})
