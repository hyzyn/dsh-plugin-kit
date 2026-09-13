/** `!!js <expr>` 的运行时表示：js-yaml 构造出的节点对象。 */
export interface JsExpr {
    __jsExpr: string;
}
/** 判断任意值是否为 !!js 表达式节点（predicate 与 DTO 往返共用）。 */
export declare function isJsExpr(value: unknown): value is JsExpr;
/**
 * js-yaml 的 !!js 类型：标签与 dsh-app-boot / 三个插件的副本一致
 * （tag:yaml.org,2002:js），predicate/represent 保证 load → dump 无损往返。
 */
export declare const JsExprType: import("js-yaml").Type;
/** 带 !!js 支持的 schema：在 JSON_SCHEMA 上扩展（日期等标量语义保持宿主方言）。 */
export declare const jsYamlSchema: import("js-yaml").SchemaLike;
/**
 * 求值 !!js 表达式并返回原始结果。
 * 入参是表达式原文（不带 `js:` 前缀、不带 !!js 标签）；语法错误会原样抛出，
 * 由调用方决定是回退默认值还是把错误暴露给用户。
 */
export declare function evalJsExpr(expr: string): unknown;
/** 序列化给浏览器：!!js 表达式写成 "js:<expr>" 前缀，其余转字符串。 */
export declare function dtoValue(value: unknown): string;
/** 浏览器回传的反序列化：js: 前缀还原为 !!js 表达式节点，其余转字符串。 */
export declare function fromDtoValue(value: unknown): string | JsExpr;
