/**
 * js-yaml 的最小环境声明：只声明本包用到的子集。
 *
 * **本文件自 2026-10-03 起是历史遗留**：本包不再直接 import `js-yaml`（清单骨架已上收
 * `@hyzyn/dsh-kit/manifest`）。删这份声明与 `package.json` 里那条依赖要走一次专门清理
 * （删文件属「先问」的动作），在此之前留着不影响编译。
 *
 * 原文（当时的理由）：js-yaml 在本包是运行时真实依赖（读项目内的就绪清单 `ready/<project>.ready.yaml`），但仓库没有装
 * `@types/js-yaml`；这里按实际用到的 API 面收窄声明，与 `devdata` / `kit` / `mcp` / `env` /
 * `codegraph` 等包内的同名声明保持一致的写法。
 *
 * 本包**只用到 `load` + `JSON_SCHEMA`**（见 `ready-loader.ts`）：就绪清单是**配置数据**，
 * 不是「能求值的表达式」。这一点与数据面同样重要——清单里出现可执行表达式就等于把「判据」变成
 * 「脚本」，评审面完全不同（一份声明式清单能被人一眼看完，一份脚本不能）。
 */
declare module 'js-yaml' {
  export interface SchemaLike {
    extend(type: unknown): SchemaLike
  }

  export const JSON_SCHEMA: SchemaLike

  export function load(text: string, options?: Record<string, unknown>): unknown

  const jsYaml: {
    JSON_SCHEMA: typeof JSON_SCHEMA
    load: typeof load
  }
  export default jsYaml
}
