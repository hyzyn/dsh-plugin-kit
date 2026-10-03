/**
 * 操作矩阵：**操作级**能力判定的单一真源。
 *
 * ## 为什么矩阵按「操作」组织，而不是按「连接」
 *
 * 能力档判定必须落在**操作**上（`docs/devdata-plan.md` §3.1 不变量 1）。反例：把一个目标配成
 * 「只读档」，然后复用同一份凭证去做写操作——外层闸门看着很严，实际从旁边那条连接绕过去了。
 * 所以矩阵的键是 `引擎 × 动作`，每一项自己声明可逆性、危险度、以及需要哪个能力。
 *
 * ## 三条分类判据
 *
 * 1. **未登记的一律拒**（`UNCLASSIFIED_OPERATION`），不是「默认放行」。与 nyetdb 的做法一致：
 *    一个不认识的东西被放行，就是一条没被审过的路径。
 * 2. **`never` 是「不存在入口」，不是「拒绝执行」**。`FLUSHALL` / `EVAL` / 重置消费位点这类
 *    不可逆且影响他人的操作，在工具面**不注册**——有入口的白名单在那几条命令面前是装饰。
 * 3. **可逆性独立于读写**。`monitor` / `keys` 是**读**但危险（阻塞、抓全量流量、含他人数据），
 *    所以它们单独分档，不能跟着「读类一律放行」走。
 *
 * ## 各引擎的护栏**强度完全不同**，矩阵要说实话
 *
 * - SQL 档：库账号是**硬**护栏（只读账号挡得住绕过工具的人），代码侧矩阵是第二、三层；
 * - Redis 档：**没有只读账号这回事**，「受限」只能靠本矩阵，**没有第二层网**；
 * - 中间件档：观察面与操作面是两个独立能力，且操作面默认关。
 */

/** 支持的引擎。 */
export type Engine = 'sqlserver' | 'mysql' | 'postgres' | 'redis' | 'rocketmq' | 'dm'

/** 全部引擎（判据表与用例从这里取）。 */
export const ENGINES: readonly Engine[] = ['sqlserver', 'mysql', 'postgres', 'redis', 'rocketmq', 'dm']

/** 动作的类别：决定走哪条判据。 */
export type OperationClass =
  /** 只读且廉价：默认放行。 */
  | 'read'
  /** 只读但危险（阻塞 / 抓别人的数据 / 无界扫描）：需单独授权。 */
  | 'read-dangerous'
  /** 受限写：需授权，且要能说清改了什么。 */
  | 'write-scoped'
  /** 不可逆或影响他人：**不提供入口**。 */
  | 'never'

/** 一个操作的登记项。 */
export interface OperationSpec {
  /** 动作名（引擎内的稳定标识）。 */
  action: string
  /** 类别。 */
  kind: OperationClass
  /** 可逆性——独立于读写：`monitor` 是读但不可撤回（对方数据已进了你的上下文）。 */
  reversible: boolean
  /** 是否需要逐次二次确认（不可逆操作在共享环境里要）。 */
  requiresConfirm: boolean
  /**
   * 需要的宿主侧能力规格的**变量名**（`undefined` = 不需要能力）。
   *
   * 为什么是变量名而不是布尔「需要授权」：`kit` 的能力判定认环境变量名
   * （`capabilityGranted` / `capabilityHowTo`），写布尔就等于自创一套闸门——必然与
   * docker / tty 的口径漂开。写类操作**必须**带这个名字（见 `adjudicate` 的
   * `CAPABILITY_NOT_DECLARED` 分支）。
   */
  capabilityEnv?: string
  /** 给 agent 的一句话说明（工具描述会用到）。 */
  summary: string
}

/**
 * 档位严格度排序：**只用于「取更严的那一个」，不用于放行**。
 *
 * 为什么需要它：命令解析层（`redis-command.ts`）会按**参数**分档（`INFO ALL` 是危险读、
 * `INFO memory` 是普通读），而矩阵按**动作名**分档（`info` 是普通读）——两者会在同一个动作名上
 * 给出不同的档位。方向只有一个可接受：**按更严的判**。
 *
 * `never` 不进这个比较：它不是「更严的一档」，而是「不存在入口」，能走到比较这一步说明
 * 工具面已经漏了（由 `adjudicate` 的 `never` 判据单独拦）。
 */
