/**
 * 真机脚本的**隔离引导**（唯一归宿）：一次性临时目录、隔离的 `DSH_HOME`、profile 播种、
 * 「真实配置逐字节未变」的自证，以及运行时包的同源解析。
 *
 * ## 为什么把它抽出来
 *
 * [docs/agent-real-test.md](../../docs/agent-real-test.md) 的三条硬约束里，①②是**每个**真机
 * 脚本都要满足的：不污染真实 `~/.dsh`、并**自证**这一点。抽取之前，同一段引导被逐字抄在五个
 * `scripts/verify-codegraph-*.mjs` 里（每个 2 处 `mkdtemp` + 4–7 处 `DSH_HOME`/`dshHome`），
 * 后果不是啰嗦而是**漂移**：其中 indexforce 那份抄漏了收尾比对，`realPatchBefore` 声明后
 * 从未被使用，而静态守卫因为正则命中了它的一句注释而保持全绿（2026-09-30 分诊实测）。
 * 现在这段逻辑只有一份正文，守卫断言它，五个脚本只是调用方。
 *
 * ## 红线（codegraph CG45 / CG48 换来的，**不许为了「能跑」放宽**）
 *
 * 1. **独立 `DSH_HOME`**：被测宿主的每一次 spawn 都必须经 `hostEnv()` 传入隔离 home；
 *    本模块也提供 `isolatedHome` 供**进程内**挂插件（agent-integration 那种）显式赋值。
 * 2. **自证真实配置未变**：`verifyRealPatchUnchanged()` 的比对结果**必须**被调用方断言
 *    （而不是只声明快照）。守卫读源码钉住这一点。
 * 3. **临时资源带可识别前缀**：`createTempWorkDir` / `createLiveHarness` 的 `prefix` 由调用方
 *    给定且**保持各脚本原有前缀**（`cg-host-contract-` / `cg-force-` / `dsh-cg-agent-scope-` …），
 *    不做统一改名——前缀是「这个目录是谁的」的唯一线索。
 *
 * ## 清理时机一个字不改
 *
 * 目标目录**先清空再拷**（codegraph CG48：往已存在的目标上拷，残留的符号链接会指回源树，
 * `cpSync` 直接报 "Cannot copy X to a subdirectory of self"）。清理仍由调用方在**自己的
 * `finally`** 里调 `cleanup()` —— `rmSync(workDir, { recursive: true, force: true })` 的时机与
 * 原来一致。
 *
 * 本模块只读真实 `~/.dsh`（快照与比对），**从不写它**。
 */
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

/** 真实 DSH home：`DSH_HOME` 优先，否则 `$HOME/.dsh`（抽取前五个脚本里逐字相同的那两行）。 */
export function realDshHome() {
  return process.env.DSH_HOME?.trim() || join(process.env.HOME ?? '', '.dsh')
}

/** 真实 `cordis.patch.yml` 的路径。 */
export function realPatchPath(dshHome = realDshHome()) {
  return join(dshHome, 'cordis.patch.yml')
}

/**
 * 运行前的真实补丁快照。
 *
 * @returns `{ path, before }`；文件不存在时 `before` 为 `undefined`（收尾比对要能区分
 *   「不存在→仍不存在」与「不该出现却出现了」）。
 */
export function snapshotRealPatch(dshHome = realDshHome()) {
  const path = realPatchPath(dshHome)
  return { path, before: existsSync(path) ? readFileSync(path, 'utf8') : undefined }
}

/**
 * 收尾自证：真实补丁**逐字节未变**（把「不污染用户配置」从承诺变成会被执行的检查）。
 *
 * 调用方**必须**拿 `unchanged` 去断言/记录——只声明快照比不比对更糟（indexforce 的实测教训）。
 *
 * @returns `{ unchanged, path, before, after, bytes }`：`bytes` 是收尾时真实补丁的字节数
 *   （不存在时 `undefined`），供各脚本沿用自己原来的 detail 文案。
 */
export function verifyRealPatchUnchanged(snapshot) {
  const after = existsSync(snapshot.path) ? readFileSync(snapshot.path, 'utf8') : undefined
  return {
    unchanged: after === snapshot.before,
    path: snapshot.path,
    before: snapshot.before,
    after,
    bytes: after === undefined ? undefined : after.length,
  }
}

