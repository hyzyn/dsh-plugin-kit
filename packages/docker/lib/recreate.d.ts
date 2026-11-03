/**
 * @hyzyn/dsh-docker — 「现场还原」：从 inspect 的原始 JSON 反推等价 `docker run`（纯函数，零 IO）。
 *
 * 为什么是独立模块、而且**不扩 `ContainerDetail`**：还原需要 env / binds / hostConfig，
 * 而 `ContainerDetail` 是「面板详情页显示什么」的契约——把 env 塞进去会顺带把
 * **凭证原值**灌进 `docker_inspect` 的模型上下文。所以这条能力只吃原始 inspect 行，
 * 产出也是纯文本；`ContainerDetail` 一个字都不动。
 *
 * **取向：宁可不还原，也不静默丢**。凡是本模块故意没还原的东西（`--privileged`、
 * 匿名卷、自定义 entrypoint、健康检查…）都会进 `omitted` 点名，让人知道「这条命令
 * 和原容器还不完全等价」。同样地，env 原值**原样保留**（否则命令直接不可用），但命中
 * 敏感键名的会进 `secretKeys`，由调用方在界面上警告——**不改写值**（改写了就不是
 * 等价命令了，而复制粘贴的人会以为那是真值）。
 */
/** 还原结果（HTTP 契约 / agent 工具共用；字段顺序即渲染顺序）。 */
export interface RecreateResult {
    id: string;
    name: string;
    /** 多行 `docker run` 命令（每参数一段、行尾 `\`），可直接复制粘贴。 */
    command: string;
    /** 使用这条命令前必须知道的事（Compose 近似、凭证、网络要先存在）。 */
    warnings: string[];
    /** 名字看起来像凭证的环境变量键（**值不在其中、也不被改写**）。 */
    secretKeys: string[];
    /** 故意没还原的东西（含原因 / 建议怎么补），一条一句。 */
    omitted: string[];
}
/**
 * 一个参数按 POSIX 规则转义：安全字符原样、其余用单引号包住（`'` → `'\''`），空值给 `''`。
 *
 * 刻意**不**无脑全加单引号：`--name 'shop-web-1'` 读起来噪音很大，而这一行是给人看、
 * 给人复制的。判据取「不需要转义的字符集」——凡不在其中就进引号，行为仍然安全。
 */
export declare function shellArg(value: string): string;
/**
 * 把若干参数拼成多行命令：第一段（`docker run -d`）单独一行，其余每参数一行、行尾 `\`。
 *
 * 为什么一行一个参数：环境变量、端口、卷里经常夹着很长的串，挤在一行既读不出结构，
 * 复制到终端后也不好判断哪段属于哪个参数。
 */
export declare function joinCommand(parts: readonly string[]): string;
/**
 * 从 `docker inspect` 的**单条**原始 JSON 行反推等价 `docker run`。
 *
 * 参数顺序与 `docs`/契约一致：`-d` → `--name` → `--restart` → 端口 → 挂载 → 网络 →
 * `-e` → `--user/--workdir/--hostname` → 资源 → 能力/设备 → 镜像与命令。
 * （ENTRYPOINT 一档刻意留空，原因见 `omittedArgs`。）
 */
export declare function buildRunCommand(rawInspectRow: unknown): RecreateResult;