export const CLASS_RANK: Record<OperationClass, number> = {
  read: 0,
  'read-dangerous': 1,
  'write-scoped': 2,
  never: 3,
}

/**
 * 取「矩阵档位」与「解析层档位」中更严的一个。
 *
 * 这是 `docs/devdata-plan.md` §3.1 不变量 1（能力按**操作**判，不按连接判）在参数级命令上的落地：
 * 只要解析层已经认定这条命令是危险读，**能力闸门就必须真的过一遍**——哪怕它映射到的动作名
 * （`info`）在矩阵里是普通读。少了这一步，「按参数分档」就只是一句注释。
 */
export function stricterClass(matrixKind: OperationClass, requested: OperationClass | undefined): OperationClass {
  if (requested === undefined) return matrixKind
  return CLASS_RANK[requested] > CLASS_RANK[matrixKind] ? requested : matrixKind
}

/** 一个引擎的矩阵。 */
export interface EngineMatrix {
  engine: Engine
  /** 受管操作：`action → 登记项`。未登记的一律拒。 */
  operations: Record<string, OperationSpec>
  /**
   * 明确不做（**不注册入口**）。键是动作名，值是人话理由。
   *
   * 与 `operations` 分开存的原因：`never` 项要能被单独的用例断言「工具面里不存在它」，
   * 混在 `operations` 里就变成「存在但被拒」——那是两回事。
   */
  never: Record<string, string>
}

/** 写类操作的默认确认要求：不可逆的一定要，可逆的看调用方。 */
const write = (action: string, summary: string, capabilityEnv: string, reversible = true): OperationSpec => ({
  action,
  kind: 'write-scoped',
  reversible,
  requiresConfirm: !reversible,
  capabilityEnv,
  summary,
})

const read = (action: string, summary: string): OperationSpec => ({
  action,
  kind: 'read',
  reversible: true,
  requiresConfirm: false,
  summary,
})

/**
 * 通用取值读：Redis 档把 `GET` / `MGET` / `HGETALL` / `LRANGE` 一类**只读取值**归到同一个动作名。
 *
 * 由解析层（P6）判定具体命令是否属于这一族——与 SQL 档用 `query` 承担全部只读语句是同一种
 * 收敛方式：矩阵管「允不允许」，解析层管「具体是哪条命令」。
 */
const readGet = (): OperationSpec => read('get', 'GET / MGET / HGETALL / LRANGE 等只读取值')

const readDangerous = (action: string, summary: string, capabilityEnv: string): OperationSpec => ({
  action,
  kind: 'read-dangerous',
  reversible: false,
  requiresConfirm: false,
  capabilityEnv,
  summary,
})

/** 能力变量名常量：与 docker / tty 同用一个 kit 判定，名字只有这一处。 */
export const CAP_ENV = {
  /** 受限写（Redis 档）：`DSH_DEVDATA_WRITE=1`。 */
  write: 'DSH_DEVDATA_WRITE',
  /** 危险读（`keys` / `monitor`）：`DSH_DEVDATA_DANGEROUS_READ=1`。 */
  dangerousRead: 'DSH_DEVDATA_DANGEROUS_READ',
  /** 中间件操作面（发送 / 建删 topic）：`DSH_DEVDATA_MQ_ADMIN=1`。 */
  mqAdmin: 'DSH_DEVDATA_MQ_ADMIN',
  /** 环境编排的起停（§13）：`DSH_DEVDATA_ENV_MUTATE=1`。 */
  envMutate: 'DSH_DEVDATA_ENV_MUTATE',
} as const

/**
 * 引擎的**入口形态**：agent 用哪种形状把一次操作说给内核。
 *
 * - `structured`（缺省）：一个动作一个工具（`schema` / `query` / `sample`…），参数是结构化的；
 * - `raw-command`：**命令原文**。今天只有 Redis。
 *
 * 为什么 Redis 必须是 `raw-command`（`docs/devdata-plan.md` §17.12）：矩阵的键是**动作名**，
 * 而 Redis 的档位由**命令参数**定（`INFO ALL` 是危险读、`INFO memory` 是普通读），且
 * 「命令 → 动作」的映射本身就是那道白名单。只给结构化入口，等于把「是哪条命令」交给调用方——
 * 它可以构造 `{ action: 'del', key }` 从白名单旁边绕进执行器；而让工具层「按结构化参数拼一条
 * 命令」则是造第二个命令构造器（审过的字符串与跑掉的字符串会分家）。
 *
 * 所以形态差异不是实现细节，而是**判据的一环**：`tool.ts` 的可见性要照它算。
 */
