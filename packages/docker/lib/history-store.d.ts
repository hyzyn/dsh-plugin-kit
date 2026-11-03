import type { DiagnosisSample } from './history.js';
/** 覆写历史目录的环境变量（**测试 / 排障专用**）。 */
export declare const HISTORY_DIR_ENV = "DSH_DOCKER_HISTORY_DIR";
/** 本插件在 DSH 主目录下的数据目录名（与 `dsh-kit` 同级，按拥有者包名收进一级子目录）。 */
export declare const HISTORY_DIR_NAME = "dsh-docker";
/** 历史文件名。 */
export declare const HISTORY_FILE_NAME = "diagnosis-history.jsonl";
/** 行格式版本：读到不认识的 `v` 跳过该行（不抛、不清空）。 */
export declare const HISTORY_SCHEMA_VERSION = 1;
export interface DiagnosisHistoryPaths {
    /** 数据目录（`<DSH home>/dsh-docker`，或 `DSH_DOCKER_HISTORY_DIR` 的值）。 */
    dir: string;
    /** 历史文件（`<dir>/diagnosis-history.jsonl`）。 */
    file: string;
}
/** 拼出历史落盘布局。**路径只在这里拼一次**。 */
export declare function diagnosisHistoryPaths(dshHomeDir: string): DiagnosisHistoryPaths;
/** 一行历史（JSONL 的一行）。`target` / `container` / `id` 是**索引键**，不是业务数据。 */
export interface DiagnosisHistoryRecord {
    v: number;
    target: string;
    container: string;
    id: string;
    sample: DiagnosisSample;
}
/**
 * 诊断历史存储。**构造不碰磁盘**（第一次 `append` / `read` 才碰）——与 kit 的 `GrantStore`
 * 一致：插件挂载时不该在用户主目录里先建一个空文件。
 *
 * @param dir - 放历史文件的目录。正常走 `diagnosisHistoryPaths(dshHome()).dir`；测试传临时目录。
 *   本类只拥有这个目录（缺就建、建了才 chmod），不动 DSH 主目录本身。
 */
export declare class DiagnosisHistoryStore {
    private readonly dir;
    private readonly file;
    constructor(dir: string);
    /** 历史文件的绝对路径（排障 / 测试断言用）。 */
    get filePath(): string;
    /** 某个容器（按 `target + container` 索引）的历史，**按时间升序**。坏行已跳过。 */
    read(target: string, container: string): DiagnosisSample[];
    /**
     * 追加一条。返回**是否真的写进去了**（去重命中时 `false`）。
     *
     * 去重的「现在」取 `record.sample.at` 解析出来的毫秒——调用方刚刚生成它，与 `Date.now()`
     * 等价，但这里因此不需要再读一次时钟，纯逻辑部分（`shouldAppend`）也能被单测直接钉住。
     */
    append(record: DiagnosisHistoryRecord): boolean;
}
