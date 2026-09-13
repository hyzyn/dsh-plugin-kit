/**
 * @hyzyn/dsh-kit — 通用「托管区块」读写。
 *
 * env.yml / cordis.patch.yml / prompts.yml 都采用同一模式：在一份用户可编辑的
 * 文件里用一对注释标记圈出插件自动生成的内容（托管区块），写回时只动区块、
 * 区块外逐字节保留。env / mcp / prompt 三个插件各有一份私有变体；本模块提供
 * 参数化标记的通用纯函数，供后续迁移与新插件使用（存量插件本次不迁移）。
 *
 * 与 mcp 的 spliceManagedBlock（packages/mcp/src/index.ts:224-238）的兼容点：
 *   - 无区块时追加到文件末尾、并在前面留一个空行；
 *   - 收尾标记缺失（悬空起始标记）时只重写起始标记行本身，不吞掉标记之后的
 *     内容——旧行为会连带删掉后续所有内容；
 *   - 区块整体替换时保留区块外内容逐字节不变。
 * 有意差异（更稳）：
 *   - 标记行按「trimEnd 后整行相等」匹配，而非子串匹配。子串匹配会把 body 里
 *     恰好包含标记文本的行误判为边界，整行匹配才能同时兼容 \r 与行尾空格；
 *   - 空文件（或纯空白文件）第一次写入时不会留下一个多余的前导空行；
 *   - 替换已有区块不追加尾部空行（mcp 把整块当字符串拼接，重复写入会在块尾
 *     每次多留一个空行；本实现按行替换，同样输入的重复写入逐字节稳定）；
 *   - body 为空串 = 删除区块（含标记），对应 mcp 里「空 rows」语义的显式化
 *     （mcp 用 `- insert: []` 占位，那是 patch 文件的特殊要求，不是通用需求）。
 */
import { writeFileSync, renameSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
/** 在行数组里找起始标记行下标；找不到返回 -1。 */
function findBegin(lines, beginMarker) {
    return lines.findIndex((line) => line.trimEnd() === beginMarker);
}
/** 在起始标记之后找结束标记行下标；找不到返回 -1。 */
function findEnd(lines, start, endMarker) {
    return lines.findIndex((line, index) => index > start && line.trimEnd() === endMarker);
}
/**
 * 渲染含标记行的区块（行数组，不含尾部空串——就地替换时不引入额外空行，
 * 追加写入时由调用方在末尾补一个换行）。
 */
function renderBlockLines(markers, body) {
    // 正文末尾的换行是调用方的排版选择，统一剥掉，避免标记行前多出空行。
    const normalized = body.replace(/\n+$/, '');
    return [markers.beginMarker, ...normalized.split('\n'), markers.endMarker];
}
/**
 * 纯函数：把托管区块（含首尾标记行）拼进文本，返回新文本。
 *
 * - 已有完整区块：整体替换为「标记 + body + 标记」，区块外内容不动；
 * - 无起始标记：追加到文件末尾（非空文件前留一个空行）；
 * - 起始标记存在但缺结束标记（文件损坏 / 手改）：只替换起始标记行，保留其后
 *   所有内容，避免误删用户数据；
 * - body 为空串：删除整个区块（含标记），同样只动标记之间的范围。
 */
export function spliceManagedBlock(text, options) {
    const { beginMarker, endMarker, body } = options;
    const lines = text.split('\n');
    const start = findBegin(lines, beginMarker);
    const end = start === -1 ? -1 : findEnd(lines, start, endMarker);
    // 没有起始标记：body 为空时无事可做，否则追加新区块。
    if (start === -1) {
        if (body === '')
            return text;
        const head = text.replace(/\s*$/, '');
        const block = renderBlockLines(options, body).join('\n') + '\n';
        return head === '' ? block : head + '\n\n' + block;
    }
    // 删除：去掉 [start, end]；悬空标记只去掉起始标记行。
    if (body === '') {
        return end === -1
            ? [...lines.slice(0, start), ...lines.slice(start + 1)].join('\n')
            : [...lines.slice(0, start), ...lines.slice(end + 1)].join('\n');
    }
    const blockLines = renderBlockLines(options, body);
    // 悬空起始标记：只重写标记行本身，其后内容原样保留（与 mcp 行为一致）。
    return end === -1
        ? [...lines.slice(0, start), ...blockLines, ...lines.slice(start + 1)].join('\n')
        : [...lines.slice(0, start), ...blockLines, ...lines.slice(end + 1)].join('\n');
}
/**
 * 读取标记之间的区块正文（不含标记行本身）。
 * 无起始标记或缺少结束标记都返回 undefined——后者说明文件被手改坏 / 写坏了，
 * 调用方应报错而不是拿半截内容当合法结果（env / mcp 的 readManaged* 同此语义）。
 */
export function readManagedBlock(text, markers) {
    const lines = text.split('\n');
    const start = findBegin(lines, markers.beginMarker);
    if (start === -1)
        return undefined;
    const end = findEnd(lines, start, markers.endMarker);
    if (end === -1)
        return undefined;
    return { body: lines.slice(start + 1, end).join('\n') };
}
/**
 * 原子写入文件：先写同目录临时文件再 rename 覆盖。
 *
 * 为什么必须 rename：直接 writeFileSync 到目标路径时，「截断 → 写入」期间另一
 * 个读者（DSH 的配置 watch / 另一个插件实例）会看到半截内容甚至空文件；rename
 * 在 POSIX 上是原子的，读者要么看到旧全文、要么看到新全文。临时文件必须与目标
 * 同目录（跨文件系统的 rename 会退化成复制，失去原子性）。
 *
 * mode 默认 0600（配置文件常含密钥）；writeFileSync 的 mode 只会被 umask 进
 * 一步收紧、不会放宽，所以最终权限不会比 mode 更宽。
 */
export function writeFileAtomic(file, data, mode = 0o600) {
    const tmp = join(dirname(file), '.' + basename(file) + '.' + process.pid + '.tmp');
    writeFileSync(tmp, data, { mode });
    renameSync(tmp, file);
}
//# sourceMappingURL=managed-block.js.map