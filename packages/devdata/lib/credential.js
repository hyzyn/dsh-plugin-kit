/**
 * 凭证来源的**保护强度**——不把「方便」说成「防护」。
 *
 * ## 起因（这一条修正了 plan §1 原本的说法）
 *
 * plan 原本写「凭证走 `resolveSecret` 就够了」。**这句话是错的**：`resolveSecret` 解决的是
 * **不落明文进配置文件**，不是「agent 拿不到」。
 *
 * 关键事实：**agent 与用户同 uid**——环境变量、本机文件、`op read` 这类命令，它都能读到。
 * 所以 `{ env = "DB_PASS" }` 是**方便，不是防护**。只有会检查「谁在问」的来源
 * （macOS Keychain 那种带上游 ACL 的，或专门的凭据代理）才算防护。
 *
 * ## 与本仓既有机制的关系
 *
 * `kit` 的 `capability.ts` 已经为**能力授权**区分了「启动环境快照」与「带外确认」两条通道，
 * 并明确写了「`.env` / `env.yml` 有 HTTP 写入路径，拿它们当授权等于没闸门」。本模块把同一
 * 判断力用在**凭证**上，并把它做成可断言的数据（而不是散在注释里）。
 */
const SOURCES = {
    'process-env': {
        level: 'none',
        note: '环境变量：agent 与用户同 uid，读得到——方便，不是防护',
    },
    file: {
        level: 'none',
        note: '本机文件：agent 读得到——方便，不是防护',
    },
    command: {
        level: 'weak',
        note: '命令取回（如 op read）：agent 也能执行同一条命令，因此不比环境变量更保护',
    },
    keychain: {
        level: 'strong',
        note: '钥匙串 / 凭据存储：读写要过上游 ACL，agent 读不到',
    },
    remote: {
        level: 'weak',
        note: '目标侧的配置：agent 若已能登录该目标，同样读得到',
    },
};
/** 取凭证来源的属性面。 */
export function credentialSource(kind) {
    return { kind, ...SOURCES[kind] };
}
/** 全部来源（用例与界面从这里取）。 */
export const CREDENTIAL_SOURCES = Object.keys(SOURCES).map((kind) => credentialSource(kind));
/**
 * 这个来源算不算「防护」。
 *
 * **只有 `strong` 算。** 界面与快照必须用这个函数决定怎么展示——把 `none` 展示成「已配置」
 * 就是在对外宣称一个不成立的安全性质（本仓 `capability-elevation-plan.md` §0 记过同类教训：
 * 把文件通道写成能拦本机同用户进程，是错的）。
 */
export function isProtective(spec) {
    const level = typeof spec === 'string' ? credentialSource(spec).level : spec.level;
    return level === 'strong';
}
/**
 * 目标里声明的凭证引用解析成来源。
 *
 * 形态与 `kit` / `tty` 的 `env:NAME` 口径一致（那是本仓既有的引用写法），额外认
 * `keychain:` 与 `command:`。**认不出来的一律按 `file` 处理**（fail closed 的方向是
 * 「假设它不防护」而不是「假设它防护」）。
 */
export function parseCredentialRef(ref) {
    if (typeof ref !== 'string')
        return undefined;
    const trimmed = ref.trim();
    if (trimmed === '')
        return undefined;
    if (trimmed.startsWith('env:'))
        return credentialSource('process-env');
    if (trimmed.startsWith('keychain:'))
        return credentialSource('keychain');
    if (trimmed.startsWith('command:'))
        return credentialSource('command');
    if (trimmed.startsWith('remote:'))
        return credentialSource('remote');
    return credentialSource('file');
}
//# sourceMappingURL=credential.js.map