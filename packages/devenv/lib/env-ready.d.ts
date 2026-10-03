/**
 * 环境编排的**就绪判据**（`docs/devdata-plan.md` §13.2）。
 *
 * > **归属（2026-10-02）**：本文件从 `packages/devdata/src/env-ready.ts` **原样迁来**
 * > （plan §16.1 的第 2 步，与建包同一步）。迁的原因是判据只有一条：**清单与求值跟着「它判的
 * > 对象」走**——就绪判的是容器/探针的**状态**，不是数据的内容，所以它归 `devenv`。
 * > 内容未改，只改了这一段归属说明与两处指路的注释。
 *
 * ## 这一层解决什么
 *
 * `env_wait` 最难的不是等待，是**知道在等什么**。没有声明式判据，它只能猜——而猜错的方向是
 * 「以为起来了，其实还在热启动」，接下去跑测试得到一串**假阴性**，人再去查一圈，最后发现问题
 * 不在代码上。本仓自己踩过这个坑的反面（`jenkins-release` 技能 §3.1 记录了那条判据）。
 *
 * ## 一条硬判据：**两个证据缺一不可**
 *
 * 「容器在跑」与「服务就绪」是两件事：
 *
 * 1. **`StartedAt` 必须落在可判的位置**——容器可能刚起、可能反复重启；
 * 2. **启动完成行必须出现，且必须晚于本次 `StartedAt`**。
 *
 * 第 2 条里「晚于本次」是关键：容器重启后日志缓冲区里**还留着上一个进程的启动完成行**，
 * 只看「有没有这一行」会在重启的那一瞬间判成就绪——而那正是最不该放行的一刻。
 *
 * ## 三种状态，不是为了好看
 *
 * | 判定 | 含义 | 该做什么 |
 * |---|---|---|
 * | `ready` | 全部证据到齐且都成立 | 继续 |
 * | `unready` | 证据不足 / 还没到 | **继续等**（这是等待的常态） |
 * | `refuted` | 已有证据**明确否证**（容器退出了、健康检查是 unhealthy） | **别等了**——等下去不会有结果 |
 *
 * 把 `refuted` 混进 `unready` 的代价是：容器崩了还要等满超时（冷启动可配 150 秒），
 * 而 agent 拿到的是「超时」——它多半会**再等一次**。
 *
 * ## 与 §3.9 断言库的关系
 *
 * 两者同构（项目内文本清单 + DSH 侧只读 + 缺省即无），但**归属不同包**：就绪清单是环境面，
 * 断言库是数据面（plan §16）。所以这里不共用 `verify/` 的目录约定——加载器由调用方给路径。
 *
 * 依据：`docs/devdata-plan.md` §13.2、`jenkins-release` 技能 §3.1 / §4。
 */
/** 就绪维度：三类判据。**必须显式声明一种**，不做推断。 */
export type ReadyDimension = 'logPattern' | 'httpProbe' | 'healthcheck';
/** 全部就绪维度。 */
export declare const READY_DIMENSIONS: readonly ReadyDimension[];
/** 就绪条件的联合类型——恰好给出其中一种。 */
export type ReadyCheck = 
/** 日志出现某行（如 Spring Boot 的 `Started .*Application in`）。 */
{
    kind: 'logPattern';
    pattern: string;
}
/** HTTP 探针：路径 + 端口。 */
 | {
    kind: 'httpProbe';
    path: string;
    port: number;
}
/** 容器健康检查转为 healthy。 */
 | {
    kind: 'healthcheck';
};
/** 一个服务的要求。 */
export interface ServiceRequirement {
    /** compose 服务名 / 容器名。 */
    name: string;
    /** 就绪判据（**不给 = 只要求容器在跑**，用于「起个 redis 就完事」这类服务）。 */
    ready?: ReadyCheck;
    /** 超时（毫秒）。缺省取调用侧的默认值；冷启动可单独放宽。 */
    timeoutMs?: number;
    /** 已知噪声说明（照 `jenkins-release` 技能 §4 的口径写）。 */
    note?: string;
}
/** 一份就绪清单。 */
export interface ReadyProfile {
    version: number;
    /** 项目名（由文件名推出，不在清单里写第二遍）。 */
    project: string;
    services: readonly ServiceRequirement[];
    /** 整份清单的备注（如「冷启动 150 秒」）。 */
    note?: string;
}
/** 清单加载结果。与断言库同构：三种「读不到」分开。 */
export type ProfileLoad = {
    kind: 'no-profile';
    project: string;
} | {
    kind: 'unreadable';
    project: string;
    message: string;
} | {
    kind: 'config-error';
    project: string;
    errors: readonly ProfileConfigError[];
} | {
    kind: 'ok';
    profile: ReadyProfile;
};
/** 一条配置错误。`path` 指到具体字段。 */
export interface ProfileConfigError {
    path: string;
    message: string;
}
/**
 * 校验一份已解析的就绪清单。
 *
 * 一次报全部错误（清单是给人改的）。**就绪判据必须在加载时定死**：留到运行时才发现「这一项
 * 既没给 logPattern 也没给 healthcheck」，就只能在等待中途报错——而调用方已经在计时了。
 */
export declare function validateProfile(project: string, data: unknown): {
    ok: true;
    profile: ReadyProfile;
} | {
    ok: false;
    errors: ProfileConfigError[];
};
/** 清单的文件名（唯一一处）：`<project>.ready.yaml`。 */
export declare function profileFileName(project: string): string;
/**
 * 从一批已列好的文件名里挑出就绪清单。
 *
 * 与断言库同构（应对 §3.9 的「共用加载与校验逻辑」），但目录约定由调用方定——
 * 就绪清单是**环境面**，**已随 `devenv` 一起搬走**（2026-10-02，plan §16.1 第 2 步；
 * 当时这里写的「会随 devenv 包一起搬走」就是这一步），不该在这里钉死一个属于数据面的路径。
 */
export declare function profilesIn(files: readonly string[]): Map<string, string>;
/** 人类可读的时长（报告里用，别让人去数毫秒）。 */
export declare function formatDuration(ms: number): string;
