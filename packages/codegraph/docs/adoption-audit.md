# 采纳率实测：从 177 个真实历史会话里算出来

> 2026-09-22。方法：直接解码 `~/.dsh/sessions/**/session.v3.jsonl.zstd`（append-only 多帧
> zstd，按魔数 `28 B5 2F FD` 切帧逐帧解压），提取 `tool/call`，归类用的是**插件自己的**
> `bucketToolCall`——同一个口径，不是另写一套统计脚本。
>
> 为什么不用「跑一天再看」：DSH 已经把每次会话落成了日志，历史数据本来就在硬盘上
> （177 个会话 / 12.1 万条事件）。等一天只能拿到一天的同质样本，而回溯能立刻拿到跨项目、
> 跨时间的分布，还能顺手校验度量本身对不对。

## 结论（先说三个数）

| 口径 | 数字 | 说明 |
| --- | --- | --- |
| **会话级** | **23%**（已索引项目：118 个会话里 27 个用过 codegraph） | 「这个会话说到底有没有用过它」 |
| **调用级（窄口径）** | **28.8%**（45 次 codegraph vs 111 次 grep/glob/search/find/list） | 分子分母都是「发现类」调用，这才是 codegraph 真正要替代的东西 |
| **调用级（宽口径）** | **2.2%**（45 vs 1975，分母含 `read`） | **这个数字会误导人**，原因见下 |

**一句话：codegraph 确实在被用，但远没有它在提示词里被期望的那样成为默认路径。**
会话级的 23% 说明「多数会话压根没碰它」；窄口径的 28.8% 说明即便是碰了的会话，主要
发现手段仍然是 grep/glob。

## 宽口径为什么是错的（这条是本次实测最大的收获）

第一版把 `read` / `read_file` 这类全算进分母，得出 2.2%。看真实工具排行才发现两件事：

1. **`read` 多半不是「发现」，而是「打开要改的文件」**。真实历史里 `read` 出现 1956 次，
   而 `grep` 只有 100 次、`glob` 17 次。codegraph 替代的是「找东西」，不是「读我已经知道
   要改的那个文件」——把 `read` 放进分母，等于要求 codegraph 替代一个它本来就不该替代
   的场景，数字必然被压到个位数。
2. **分类器本身还错收了一批**（已修，见 CG40）：`read_image`（248 次）、`read_pdf`、
   `web_search`（19 次）因为只匹配词根「read / search」被算成了代码探索。读截图、搜网页
   跟 codegraph 毫无关系，而单这一个错误就把分母灌了 11%（2344 → 2077）。

修完之后：**窄口径 28.8%** 才是有意义的数字。

## 按条件切片

| 切片 | 会话 | 用过 codegraph | 窄口径采纳率 |
| --- | --- | --- | --- |
| 全部历史 | 177 | 29（16%） | 28.7% |
| 仅已索引项目 | 118 | 27（23%） | 28.8% |
| 已索引 + 9/19 之后（引导语与门禁在场） | 37 | 9（24%） | 26.7% |
| 已索引 + 最近三天 | 17 | **8（47%）** | **32.4%** |

两个观察：

- **未索引项目的会话几乎不用它**（59 个会话里只有 2 个，3%）——这符合预期，也说明
  P1-a 那道索引门禁方向是对的：在没索引的仓库里花 300 token 教模型用它，纯属浪费。
- **最近三天会话级 adoption 翻倍到 47%**，但样本只有 17 个会话，且这几天恰好大量会话
  就在本仓库（一个索引完备、且我们一直在讨论 codegraph 的仓库）。**这不足以证明引导语
  起了作用**，只能说「没有变差」。

## codegraph 调用本身的质量：合格

47 次调用逐条看 query，**34/47（72%）带了具体符号名或标识符**，而不是泛泛的自然语言：

```
[cdc-manage] MqExamScoringMessageConsumer MqOutboxMessageServiceImpl MqExamMessageSender …
[cdqas-5.0] BasicCodeDataStoreWriter syncImportedCodeNames batchUpdateCodeNameTemplate …
[yfy-backend] SaTokenConfig StpInterfaceImpl SaTokenInterceptor TokenData WeworkLoginService …
[dsh-plugin-kit] locateIndex locateCwdEdits readPostBody runViaSpawn ensureStyle …
```

这说明**模型会用**这个工具（懂它的粒度：给符号名/文件名，而不是问「这个项目是干嘛的」）。
问题不在「会不会用」，而在「想不想得起用」。

## 对路线图的直接影响

1. **P0 per-agent 挂载的紧迫性下降**。它的收益本来是「多项目并行 + 去掉写盘链」，而数据
   显示：同机 50 个项目目录 / 177 个会话，绝大多数会话是**一次一个项目**。架构改造值得
   做，但它不会提高采纳率——不要指望它解决这块。
2. **P1 里真正该插队的是「让模型更容易想起它」**，而不是继续加运维面。候选（按代价排序）：
   - 在**索引已就绪且当前路径确实是索引根**时，把 usage 段的语气从「可以用」收紧到
     「优先用」（当前是启发式描述，P1-a 已保证它不会出现在未索引仓库里）；
   - 用 `agent/inbox/inserted` 做**前置注入**（宿主确有这个事件，本机实测）——但 scg 的
     实测结论是「不必需」，而本次数据（会话级仅 23%）说明**可能确实需要**，值得小样本
     A/B：同一仓库交替开启/关闭前置注入，用 `/metrics` 的窄口径对比。
   - **前提是先给 `/metrics` 加窄口径**（见下）。
3. **`/metrics` 要同时报两个口径，并标注哪个才该看**。只报宽口径会让人（包括未来的我）
   得出「codegraph 没用」的错误结论；只报窄口径又藏起了「read 占绝对多数」这个事实。
4. **采纳率必须按「项目是否已索引」分组**。把未索引项目的会话混进来是错的（59 个会话
   里 57 个从没用过，而这完全合理）。`/metrics` 已经带了 `indexed` 标志，卡片文案也
   据此加了说明，但**分组统计还没做**。

## 复现方式

```bash
# 会话日志：append-only 多帧 zstd，必须逐帧解压（Node 22 自带 zstdDecompressSync）
node --input-type=module -e '
import { readFileSync } from "node:fs"
import { zstdDecompressSync } from "node:zlib"
const buf = readFileSync(process.argv[1])
const MAGIC = Buffer.from([0x28,0xb5,0x2f,0xfd])
const starts = []; let i = buf.indexOf(MAGIC, 0)
while (i !== -1) { starts.push(i); i = buf.indexOf(MAGIC, i + 4) }
const out = []
for (let k = 0; k < starts.length; k++) {
  const end = k + 1 < starts.length ? starts[k+1] : buf.length
  try { out.push(zstdDecompressSync(buf.subarray(starts[k], end))) } catch {}
}
const text = Buffer.concat(out).toString("utf8")
const events = text.trim().split("\n").map(l => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
console.log(events.filter(e => e.type === "tool/call").length, "tool calls")
' ~/.dsh/sessions/*/session-*/session.v3.jsonl.zstd
```
