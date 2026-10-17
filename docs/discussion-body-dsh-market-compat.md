<!-- 本文件是**提给 DSH 上游的 GitHub Discussions 帖子正文副本**（不是本仓的文档）：正文用英文，便于上游直接阅读。
     文中的宿主文件路径（`dsh-plugin-market/lib/…` 等）指的是**宿主运行时**里装的包，本仓解析不到，
     所以一律写成行内代码、不做相对链接（与 docs/pr-body-dsh-market.md 的同类处理一致）。

     去处与渠道（2026-10-16 核实）：代码归属 **deepseek-ai/deepseek-harness**——`@deepseek-ai/dsh-plugin-market`
     自己的 `package.json` 写着 `repository.url = …/deepseek-ai/deepseek-harness.git`、
     `directory = packages/boot/plugin-market`。但该仓库 **issues 已关闭**（`has_issues: false`），
     其 `CONTRIBUTING.md` 明写「Identify and report issues or bugs in GitHub Discussions」；
     分类里没有专门的 bug 板，最接近的是 `General`（备选 `Q&A`，它是唯一 answerable 的）。**不要走 `gh issue create`**。
     别与另一个同名的「市场」搞混：设置里的「创意工坊」索引来自第三方仓库 `zhu1090093659/dsh-web`
     （见 docs/market-index.md），本报告说的不是那条轨道。

     本仓为什么坚持「强制只靠 `peerDependencies` 的多段范围、顶层 `engines.dsh` 不写」，
     见 `scripts/check-dsh-peers.mjs` 头部两字段的说明；本报告只描述上游那处漏判，不改本仓写法。
     复核日期：2026-10-16，宿主 0.2.1-alpha.5。

     **已发布（2026-10-17）**：https://github.com/deepseek-ai/deepseek-harness/discussions/9907
     （分类 `General`，作者 hyzyn，`number=9907`）。下文第 17 行起的正文与线上 `body` **逐字一致**
     （6082 字符，比对日期 2026-10-17）；正文里的例子已脱敏（不出现本仓包名），涉及本仓的说明只留在本注释里。
     后续跟进（官方回复 / 修好）请更新本行，别改正文。 -->

# `dsh-plugin-market` reports `compatible: true` for plugins that declare DSH support only via `peerDependencies`

## Summary

The market evaluates a listed version's DSH compatibility from the **top-level `engines.dsh`** of its
market-index entry alone. For a package that declares its DSH range only in `peerDependencies` — the
fallback DSH itself documents — the manifest handed to the evaluator then carries **no requirements at
all**, so the version is reported `compatible: true` for **every** runtime version, including ones below
its declared floor and arbitrary future majors.

## The rule DSH documents

`dsh-plugin-manager`'s own tool description states the rule (`dsh-plugin-manager/lib/types/tools.js`):

> Unmet DSH version requirements (engines.dsh, else DSH peer dependencies) block installation and activation.

`dsh-app-boot`'s `unmetRequirements()` implements exactly that: it reads the **top-level** `engines.dsh`
and falls back to `peerDependencies` when the field is absent. (A top-level `engines.dsh`, when present,
short-circuits the peer list entirely — which is why a multi-cohort range has to live in peers.)

## What the market does instead

`dsh-plugin-market` states the same intent (`dsh-plugin-market/lib/types/types.d.ts`):

> Whether the running DSH version satisfies a version's `engines.dsh`, **as DSH's installation check evaluates it**.

But `compatibilityOf()` builds the manifest from the **market-index entry**, which has no peers to pass:

```js
// dsh-plugin-market/lib/types/index.js — and the same helper again in dsh-plugin-market/lib/index.js
function compatibilityOf(name, version, exemptions, runtimeVersion) {
  const manifest = {
    name,
    version: version.version,
    ...version.engines.dsh === undefined ? {} : { engines: { dsh: version.engines.dsh } }
  }
  const issue = evaluatePluginCompatibility(manifest, exemptions, runtimeVersion)
  if (issue === undefined) return { compatible: true }
  return { compatible: false, runtimeVersion: issue.runtimeVersion, requirements: issue.requirements, exempted: issue.exempted }
}
```

