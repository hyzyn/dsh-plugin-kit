/**
 * js-yaml 的最小环境声明：只声明本包用到的子集。
 *
 * js-yaml 在本包是运行时真实依赖（加载 !!js 表达式方言），但仓库没有装
 * @types/js-yaml；这里按实际用到的 API 面收窄声明，与 mcp / env / codegraph
 * 等包内的同名声明保持一致的写法。
 */
declare module 'js-yaml' {
  export class Type {
    constructor(tag: string, options: Record<string, unknown>)
  }

  export interface SchemaLike {
    extend(type: Type): SchemaLike
  }

  export const JSON_SCHEMA: SchemaLike

  export function load(text: string, options?: Record<string, unknown>): unknown
  export function dump(value: unknown, options?: Record<string, unknown>): string

  const jsYaml: {
    Type: typeof Type
    JSON_SCHEMA: typeof JSON_SCHEMA
    load: typeof load
    dump: typeof dump
  }
  export default jsYaml
}
