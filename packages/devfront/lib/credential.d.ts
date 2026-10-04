/**
 * `devfront` 的**凭据使用面**：把一个 `env:NAME` 引用解析成值，并如实标出「这道防线有多硬」。
 *
 * ## 它解决的那个洞
 *
 * `WebTarget.credentialRef` 从 2026-10-02 起就在配置里、在卡片上，**但没有任何消费者**——
 * 于是「登录后才有的页面」只能靠人手：要么把口令贴进对话（进会话记录），要么放弃这一类页面。
 * 本模块是它的另一半：`site_fill` 可以填一个**引用**而不是一个值。
 *
 * ## 三条判据（照 plan §3.7-1 / §15.3）
 *
 * 1. **只认引用，不认明文**：`env:NAME` 之外一律拒（判定层做，见 `page.ts` 的 `CREDENTIAL_REF_INVALID`）。
 *    理由不是洁癖：明文一旦进了工具参数，它就会同时进会话记录、审计行与日志——那正是引用要防的事；
 * 2. **只认目标**声明过**的那一个引用**（`WebTarget.credentialRef`）。agent 能取到的凭据集合 =
 *    维护者在 profile 里写下的那一个——「能读任意环境变量」与「能读这一个」是两回事，
 *    而工具面里没有前者；
 * 3. **每次操作重新解析**（provider 自己的契约，`kit` 的 `credentials.ts` 也不缓存）：改完凭据
 *    下一个动作即生效，不必重启宿主。
 *
 * ## 保护强度：不许把「方便」说成「防护」
 *
 * `resolve` 回的 `source` 是**值实际来自哪一层**（本地 provider 用 `env` / `file` / `project-env` /
 * `user-env`），本模块把它翻成一句人话。**关键事实：agent 与用户同 uid**——环境变量、本机文件它
 * 都读得到。所以今天这几层**全是「方便，不是防护」**，工具输出与审计行也照这个说法写。
 *
 * > 与 `devdata` 的 `credential.ts` 的关系：那一份是「**计划里打算用哪种方式取**」
 * > （process-env / file / command / keychain / remote），本模块是「**这次值实际来自哪一层**」。
 * > 两条轴，不是一份事实的两个副本；合并要等出现第三个消费者（记在根 ROADMAP 第 11 项）。
 */
import { type CredentialResolver } from '@hyzyn/dsh-kit';
/** 保护强度。`unknown` 是**如实**的一档：不知道就说不知道，且按「不防护」对待。 */
export type ProtectionLevel = 'none' | 'weak' | 'strong' | 'unknown';
/** 一次保护强度判定：档位 + 一句必须说清「防不防」的话。 */
export interface Protection {
    level: ProtectionLevel;
    note: string;
}
/** 把 provider 给的来源层翻成保护强度。**没给来源**也算一种答案：按不防护对待。 */
export declare function credentialProtection(source: string | undefined): Protection;
/** 解析结果：成功给值 + 强度；失败给一句**不含值**的话。 */
export type CredentialOutcome = {
    ok: true;
    ref: string;
    value: string;
    protection: Protection;
} | {
    ok: false;
    ref: string;
    message: string;
};
/**
 * 解析一个凭据引用（**每次都问 provider，不缓存**）。
 *
 * 失败**不抛**：调用方（判定层）要把它变成一条带码的拒绝，而不是一个异常栈——这条路径上的
 * 失败是常态（凭据没配、服务没装、值为空），每一种的下一步动作都不同。
 */
export declare function resolveTargetCredential(input: {
    provider: CredentialResolver | null;
    ref: string;
}): Promise<CredentialOutcome>;
