/**
 * @hyzyn/dsh-docker — DSH Web GUI 的 Docker 容器面板（host 半体）。
 *
 * 与 dsh-tty 的关系（方案 A：独立插件，tty 零改动）：
 *   - **连接簿**：只读复用 tty 的 settings 命名空间（`ctx.settings.get('tty')`
 *     的 `sshHosts`）。tty 未安装时退化为「只支持本机 / 内联 SSH 字段」。
 *   - **主机指纹**：本插件自持一份 `hostKeys`（TOFU），并优先读取 tty 已记录
 *     的指纹作为种子，避免同一主机在两处重复确认。
 *   - **执行通道**：自持池化 SSH exec（src/ssh-exec.ts），与 tty 的 PTY 会话
 *     完全独立；本机目标直接 spawn docker CLI。
 *
 * 信任模型（与 tty 不同，必须强调）：
 *   docker socket ≈ 该主机的 root 权限。因此**默认只读**：
 *   `allowMutations` 未开启时 start/stop/restart/remove 一律拒绝，
 *   `allowExec` 未开启时 `docker exec` 一律拒绝；两个开关都需用户在设置卡片
 *   显式打开。agent 工具同样受这两个开关约束（未开启时连工具都不注册）。
 */
import type { Context } from '@deepseek-ai/cordis';
import { DockerApi, assertBin, parseInspectJson, parsePsJson, parseStatsJson } from './docker.js';
import type { DockerTarget, ResolvedTarget } from './docker.js';
import type { HostKeyRecord, SshSpec } from './ssh-exec.js';
export type { HostKeyRecord } from './ssh-exec.js';
export type { ContainerSummary, ContainerDetail, ContainerStats, ImageSummary, DockerTarget } from './docker.js';
export interface Config {
    /** 关闭整个插件。默认开。 */
    enabled?: boolean;
    /** 是否向 agent 注入插件能力公告。默认开。 */
    announceToAgent?: boolean;
    /** docker CLI 可执行文件名 / 路径（podman 可填 podman）。默认 docker。 */
    dockerBin?: string;
    /** 允许 start/stop/restart/remove（含对应 agent 工具）。默认关。 */
    allowMutations?: boolean;
    /** 允许一次性 docker exec（含对应 agent 工具）。默认关。 */
    allowExec?: boolean;
    /** exec 默认超时秒数（1~120）。默认 30。 */
    execTimeoutSec?: number;
    /** 面板统计刷新间隔秒数（1~60）。默认 5。 */
    pollIntervalSec?: number;
    /** 日志默认尾部行数（1~5000）。默认 200。 */
    logTailDefault?: number;
    /** 单次命令输出上限（KB，1~8192）。默认 512。 */
    maxOutputKb?: number;
    /** 目标列表（本机 / SSH）。 */
    targets?: DockerTarget[];
    /** SSH 主机指纹记录（TOFU，随 settings 落盘）。 */
    hostKeys?: HostKeyRecord[];
}
/** 解析后的运行期配置（settings 与 composition 两条来源统一到这一形状）。 */
interface LiveConfig {
    enabled: boolean;
    announceToAgent: boolean;
    dockerBin: string;
    allowMutations: boolean;
    allowExec: boolean;
    execTimeoutSec: number;
    pollIntervalSec: number;
    logTailDefault: number;
    maxOutputKb: number;
    targets: DockerTarget[];
    hostKeys: HostKeyRecord[];
}
/** 清洗一份 targets 输入（settings 存储 / 热更新路径共用）。 */
export declare function sanitizeTargets(input: unknown): DockerTarget[] | undefined;
/** 清洗一份 hostKeys 输入。 */
export declare function sanitizeHostKeys(input: unknown): HostKeyRecord[] | undefined;
/**
 * 合并凭证：配置卡片从不回显密码 / 口令（只回 passwordSet），因此浏览器提交的
 * targets 里往往**没有** password/passphrase 字段。按目标名把已有值补回来，
 * 避免「改个名字就把密码清了」。（显式传空字符串仍然按清空处理。）
 */
export declare function mergeTargetSecrets(prev: DockerTarget[], incoming: unknown): unknown;
/** 把一份任意来源的配置归一成 LiveConfig。 */
export declare function normalizeConfig(section: Record<string, unknown>): LiveConfig;
/** 把一个配置目标解析成可连接的规格（连接簿查找在此完成）。 */
export declare function resolveTarget(target: DockerTarget, books: Map<string, SshSpec>): {
    resolved?: ResolvedTarget;
    error?: string;
};
export declare const name: string, inject: string[] | undefined, apply: (ctx: Context, config?: Config | undefined) => void;
export { parsePsJson, parseStatsJson, parseInspectJson, assertBin, DockerApi };
export type { Runner } from './docker.js';
