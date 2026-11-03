import type { Context } from '@deepseek-ai/cordis';
/**
 * 读取宿主服务：先走 ctx.get(name)（cordis 4 的服务读取入口，未注册返回
 * undefined），拿不到再回退属性访问 ctx[name]（部分宿主版本 / 插件直接往
 * ctx 上挂属性）。语义照抄 packages/search/src/index.ts:801-808 的同名实现，
 * 包括「get 返回 undefined 才回退」这一细节：服务真值可能是 undefined 以外
 * 的 falsy 值（false / 0 / ''），不能按 falsy 短路，否则会误判成未注册。
 *
 * **两条路都按「抛错 = 没有」处理**，不只是「返回 undefined = 没有」：cordis 4 的属性
 * 访问对**没声明 inject 的服务**是**直接抛** `cannot get property "x" without inject`，
 * 而这里问的只是「有没有」。只按返回值判空的话，第二跳会把异常交给调用方——落在
 * `apply()` 里就是整个插件激活失败：2026-11-03 真机（dsh 0.2.1-rc.5 桌面宿主）上
 * loglens 就是这么挂的（宿主半体没起来，设置卡片每条请求 404）——见 kit D17 / loglens D11。
 *
 * 调用方要区分「服务不存在」与「服务存在但读失败」时**不要**指望这里——这里只保证不抛。
 */
export declare function getService(ctx: Context, name: string): unknown;
/**
 * DSH 主目录：DSH_HOME 环境变量优先（trim 后为空视为未设置），否则 ~/.dsh。
 *
 * 用 homedir() 而非 process.env.HOME：Windows 上 HOME 常常未设置，homedir()
 * 走系统 API 更可靠；与全仓现有 8 处实现保持同一语义。
 *
 * 返回前做一层**归一化**（`~` 展开 + resolve）：DSH 的运行时 loader 读同一环境
 * 变量时走的是 `resolve(expandHomePath(...))`，插件若拿原始字面量去拼
 * `cordis.patch.yml`，`DSH_HOME=~/x` 时写的是字面 `~/x/…` 目录（相对 cwd 的一个
 * 名叫 `~` 的目录），而 loader watch 的是展开后的 `/home/u/x/…`——两个不同文件，
 * 热加载永远不会触发（codegraph DEFECTS CG13）。
 */
export declare function dshHome(): string;
