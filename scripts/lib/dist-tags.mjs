/**
 * `next` dist-tag 的**同步**与**判据**——一处实现，两处消费：发布脚本的收尾、单测。
 *
 * ## 为什么要有它
 *
 * 本仓的预发布走 `--tag next`（[`release-publish-tag.mjs`](../release-publish-tag.mjs) 对带 `-`
 * 的版本自动这么做），而**稳定版只更新 `latest`**。于是 `next` 会一直停在某个很久以前的 rc 上：
 *
 * | 包 | 修之前 `next` 指着 | 当时的 `latest` |
 * | --- | --- | --- |
 * | `@hyzyn/dsh-tty` | `0.22.0-rc.2` | `0.37.3` |
 * | `@hyzyn/dsh-kit` | `0.5.0-rc.1` | `0.7.4` |
 * | `@hyzyn/dsh-loglens` | **没有这个 tag** | `0.1.7` |
 *
 * 2026-11-05 实测。用户按文档装 `@next` 会拿到一份半年前的预发布，而**没有任何东西会红**——
 * 这正是「没有守卫的规矩会在下一次改动里漂掉」（[docs/conventions.md § 编号规范](../../docs/conventions.md)）。
 *
 * ## 判据
 *
 * 1. **`next` 必须等于本仓这次发布的版本**——它是「最新一次发布」的通道，不跟就漂；
 * 2. **稳定版还要求 `latest` 也等于它**（预发布不抢占正式通道，所以预发布时不判 `latest`）。
 *
 * 判据是**相等**而不是「不落后」：`next` 指向一个**未来**的版本同样是错的（说明有人在仓库外
 * 发过包，或上一次发布回滚了一半），而 `semver` 比较会让这种错静默通过。
 *
 * ## 纯函数
 *
 * 本文件不碰网络、不碰文件（`tags` 由调用方从 registry 读来），反例由
 * [`scripts/test/dist-tags.test.ts`](../test/dist-tags.test.ts) 造——与 `release-verify.mjs`
 * 同一条纪律：**判据可单测，副作用留在 CLI**。
 *
 * 不写 shebang：本文件要被 vitest import（同 [`check-kit-pins.mjs`](../check-kit-pins.mjs) 的注释）。
 */

/** 「最新一次发布」通道的 tag 名。 */
export const NEXT_TAG = 'next'

/** 正式通道的 tag 名。 */
export const LATEST_TAG = 'latest'

/** 走正式通道的判定：版本号带 `-` 的是预发布。 */
export function isPrerelease(version) {
  return version.includes('-')
}

/**
 * 判据：`next`（稳定版还有 `latest`）必须指向 `version`。
 *
 * @param input.name - 包名（只用于文案）。
 * @param input.version - 本仓这次要发布的版本。
 * @param input.tags - registry 上的 `dist-tags` 对象（读不到时传 `undefined`）。
 * @returns 违规描述数组；空数组 = 绿。
 */
export function judgeNextTag({ name, version, tags }) {
  const violations = []
  const next = tags?.[NEXT_TAG]
  const latest = tags?.[LATEST_TAG]
  if (next === undefined) {
    // 「没有这个 tag」与「指向错版本」是两件事：前者要 `add`，后者要 `add` 覆盖，但文案不同。
    violations.push(`${name} 在 registry 上没有 ${NEXT_TAG} dist-tag（应有，指向 ${version}）`)
  } else if (next !== version) {
    violations.push(`${name} 的 ${NEXT_TAG} 指向 ${next}，应为 ${version}`)
  }
  if (!isPrerelease(version) && latest !== version) {
    violations.push(`${name} 的 ${LATEST_TAG} 指向 ${latest ?? '(无)'}，稳定版应为 ${version}`)
  }
  return violations
}

/**
 * 可直接粘的修法命令。
 *
 * 为什么把 `--registry` 写进文案：本机 `~/.npmrc` 可能指向内网镜像（2026-10-06 与 2026-11-05
 * 各踩过一次），缺了它 `dist-tag add` 会打到镜像上、或者报「要登录」而让人以为是权限问题。
 *
 * @param input.name - 包名。
 * @param input.version - 要指过去的版本。
 * @returns 一条 `npm dist-tag add …` 命令。
 */
export function describeDistTagFix({ name, version }) {
  return `npm dist-tag add ${name}@${version} ${NEXT_TAG} --registry https://registry.npmjs.org`
}
