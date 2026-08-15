/**
 * Minimal ambient declaration for the subset of js-yaml this plugin uses.
 * js-yaml is resolved at runtime from the profile's node_modules (declared
 * dependency), so only the API surface we touch needs to be typed here.
 */
declare module 'js-yaml' {
  export class Type {
    constructor(tag: string, options: Record<string, unknown>)
  }

  export interface SchemaLike {
    extend(type: Type): unknown
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
