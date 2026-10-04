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
import { resolveCredentialVia } from '@hyzyn/dsh-kit';
/**
 * provider 的**来源层 id** → 保护强度。
 *
 * 为什么这几层都是 `none`：它们全在 agent 读得到的地方（同 uid 的环境变量 / 本机文件）。
 * `keychain` 那一档留着，是因为带上游 ACL 的 provider（macOS Keychain 一类）确实存在——
 * 它一旦出现，值就真的不只是「方便」。
 */
const BY_SOURCE = {
    env: { level: 'none', note: '继承来的环境变量：agent 与用户同 uid，读得到——方便，不是防护' },
    file: { level: 'none', note: '凭据存储文件（$DSH_HOME/.credentials.yaml）：同 uid 可读——方便，不是防护' },
    'project-env': { level: 'none', note: '项目里的 .env：同 uid 可读——方便，不是防护' },
    'user-env': { level: 'none', note: '用户 home 的 .env：同 uid 可读——方便，不是防护' },
    keychain: { level: 'strong', note: '系统钥匙串 / 带 ACL 的凭据服务：读写要过上游检查，agent 读不到' },
};
/** 把 provider 给的来源层翻成保护强度。**没给来源**也算一种答案：按不防护对待。 */
export function credentialProtection(source) {
    if (source === undefined) {
        return { level: 'unknown', note: 'provider 没给来源层：按「不防护」对待，别据此宣称安全性' };
    }
    const known = BY_SOURCE[source];
    if (known !== undefined)
        return known;
    return { level: 'unknown', note: `未登记的来源层 ${source}：按「不防护」对待（登记之后才敢说它防什么）` };
}
/**
 * 解析一个凭据引用（**每次都问 provider，不缓存**）。
 *
 * 失败**不抛**：调用方（判定层）要把它变成一条带码的拒绝，而不是一个异常栈——这条路径上的
 * 失败是常态（凭据没配、服务没装、值为空），每一种的下一步动作都不同。
 */
export async function resolveTargetCredential(input) {
    try {
        const resolved = await resolveCredentialVia(input.provider, input.ref);
        if (resolved === undefined) {
            return { ok: false, ref: input.ref, message: `引用 ${input.ref} 解析成了空——检查配置里的 credentialRef 是不是写漏了` };
        }
        if (resolved.via === 'literal') {
            // 判定层拒过明文，这里只是兜底：万一有别的调用点绕过判定层。
            return {
                ok: false,
                ref: input.ref,
                message: `${input.ref} 不是引用（没有 env: 前缀）——明文值连「不落配置文件」都没做到，请改成 env:NAME`,
            };
        }
        return { ok: true, ref: input.ref, value: resolved.value, protection: credentialProtection(resolved.source) };
    }
    catch (error) {
        return { ok: false, ref: input.ref, message: error instanceof Error ? error.message : String(error) };
    }
}
//# sourceMappingURL=credential.js.map