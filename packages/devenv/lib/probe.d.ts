/** 探针结果（形状即 `ServiceObservation['probe']`）。 */
export interface ProbeResult {
    ok: boolean;
    status?: number;
    detail?: string;
}
/** 探针输入。 */
export interface ProbeInput {
    host: string;
    port: number;
    path: string;
    timeoutMs: number;
}
/**
 * 把一次 HTTP 请求的失败映射成人能用的文案（**纯函数**，便于逐分支钉住）。
 *
 * 分开的理由：这几条分支的**处置不同**——「端口还没起来」是继续等，「主机名解析不了」是清单写错了
 * 主机，其它错误要去查原因。把映射抽出来，就能在不起真服务、不等真解析器的情况下逐条断言；
 * 而真实解析那条路只留一条集成用例（见 `test/probe.test.ts`）。
 */
export declare function probeFailureDetail(error: NodeJS.ErrnoException, host: string, timeoutMs: number): string;
/** 一个连着就断的探针：从给定地址请求一次，读完响应头就销毁（不等 body）。 */
export declare function httpProbe(input: ProbeInput): Promise<ProbeResult>;
