/** 三面各自的清单形态。`countField` 是各面清单里那个「条目数组」的字段名（只用来数条数）。 */
export interface EvidenceFaceSpec {
    readonly face: EvidenceFace;
    readonly dir: string;
    readonly suffix: string;
    readonly countField: string;
    /** 归属包——文案里点名，出问题时知道该找谁。 */
    readonly owner: string;
    /** 看**结论**要用的工具名（总览只给结论的入口，不给结论）。 */
    readonly tool: string;
}
export type EvidenceFace = 'ready' | 'verify' | 'web';
/**
 * 三面清单的形态。**这三个后缀就是「清单住在哪」的口径**——本文件不导出去给别的包用，
 * 只被本模块与 `scripts/test/release-chain.test.ts` 的对齐守卫读（后者拿它与另外两包自己的
 * 路径函数逐个比对）。
 */
export declare const EVIDENCE_FACES: readonly EvidenceFaceSpec[];
/** 读取结果：与 `@hyzyn/dsh-kit/manifest` 的 `ManifestRead` 同名同义（那是唯一真源）。 */
export type EvidenceState = 'missing' | 'unreadable' | 'malformed' | 'empty' | 'multiple' | 'parsed';
export interface EvidenceFaceReport {
    readonly face: EvidenceFace;
    /** 相对项目根的清单路径（唯一拼法在 `manifestRelPath`）。 */
    readonly path: string;
    readonly state: EvidenceState;
    /** `unreadable` / `malformed` 时是读取器或 YAML 解析器的原话；其余为 `null`。 */
    readonly message: string | null;
    /** `multiple` 时是那几个候选路径（歧义要报出来，不按顺序静默取胜）。 */
    readonly files: readonly string[] | null;
    /** 清单里写的 `project`（没读到或不是字符串时为 `null`）。 */
    readonly projectInFile: string | null;
    /** 与文件名里的项目名一致吗；`null` = 没读到，谈不上一致。 */
    readonly projectMatches: boolean | null;
    /** `countField` 那个数组的长度；不是数组时为 `null`（**不回落成 0**——0 条是结论，读不到不是）。 */
    readonly count: number | null;
    readonly countField: string;
    readonly owner: string;
    readonly tool: string;
}
export interface EvidenceReport {
    readonly ok: true;
    readonly root: string;
    readonly project: string;
    readonly faces: readonly EvidenceFaceReport[];
    /**
     * Jenkins 那一格**今天没有实现**——如实说「未接」，不摆一个空壳装作接了。
     * （发布归 Jenkins；本仓没有任何一条从插件连它的通路。）
     */
    readonly jenkins: {
        readonly state: 'unwired';
    };
}
export interface EvidenceRefusal {
    readonly ok: false;
    readonly code: 'BAD_ROOT' | 'BAD_PROJECT';
    readonly error: string;
}
/**
 * 读一个项目的三份清单，给出总览。
 *
 * 不抛异常：**每一种拒绝都是一种结果**（`BAD_ROOT` / `BAD_PROJECT` 与「清单不存在」是两件事，
 * 前者是路径写错了，后者是「这个项目刚好没有那份清单」）。
 */
export declare function readEvidence(input: {
    root: unknown;
    project: unknown;
}): EvidenceReport | EvidenceRefusal;
