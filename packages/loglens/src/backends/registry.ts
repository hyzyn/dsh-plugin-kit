/**
 * @hyzyn/dsh-loglens — 后端注册表（kind → 适配器）。
 *
 * **Docker 刻意不进这里**：它是**采集来源**，走设计 §5 的选项 0（现成的 `docker_logs` /
 * `docker_logs_grep`）——给它包一层只会造出第二份口径。注册表里没有 = 调用方拿到 undefined，
 * 由 src/execute.ts 的 `adapterHint` 说清「怎么绕」。
 */
import type { SourceKind } from '../config.js'
import { createElasticBackend } from './elastic.js'
import { createLokiBackend } from './loki.js'
import type { LogBackend } from './types.js'

const LOKI_BACKEND: LogBackend = createLokiBackend()
const ELASTIC_BACKEND: LogBackend = createElasticBackend({ flavor: 'es' })
const OPENSEARCH_BACKEND: LogBackend = createElasticBackend({ flavor: 'os' })

export function backendFor(kind: SourceKind): LogBackend | undefined {
  if (kind === 'loki') return LOKI_BACKEND
  if (kind === 'elasticsearch') return ELASTIC_BACKEND
  if (kind === 'opensearch') return OPENSEARCH_BACKEND
  return undefined
}