/**
 * 一次性临时工作目录（**带可识别前缀**）。
 *
 * @param prefix - 各脚本原有的前缀，一个字不改。
 * @returns `{ workDir, cleanup() }`；`cleanup()` 就是原来的
 *   `rmSync(workDir, { recursive: true, force: true })`，调用时机仍由调用方的 `finally` 决定。
 */
export function createTempWorkDir(prefix) {
  const workDir = mkdtempSync(join(tmpdir(), prefix))
  return {
    workDir,
    cleanup() {
      rmSync(workDir, { recursive: true, force: true })
    },
  }
}

/**
 * 一次性的**隔离宿主** harness：临时目录 + 隔离 `DSH_HOME` + profile 播种 + 补丁快照。
 *
 * @param options.prefix - 临时目录前缀（各脚本原有前缀）。
 * @param options.profile - 要拷进隔离 home 的 profile 名；不给 = 只建 `profiles/` 不拷
 *   （agent-integration 就是这种：它不 spawn 宿主，只在进程内挂插件）。
 */
export function createLiveHarness({ prefix, profile } = {}) {
  const { workDir, cleanup } = createTempWorkDir(prefix)
  const isolatedHome = join(workDir, 'dsh-home')
  mkdirSync(join(isolatedHome, 'profiles'), { recursive: true })
  const home = realDshHome()
  const patch = snapshotRealPatch(home)
  const profileDir = profile === undefined ? undefined : join(isolatedHome, 'profiles', profile)

  return {
    workDir,
    isolatedHome,
    /** 真实 home（脚本里另有用处时要它，例如 --runtime-store 的重指日志）。 */
    realDshHome: home,
    /** 运行前的真实补丁快照，交给 `verifyRealPatchUnchanged`。 */
    patch,
    /** 隔离目录里那份 profile 的路径（`profile` 未给时为 `undefined`）。 */
    profileDir,
    /**
     * spawn 被测宿主时的 `env`：**必须**显式覆盖 `DSH_HOME`（codegraph CG45 的教训——
     * 继承真实值会让插件的托管行写进用户真实配置）。
     *
     * @param extra - 额外的环境变量（例：indexforce 的 `CG_FAKE_LOG`）。
     */
    hostEnv(extra) {
      return { ...process.env, DSH_HOME: isolatedHome, ...extra }
    },
    /** 把被测 profile 拷进隔离目录（**先清空目标再拷**，CG48）。 */
    syncProfile() {
      if (profile === undefined || profileDir === undefined) {
        throw new Error('createLiveHarness() 没有给 profile，无法 syncProfile()')
      }
      rmSync(profileDir, { recursive: true, force: true })
      cpSync(join(home, 'profiles', profile), profileDir, { recursive: true })
    },
    cleanup,
  }
}

/**
 * 运行时包的同源解析：先找到 `@deepseek-ai/dsh-mcp-client`，再从**它所在的那一层**解析其余全部。
 *
 * 这是**正确性要求**而不是便利：`dsh-scope` 的 `kScope` 是模块内局部 Symbol，解析到第二份副本
 * 会让所有 `scopeOf()` 返回 `undefined`，隔离**静默失效**。从 mcp-client 所在目录解析天然保证同源。
 *
 * @param repoRoot - 仓库根。
 * @returns `{ mcpClientPath, runtimeScopeDir, loadRuntime }`：`loadRuntime(specifier)` 返回 Promise。
 */
export function resolveRuntimeLoader(repoRoot) {
  const mcpClientPath = createRequire(join(repoRoot, 'packages', 'codegraph', 'package.json'))
    .resolve('@deepseek-ai/dsh-mcp-client')
  // .../@deepseek-ai/dsh-mcp-client/lib/index.js → 上溯三层到 .../@deepseek-ai
  const runtimeScopeDir = dirname(dirname(dirname(mcpClientPath)))
  const runtimeRequire = createRequire(join(runtimeScopeDir, 'anchor.cjs'))
  return {
    mcpClientPath,
    runtimeScopeDir,
    loadRuntime: (specifier) => import(pathToFileURL(runtimeRequire.resolve(specifier)).href),
  }
}
