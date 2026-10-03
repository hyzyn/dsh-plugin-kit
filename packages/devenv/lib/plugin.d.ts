import z from '@deepseek-ai/schemastery';
import type { Context } from '@deepseek-ai/cordis';
/** 插件配置的**类型**（与下面的 `const Config` 同名并存：类型空间与值空间都要）。 */
export interface Config {
    enabled?: boolean;
    announceToAgent?: boolean;
    execTimeoutMs?: number;
    logTail?: number;
    probeTimeoutMs?: number;
    waitTimeoutMs?: number;
    pollIntervalMs?: number;
    stopTimeoutSec?: number;
    targets?: Array<{
        id?: string;
        label?: string;
        kind?: string;
        book?: string;
        scopeDirs?: string[];
        writeCapability?: {
            env?: string;
            label?: string;
        };
    }>;
    hostKeys?: Array<{
        host?: string;
        port?: number;
        fingerprints?: string[];
    }>;
}
/**
 * 插件配置的 schema。
 *
 * **字段全部 `.volatile()`**：那声明的语义是「可以热写，**插件自己订阅 `loader/volatile-update`
 * 重读**」。本插件在 `apply` 里订阅并重算——不订阅的话，配置页上改目标会「写盘成功、静默不生效」，
 * 而那份声明就是假的（`devfront` 记过这条教训）。
 *
 * **数值字段刻意不给 schema 默认值**：`z.natural().default(0)` 会让「没写」与「写了 0」在
 * `plainConfig` 之后变成同一个值，而夹取与缺省只该有一处（`plugin-config.ts` 的 `clampInt`）。
 */
export declare const Config: z;
/**
 * 工具面公告（插进 `systemPrompt` 的那一段）。
 *
 * 说的是「这个插件能做什么、入口叫什么」，**不是目标清单**（那份嵌在工具描述里，会随配置重注册）。
 * 写清入口名是给 agent 省事：它不必先猜哪个工具是环境面的。
 */
export declare const DEVENV_GUIDANCE: string;
export declare const name: string, inject: string[] | undefined, apply: (ctx: Context, config?: Config | undefined) => void;
