/**
 * 拒绝的码与文案（`docs/devdata-plan.md` §13 的写入口）。
 *
 * ## 为什么拒绝也要一个模块
 *
 * 本套件的失败姿态是「**拒绝要带恢复路径**」：agent 的失败模式是**原地重试**，一句「未授权」不产生
 * 新信息，它会拿同一句话再试一次。所以每条拒绝都是 `[CODE] 正文` + 下一行「恢复路径：…」，而
 * `CODE` 是**稳定标识**（文案会改，码不会）——它同时是给人和给测试的锚点。
 *
 * 与 `devdata` 保持同一套格式与同一批码名（`[OUT_OF_SCOPE]` / `[CAPABILITY_NOT_GRANTED]` /
 * `[CONFIRMATION_REQUIRED]`）：这些码是 agent 看到的**跨插件契约**，两个包各起一个名字会让
 * 「撞到拒绝之后该做什么」这件事变得看运气。多出来的只有本包自己的 `WRITE_NOT_CONFIGURED`
 * （那个目标没配写能力闸门——与「配了但没授权」是两件不同的事，恢复路径也不同）。
 */
/** 稳定码（改文案不改码）。 */
export const REJECTION_CODES = {
    /** 当前目录不在目标的作用域内（缺省拒绝）。 */
    OUT_OF_SCOPE: 'OUT_OF_SCOPE',
    /** 这个目标**没配**写能力闸门（与「配了没授权」不同：前者要在配置里加一行）。 */
    WRITE_NOT_CONFIGURED: 'WRITE_NOT_CONFIGURED',
    /** 配了闸门但宿主没授权（要改启动环境并重启宿主）。 */
    CAPABILITY_NOT_GRANTED: 'CAPABILITY_NOT_GRANTED',
    /** 不可逆 / 影响他人的操作要**逐次**二次确认。 */
    CONFIRMATION_REQUIRED: 'CONFIRMATION_REQUIRED',
    /** 该动作在本包**没有入口**（例如删容器、`compose down -v`）。 */
    OPERATION_FORBIDDEN: 'OPERATION_FORBIDDEN',
};
/** 拒绝对象转成给 agent 的一段话（与 `devdata` 逐字同形）。 */
export function denialMessage(rejection) {
    const head = `[${rejection.code}] ${rejection.message}`;
    return rejection.hint === undefined ? head : `${head}\n恢复路径：${rejection.hint}`;
}
/** 抛一条拒绝（宿主半体的统一出口）。 */
export function throwDenial(rejection) {
    throw new Error(denialMessage(rejection));
}
/** 作用域外的拒绝（判据用的目录与允许的目录都要说清：cwd 缺省取宿主进程的工作目录，最容易错）。 */
export function outOfScope(targetId, scopeDirs, cwd) {
    const allowed = scopeDirs.length === 0
        ? `目标 ${targetId} 的作用域是**空**的（= 处处拒绝，fail closed），要在配置里显式声明目录`
        : `目标 ${targetId} 只允许：${scopeDirs.join(' / ')}`;
    return {
        code: REJECTION_CODES.OUT_OF_SCOPE,
        message: `当前目录 ${cwd} 不在它的允许目录内——${allowed}。`,
        hint: 'cwd 参数**缺省取宿主进程的工作目录**（不是你会话所在的项目目录）：显式传一个允许目录下的路径即可',
    };
}
//# sourceMappingURL=rejection.js.map