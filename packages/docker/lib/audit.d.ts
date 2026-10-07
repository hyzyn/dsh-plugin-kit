/**
 * 能力使用审计（capability-use audit）：把「授权了」和「用了」接成闭环。
 *
 * ## 它解决什么
 *
 * 授权链已有完整审计（kit `elevation.ts` 的 begin / grant / expire / revoke / load 五行），但
 * **授权之后能力被用来干了什么**此前没有台账（README 已知限制自认的一条）。本模块给每一次
 * **过了能力闸**的变更 / exec 操作落一行结构化审计行，两条入口都覆盖：
 *   - `source=http`（面板路由，`/action`、`/images/remove` 等 8 条）；
 *   - `source=tool`（agent 工具 `docker_action` 等 5 个，走 DockerApi、不经 HTTP 路由，不会重复计数）。
 *
 * 行格式（对齐 kit elevation 审计行的 key=value 风格）：
 *
 *   [dsh-docker] capability-use: capability=allowMutations source=http action=container.remove target=web ref=shop-web-1 ok=true durationMs=123
 *
 * `capability` 刻意与能力开关同名（`allowMutations` / `allowExec`）：审计行必须能和 elevation 的
 * 授权行对上号，这是本模块的全部意义。
 *
 * ## 「使用 = 过了闸」的单一语义
 *
 *   - **403 拒绝不记**：请求被闸挡回，能力没有被使用（也没有 docker 侧的任何后果）；
 *     宿主侧授权状态的变化已由 elevation 五行覆盖。tier-gate 的 ask / deny 同样不记：
 *     ask 只是询问、没有执行（不是使用），deny 的放行与否由宿主的 approval 日志兜着。
 *   - **docker 报错也算一次使用**：`ok=false` + `detail=` 截断后的错误文案——「试过删一个容器
 *     失败了」与「删成功了」同样是审计要回答的问题。错误按原路径 rethrow，不改调用方的错误处理。
 *
 * ## 脱敏与截断（硬规矩，helper 统一做，不靠调用点自觉）
 *
 * 日志会落盘（宿主的启动失败报告会带上最近日志），所以：
 *   - exec 的 `command` 记进 `detail` 时**截断到 200 字符**（含 `…` 截断信号，与全仓「截断要有
 *     信号」同一取向）、**控制字符转义成 `\n` 等字面量**——保证「一行就是一次事件」，命令里的
 *     换行伪造不出第二行审计；错误文案同样处理。
 *   - 刻意**不转义空格**：`detail` 是自由文本区（永远在行尾，解析器按字段序取前段不受它干扰），
 *     `ref` 过了 assertRef / assertImageRef / assertName 白名单（无空格），`target` 是用户自己
 *     配置的目标名——可读性优先于机器可解析。
 *   - 与 elevation「nonce 绝不进日志」是同一类取舍的正面：这条**代价**（exec 命令截断 200 字符
 *     进日志）已写进插件 README 的已知限制。
 *
 * ## 出口为什么是 console 而不是 ctx.logger（docker D162）
 *
 * 真机验收（2026-10-07，DSH 0.2.1-alpha.1）实测：插件经 `ctx.logger.info` 打的行**既不出现在
 * 宿主 stdout、也找不到落盘文件**——能看到的 `[dsh-docker]` 行全部是 `console.log` 调用点
 * （mounted / config applied / agent tools registered / tier-gate；tier-gate 的日志出口默认就是
 * console，见 kit `tier-gate.ts`）。审计行走 ctx.logger 等于在真宿主上无处可查，而「出问题时翻
 * 得到」正是审计存在的意义。所以出口固定走 `console.log`（前缀里已带 `[dsh-docker]`），
 * **不做参数**：出口是本模块的取舍，不是调用方的选择。kit elevation 的授权行（begin / grant /
 * expire / revoke / load）走的仍是 ctx.logger，同一问题记在根 ROADMAP 待办——修好后两类行同通道。
 *
 * ## 为什么在 docker 包、不在 kit
 *
 * 按 conventions 的 L0/L1 边界判据（改一个包就能做完 → L1）：目前只有 docker 一个插件需要使用
 * 审计。**晋升条件**：当第二个插件（tty）也要接同一套「capability-use」行时，把本模块上提
 * `@hyzyn/dsh-kit`，并把日志前缀做成参数（对齐 elevation 的 `logPrefix`）——在那之前不要提前抽象。
 */