export type EntryShape = 'structured' | 'raw-command'

/** 取引擎的入口形态。 */
export function entryShapeFor(engine: Engine): EntryShape {
  return engine === 'redis' ? 'raw-command' : 'structured'
}

/**
 * 命令原文入口的工具名。
 *
 * 这条**不是矩阵动作名**（动作由解析层按命令算出），是本仓唯一一个「工具名 ≠ 动作名」的入口——
 * 登记在 `tool.ts` 的 `TOOL_SPECS` 里时旁边有说明。
 */
export const RAW_COMMAND_TOOL = 'redis_command'

/** SQL 三引擎共用同一张矩阵（题面差异只在驱动，不在判据）。 */
function sqlMatrix(engine: Engine): EngineMatrix {
  return {
    engine,
    operations: {
      list_targets: read('list_targets', '列出当前目录可达的连接'),
      search: read('search', '按列名 / 表名搜索（走 information_schema）'),
      schema: read('schema', '列出表 / 列 / 主键 / 索引 / 外键'),
      describe: read('describe', '单表结构 + 枚举值'),
      sample: read('sample', '取若干行样本（受行数上限约束）'),
      query: read('query', '执行只读语句（AST 分类 + 计划护栏 + 行数上限）'),
      explain: read('explain', '取执行计划与成本，不执行'),
    },
    /*
     * SQL 档的写操作**没有入口**：本套件的 SQL 档永久只读（plan §10）。
     * 「要改数据走各自运维流程」——所以这里不是「拒绝」，是「不注册」。
     */
    never: {
      insert: 'SQL 档永久只读；要改数据走各自运维流程',
      update: 'SQL 档永久只读；要改数据走各自运维流程',
      delete: 'SQL 档永久只读；要改数据走各自运维流程',
      ddl: 'SQL 档不做结构变更',
      multi_statement: '拒绝多语句：分号拼接是典型绕过',
    },
  }
}

/** 引擎矩阵表。 */
export const MATRICES: Record<Engine, EngineMatrix> = {
  sqlserver: sqlMatrix('sqlserver'),
  mysql: sqlMatrix('mysql'),
  postgres: sqlMatrix('postgres'),
  /*
   * 达梦（DM8）：与 SQL Server 同档——**专有驱动，没有可用的 Node 驱动**，因此只能走通路 B
   * （目标侧 `disql`）。矩阵与其余 SQL 引擎一致（永久只读），差别只在通路与输出解析。
   * 纳入较晚（2026-10-01 在 `161` 上发现 `dm8_test` 在跑），排在 SQL Server 之后。
   */
  dm: sqlMatrix('dm'),
  redis: {
    engine: 'redis',
    operations: {
      list_targets: read('list_targets', '列出当前目录可达的连接'),
      // 注意：`scan` 不是 `keys`——前者带游标与 COUNT 上限，后者阻塞且无界。
      search: read('search', 'SCAN + 模式匹配（带 COUNT 上限），**不是 KEYS**'),
      describe: read('describe', 'TYPE + TTL + 编码'),
      sample: read('sample', '取若干个 key 的取值'),
      info: read('info', 'INFO：连接数 / 内存 / 键空间概况'),
      get: readGet(),
      keys: readDangerous('keys', 'KEYS：阻塞且无界，单独授权后才可用', CAP_ENV.dangerousRead),
      monitor: readDangerous('monitor', 'MONITOR：抓全量流量，含他人数据，单独授权后才可用', CAP_ENV.dangerousRead),
      set: write('set', 'SET / HSET / LPUSH 等受限写', CAP_ENV.write),
      del: write('del', 'DEL / UNLINK 删除 key', CAP_ENV.write, false),
      expire: write('expire', 'EXPIRE / PERSIST 改 TTL', CAP_ENV.write),
    },
    /*
     * 这一档**没有第二层网**（Redis 没有只读账号），所以下列命令一律不给入口——
     * 有入口的白名单在它们面前是装饰。plan §3.4 / §10 已把这条写死。
     */
    never: {
      flushdb: 'FLUSHDB 清库，不可逆且影响他人',
      flushall: 'FLUSHALL 清库，不可逆且影响他人',
      evict: 'EVICT 不可逆',
      config_set: 'CONFIG SET 改服务端配置，影响所有人',
      script: 'SCRIPT 加载脚本，等于把代码执行权交出去',
      eval: 'EVAL 执行脚本，等于把代码执行权交出去，操作白名单在它面前是装饰',
      replicaof: 'REPLICAOF 改复制拓扑，影响整个实例',
      shutdown: 'SHUTDOWN 停服务',
    },
  },
  rocketmq: {
    engine: 'rocketmq',
    operations: {
      list_targets: read('list_targets', '列出当前目录可达的连接'),
      list_topics: read('list_topics', 'topic 列表'),
      list_groups: read('list_groups', '消费组列表'),
      lag: read('lag', '消费堆积量与 lag'),
      dlq_stats: read('dlq_stats', '死信统计'),
      trace: read('trace', '按 key 或 msgId 查消息轨迹'),
      sample: read('sample', '某 topic 的最近若干条'),
      send: write('send', '发送消息', CAP_ENV.mqAdmin, false),
      create_topic: write('create_topic', '创建 topic', CAP_ENV.mqAdmin, false),
      delete_topic: write('delete_topic', '删除 topic', CAP_ENV.mqAdmin, false),
    },
    /*
     * 观察面与操作面是**两个独立能力**（plan §3.5）：观察面默认开，操作面默认关。
     * 共享测试环境里，一个不可逆动作打到的不是你，是同事的联调。
     */
    never: {
      reset_offset: '重置消费位点会让共享环境里的同事丢消息，本套件不提供入口（要走运维流程）',
      delete_group: '删除消费组影响他人的联调',
    },
  },
}

