/**
 * HTTP 探针（`docs/devdata-plan.md` §13.2 的 `httpProbe` 判据）。
 *
 * ## 探针**从哪台机器**发出，是一个必须写明的选择
 *
 * 这里从**运行本工具的机器**发出（不是从目标主机内部）。理由是端口这一半的现实：
 * 容器把端口发布到宿主机上，而「这台机器能不能连上那个端口」恰好就是用户想问的问题；
 * 从目标主机内部探 `127.0.0.1:port` 是另一档问题（服务绑没绑对地址、容器网络通不通），
 * 而且要求目标上有 curl / wget 之类的东西——那是这套东西目前不该有的前提。
 *
 * 所以清单里的 `port` 必须**从这台机器可达**（一般是 docker 发布到宿主机的端口）。
 * 这个前提写在这里，是因为它不满足时的症状（一直 `unready` 到超时）看起来像 bug。
 *
 * ## 只支持 http
 *
 * 清单里没有协议字段，而「猜」在这里代价很大：把 https 当 http 探会拿到一个连接错误，
 * 于是「服务没起来」和「协议写错了」变成同一句话。要 https 就明说（加字段），不要猜。
 *
 * ## 状态码怎么算「通过」
 *
 * `2xx` / `3xx` 算通过（服务器在应答）；`4xx` **不算**（路径写错、还没挂载到路由）——报 `unready`
 * 而不是 `refuted`，因为「路径不对」是可以等的（应用可能刚换了个上下文路径），而报告里会带上
 * 真实状态码，人能一眼看出是清单写错了；`5xx` 算**明确否证**（服务起来了但自己报错），
 * 这一档由判定层处置（见 `env-ready-eval.ts` 的注释：5xx 与「连不上」混成一档会让「启动就报错」
 * 一直等到超时）。
 */
import { request } from 'node:http';
/**
 * 把一次 HTTP 请求的失败映射成人能用的文案（**纯函数**，便于逐分支钉住）。
 *
 * 分开的理由：这几条分支的**处置不同**——「端口还没起来」是继续等，「主机名解析不了」是清单写错了
 * 主机，其它错误要去查原因。把映射抽出来，就能在不起真服务、不等真解析器的情况下逐条断言；
 * 而真实解析那条路只留一条集成用例（见 `test/probe.test.ts`）。
 */
export function probeFailureDetail(error, host, timeoutMs) {
    if (error.code === 'ECONNREFUSED')
        return '连接被拒（端口还没起来）';
    /*
     * `ECONNRESET` 是**一等状态**，不是「其它错误」（devenv D03，2026-10-04 真机档抓到）。
     *
     * Docker Desktop（macOS）在「端口已发布、容器里还没有进程监听」时**先收下 TCP 连接再空回**，
     * 于是 Node 报的是 `socket hang up`——而这恰好是每次冷启动里**最长**的那一段
     * （2026-10-04 真机档实测：连续 5 次观测 ≈15s 都是这一档，见
     * `test/real-coldstart-local.test.ts`）。不认它的后果很具体：用户盯得最久的那句话是个英文
     * Node 错误，既看不出「还没起来」、也看不出「该继续等」。
     *
     * 判据认的是 **code**：没有 code 的同名错误照旧原样带出去（下一行那个契约不变）。
     */
    if (error.code === 'ECONNRESET')
        return '连接被重置（多半是端口上还没有能应答的东西）';
    if (error.code === 'ENOTFOUND' || error.code === 'EAI_AGAIN')
        return `主机名解析不了：${host}`;
    // 超时走的是 `req.destroy(new Error('timeout'))`，到这里的 message 就是 'timeout'。
    if (error.message === 'timeout')
        return `${String(timeoutMs)}ms 内没有响应`;
    return error.message;
}
/** 一个连着就断的探针：从给定地址请求一次，读完响应头就销毁（不等 body）。 */
export async function httpProbe(input) {
    return await new Promise((resolve) => {
        let settled = false;
        const done = (result) => {
            if (settled)
                return;
            settled = true;
            resolve(result);
        };
        const req = request({ host: input.host, port: input.port, path: input.path, method: 'GET', timeout: input.timeoutMs }, (res) => {
            const status = res.statusCode ?? 0;
            res.resume(); // 不等 body：就绪探针只关心「应答了吗、状态码是多少」
            // `4xx` 也带上状态码：报告里 `HTTP 404` 与「连接被拒」是两条完全不同的线索。
            done(status >= 200 && status < 400
                ? { ok: true, status }
                : { ok: false, status, detail: `HTTP ${String(status)}` });
        });
        req.on('timeout', () => {
            req.destroy(new Error('timeout'));
            done({ ok: false, detail: probeFailureDetail(new Error('timeout'), input.host, input.timeoutMs) });
        });
        req.on('error', (error) => {
            done({ ok: false, detail: probeFailureDetail(error, input.host, input.timeoutMs) });
        });
        req.end();
    });
}
//# sourceMappingURL=probe.js.map