/**
 * js-yaml 的最小环境声明：只声明本包用到的子集。
 *
 * **本文件自 2026-10-03 起是历史遗留**：本包不再直接 import `js-yaml`（清单骨架已上收
 * `@hyzyn/dsh-kit/manifest`）。删这份声明与 `package.json` 里那条依赖要走一次专门清理（删文件属
 * 「先问」的动作），在此之前留着不影响编译。
 *
 * 原文（当时的理由）：js-yaml 在本包是运行时真实依赖（读项目内的验活断言清单 `verify/<project>.yaml`），但仓库没有装
 * `@types/js-yaml`；这里按实际用到的 API 面收窄声明，与 `kit` / `mcp` / `env` / `codegraph`
 * 等包内的同名声明保持一致的写法。
 *
 * 本包**只用到 `load`**，而且只喂 `JSON_SCHEMA`（见 `verify.ts`）：断言清单是**配置数据**，
 * 不是「能求值的表达式」，所以刻意不引入 `!!js` 那套方言——验活清单里出现可执行表达式
 * 就等于把「断言」变成「脚本」，评审面完全不同。
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