The index schema confirms there is nothing else available: the generated declaration for a listed
version is `MarketVersion = { readonly version, readonly publishTimestamp, readonly source, readonly engines }`
(see `dsh-plugin-market/lib/typert.host.js`). And `MarketCompatibility.requirements` is documented as
"keyed `engines.dsh`", i.e. the type contract itself assumes `engines.dsh` is the only possible
requirement source.

## Why it matters

`peerDependencies` is the only place a range can express an **upper bound**. A caret range per tested
cohort (`^0.1.7-rc.2 || ^0.2.0-rc.1 || …`) expands to a bounded interval, so a line that has not been
adapted yet is correctly rejected until it becomes an explicit cohort. `engines.dsh` is a single `>=`
segment with no upper bound.

Reporting `compatible: true` unconditionally therefore drops the guarantee in exactly the case where the
declaration is strongest — and it never turns red, because it never consults the declaration at all.

## Reproduction

Take any published plugin that declares its DSH support range in `peerDependencies` and carries no
top-level `engines.dsh`, for instance:

```json
{ "peerDependencies": { "@deepseek-ai/dsh": "^0.1.7-rc.2 || ^0.2.0-rc.1 || ^0.2.0-rc.2 || ^0.2.1-alpha.1 || ^0.2.1-alpha.2" } }
```

Evaluating that package with the host's own `evaluatePluginCompatibility` at runtime `0.2.1-alpha.5`:

| runtime | market path (index entry → `engines.dsh` only) | with `peerDependencies` passed through |
|---|---|---|
| 0.1.6-rc.5 | compatible | **incompatible** |
| 0.2.1-alpha.5 | compatible | compatible |
| 0.3.0 | compatible | **incompatible** |
| 1.0.0 | compatible | **incompatible** |

The market reports the version compatible even for a runtime **below the declared floor**.

Minimal check (host runtime `0.2.1-alpha.5`):

```js
import { evaluatePluginCompatibility } from '<host>/@deepseek-ai/dsh-app-boot/lib/index.js'
const PEERS = '^0.1.7-rc.2 || ^0.2.0-rc.1 || ^0.2.0-rc.2 || ^0.2.1-alpha.1 || ^0.2.1-alpha.2'
const entry = { name: 'p', version: '1.0.0', peerDependencies: { '@deepseek-ai/dsh': PEERS } }
// what the market builds today (no top-level engines.dsh → nothing to pass):
evaluatePluginCompatibility({ name: entry.name, version: entry.version }, {}, '0.3.0')            // undefined = compatible
// with the peer range carried through:
evaluatePluginCompatibility({ name: entry.name, version: entry.version, peerDependencies: entry.peerDependencies }, {}, '0.3.0')  // reports the requirement
```

## Suggested fix

1. **Short term** — carry the requirement sources through the index: add `peerDependencies` (or a
   canonical resolved-requirements field) to `MarketVersion`, and pass it into
   `evaluatePluginCompatibility` in both `compatibilityOf()` copies so the market really does evaluate
   "as DSH's installation check evaluates it". Index producers must emit the field.
2. **Also** — once peers can participate, widen the `MarketCompatibility.requirements` contract from
   "keyed `engines.dsh`" to "keyed by requirement source" (the key is already whatever the evaluator
   returns).
3. **Root cause worth addressing** — the rule now has three implementations (`dsh-plugin-manager`,
   `dsh-app-boot`, `dsh-plugin-market`) and one of them is partial. Extracting a single shared
   requirement resolver (e.g. `pluginRequirements(manifest)`) and having all three consume it would stop
   them drifting apart again.

## Environment

- DSH `0.2.1-alpha.5`, macOS, `@deepseek-ai/dsh` installed globally.
- Relevant files: `dsh-plugin-market/lib/types/index.js` (`compatibilityOf`),
  `dsh-plugin-market/lib/index.js` (same helper), `dsh-plugin-market/lib/typert.host.js`
  (`MarketVersion` schema), `dsh-plugin-market/lib/types/types.d.ts` (`MarketCompatibility`), versus
  `dsh-plugin-manager/lib/types/tools.js` (the documented rule),
  `dsh-plugin-manager/lib/index.js` (fetches `engines` **and** `peerDependencies`),
  `dsh-app-boot/lib/index.js` (`unmetRequirements`).