/** 审计行挂的能力开关名：与授权行（elevation load/grant）对得上号。 */
export type CapabilityName = 'allowMutations' | 'allowExec';
/** 使用入口：面板路由（http）｜agent 工具（tool）。 */
export type CapabilityUseSource = 'http' | 'tool';
/**
 * action 的**固定词表**：`<资源>.<动作>`（exec 自成一格）。新增变更操作时先来这里加词，
 * 再接调用点——审计行的消费方（人 + 日志检索）靠词表稳定。
 */
export type CapabilityUseAction = 'container.start' | 'container.stop' | 'container.restart' | 'container.remove' | 'image.remove' | 'image.prune' | 'image.pull' | 'network.remove' | 'network.prune' | 'volume.remove' | 'volume.prune' | 'exec';
/** 一次使用的基本字段（`audited` 的入参）。 */
export interface CapabilityUseFields {
    capability: CapabilityName;
    source: CapabilityUseSource;
    action: CapabilityUseAction;
    /** 目标名（docker 目标的配置名）。 */
    target: string;
    /** 容器名/ID、镜像引用、网络/卷名；prune 这类无目标的操作省略。 */
    ref?: string;
}
/** 一条完整审计行的字段（含结果侧）。 */
export interface CapabilityUseLine extends CapabilityUseFields {
    /** 操作本身成败：docker 报错也算一次使用（ok=false + detail）。 */
    ok?: boolean;
    /** 命令耗时（`audited` 计时；start 行没有）。 */
    durationMs?: number;
    /** 失败原因 / exec 退出码等补充（截断 + 转义）。 */
    detail?: string;
    /** 长流（pull 进度流）专用：开流 `start`、收尾 `end`——中途宿主挂掉时至少 start 行还在。 */
    event?: 'start' | 'end';
    /** end 行的收尾原因（与 SSE end 帧的 reason 同源）。 */
    reason?: string;
    /** end 行的 docker 退出码（被中止时为 null，省略）。 */
    code?: number | null;
}
/** 字符串值统一截断上限（exec 命令、错误文案；硬规矩见文件头）。 */
export declare const AUDIT_DETAIL_MAX_CHARS = 200;
/**
 * 统一的截断 + 转义：先按**原始字符数**截断（补 `…` 信号），再逐字符转义控制字符。
 * 单次遍历、不存在二次转义；空格刻意保留（取舍见文件头「脱敏与截断」）。
 */
export declare function sanitizeAuditValue(text: string, maxChars?: number): string;
/** 把一条使用审计行打到宿主 stdout（出口取舍见文件头「出口为什么是 console」，docker D162）。 */
export declare function auditCapabilityUse(fields: CapabilityUseLine): void;
/**
 * 包一层变更 / exec 调用：计时 → try/catch → 审计（成功与失败都记）→ 失败原样 rethrow。
 *
 * 只该放在**能力闸判定之后**（403 分支之后）——「使用 = 过了闸」。`detailOf` 可选：exec / pull
 * 这类「api 成功返回但带退出码」的操作用它组 detail——exec 记 `code=… cmd=…`（**命令会进日志**，
 * 这是写进 README 的代价），pull 只记退出码；整段 detail 的 200 截断与控制字符转义由 emit 时的
 * `sanitizeAuditValue` 统一做（单一出口，不在调用点各写一遍）。失败路径的 detail 是错误文案。
 */
export declare function audited<T>(fields: CapabilityUseFields, run: () => Promise<T>, detailOf?: (result: T) => string | undefined): Promise<T>;
