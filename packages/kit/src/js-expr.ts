/**
 * @hyzyn/dsh-kit — YAML `!!js` 表达式方言的共享实现。
 *
 * DSH 配置（cordis.patch.yml / env.yml）里 `!!js process.env.X` 由 loader 侧用
 * 同一方言求值；mcp / env / codegraph 三个插件各自逐字复制了一份「js-yaml 自定义
 * 类型 + 浏览器 DTO 互转」，这里收敛成一份，保证序列化与求值语义永远一致。
 *
 * 信任模型：表达式来自用户自己的配置文件（`~/.dsh/**`），与 loader、mcp、env
 * 的现状完全一致——求值等价于用户在自己机器上执行代码，CSP 层面的隔离由宿主
 * 负责，本模块不做额外沙箱。**不要**把外部输入（HTTP body、远端响应）送进
 * evalJsExpr；DTO 反序列化出的 JsExpr 只应回写进用户自己的配置文件。
 */
import yaml from 'js-yaml'

/** `!!js <expr>` 的运行时表示：js-yaml 构造出的节点对象。 */
export interface JsExpr {
  __jsExpr: string
}

/** 判断任意值是否为 !!js 表达式节点（predicate 与 DTO 往返共用）。 */
export function isJsExpr(value: unknown): value is JsExpr {
  return typeof value === 'object' && value !== null && typeof (value as JsExpr).__jsExpr === 'string'
}

/**
 * js-yaml 的 !!js 类型：标签与 dsh-app-boot / 三个插件的副本一致
 * （tag:yaml.org,2002:js），predicate/represent 保证 load → dump 无损往返。
 */
export const JsExprType = new yaml.Type('tag:yaml.org,2002:js', {
  kind: 'scalar',
  resolve: (data: unknown) => typeof data === 'string',
  construct: (data: string) => ({ __jsExpr: data }) as JsExpr,
  predicate: (value: unknown): value is JsExpr => isJsExpr(value),
  represent: (value: JsExpr) => value.__jsExpr,
})

/** 带 !!js 支持的 schema：在 JSON_SCHEMA 上扩展（日期等标量语义保持宿主方言）。 */
export const jsYamlSchema = yaml.JSON_SCHEMA.extend(JsExprType)

/**
 * 求值 !!js 表达式并返回原始结果。
 * 入参是表达式原文（不带 `js:` 前缀、不带 !!js 标签）；语法错误会原样抛出，
 * 由调用方决定是回退默认值还是把错误暴露给用户。
 */
export function evalJsExpr(expr: string): unknown {
  const fn = new Function('process', 'return (' + expr + ')')
  return fn(process)
}

/** 序列化给浏览器：!!js 表达式写成 "js:<expr>" 前缀，其余转字符串。 */
export function dtoValue(value: unknown): string {
  if (isJsExpr(value)) return 'js:' + value.__jsExpr
  if (typeof value === 'string') return value
  return JSON.stringify(value)
}

/** 浏览器回传的反序列化：js: 前缀还原为 !!js 表达式节点，其余转字符串。 */
export function fromDtoValue(value: unknown): string | JsExpr {
  if (typeof value === 'string' && value.startsWith('js:')) return { __jsExpr: value.slice(3) }
  return String(value)
}