/** 取某引擎的矩阵。 */
export function matrixFor(engine: Engine): EngineMatrix {
  return MATRICES[engine]
}

/**
 * 全部引擎的受管动作名（并集）。
 *
 * 存在的理由是一条**已经踩过的坑**：`tool.ts` 里原先手写了一份「引擎专属工具名」的清单，而
 * RocketMQ 的矩阵是后加的——那份清单（照抄 `TOOL_SPECS`）与 `TOOL_SPECS` 本身都漏了
 * `list_topics` / `lag` / `send` 这些动作，于是它们**在工具面上永远不可见**。之所以一直没被发现，
 * 是因为当时的用例只有单向断言（「可见面里的都在矩阵里」），没有反方向的
 * 「矩阵里的读动作都该可见」。2026-10-02 接宿主时补上那条反向用例，它当场就红了。
 *
 * 所以清单从矩阵**现算**：矩阵是单一真源，工具面不许再抄一份。反向那半由
 * `tool.test.ts` 的「每个受管读动作都可见」钉住。
 */
export function allManagedActions(): readonly string[] {
  return [...new Set(Object.values(MATRICES).flatMap((matrix) => Object.keys(matrix.operations)))]
}

/**
 * 查一个操作。
 *
 * 返回 `undefined` = **未登记**，调用方必须按 `UNCLASSIFIED_OPERATION` 拒绝，
 * **不得**回落到「默认放行」。这条是本模块存在的意义之一。
 */
export function lookupOperation(engine: Engine, action: string): OperationSpec | undefined {
  return MATRICES[engine].operations[action]
}

/**
 * 这个动作是否被明确排除（`never` 档）。
 *
 * `never` 的操作**不应该出现在工具面里**；但内核仍要能回答「它被排除了」——
 * 这样才能在一处断言「工具注册表 ∩ never = ∅」，而不是靠人记。
 */
export function isNeverOperation(engine: Engine, action: string): boolean {
  return Object.prototype.hasOwnProperty.call(MATRICES[engine].never, action)
}

/** 取某引擎的全部 `never` 动作名（用例与工具注册面检查用）。 */
export function neverActions(engine: Engine): string[] {
  return Object.keys(MATRICES[engine].never)
}

/** 取某引擎的全部受管动作名。 */
export function managedActions(engine: Engine): string[] {
  return Object.keys(MATRICES[engine].operations)
}
