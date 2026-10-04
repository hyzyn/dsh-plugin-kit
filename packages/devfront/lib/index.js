/**
 * @hyzyn/dsh-devfront — 开发/测试环境的前端效果验证工具（**私有包，不发布**）。
 *
 * ## 这个包现在有什么
 *
 * 目前只有**判定层**（纯逻辑）：页面动作白名单 + 站点范围判据 + console 分类 + 前端验活断言。
 * 它**不连浏览器**——页面驱动由调用方注入（`WebDriver` 接口），所以全部可单测。
 *
 * ## 它是三包中的第三个
 *
 * `docs/devdata-plan.md` §16 已定三包：`devdata`（数据面 + 验活断言库，已建）、
 * `devenv`（环境编排，未建）、**`devfront`（前端效果验证，本包）**。
 *
 * ## 刻意没有的东西
 *
 * - **没有 `dsh.bundle.patch`**：一旦带上，`scripts/aggregate.mjs` 会把本包卷进 `@hyzyn/dsh-all`
 *   聚合包（该脚本**不看 `private`**，已实测确认）。带上它 = 私有工具被塞进公开发布的聚合包。
 * - **没有客户端半体**：界面上只有 agent 工具面，没有独立面板。**代价要说清**——GUI 里因此
 *   **没有任何配置面**（2026-10-02 真机实测，profile 3082 + 真 Chrome）：插件详情页里本包只有
 *   「包含的组件 · 1 运行中」和一个卸载按钮、**没有表单**；「设置 → 插件配置」页只有 8 张
 *   **客户端半体自注册**的卡片；「设置 → 内置插件」是只读清单。所以站点配置只能像 docker 那样
 *   写进 profile 的 `cordis.patch.yml` 补丁层（`- id: devfront` + `config:`）。
 *   宿主侧确实存在一套「按 Config schema 生成表单」的机制（`dsh-settings` 的 `describe()` 按
 *   `volatileForm(schema)` 收录、`autoGenerate` 默认 `true`），但**这一版没有任何客户端代码
 *   消费 `autoGenerate`**（全安装 grep 无消费方）——机制在，渲染方不在。
 *   **两次判断更正，如实记**：我曾说「本版本没有自动生成机制」（拿本仓 kit 的
 *   `suppressAutoSettingsPage` 去搜安装，搜错了字符串），又据此改口说「配置页存在、所以
 *   volatile 是配置页的前提」——**第二句也不成立**，因为那份表单清单没有渲染方。
 *   现在这句「GUI 里没有配置面」是真机三个面扫过之后的结论（见 `ROADMAP.md` 记-15）。
 * - **字段仍全标 `.volatile()`，而理由与 GUI 无关**：它是 `settings.update` RPC 与配置编辑器
 *   那条**无重挂**写入路径的前提，而本包现在**履行了订阅义务**（`plugin.ts` 的 `applySection`，
 *   与 docker / tty / codegraph 一致）。此前只声明不订阅是**契约违背**——它当时是潜伏的
 *   （GUI 里够不着写入方），但契约就是契约。
 * - **没有定时 / 爬虫 / 批量动作**：这是 §15.3 的边界，**靠工具面里不存在这些动作**来守，
 *   不靠纪律（见 `page.ts` 的白名单）。
 *
 * 依据：`docs/devdata-plan.md` §15。
 */
export * from './console.js';
export * from './page.js';
export * from './cdp-driver.js';
export * from './credential.js';
export * from './login.js';
export * from './login-run.js';
export * from './web-verify.js';
export * from './web-run.js';
export * from './release.js';
export * from './release-run.js';
/* 宿主半体：DSH 靠这三个导出把本包装成插件（见 conventions.md § 插件包解剖）。 */
export { name, inject, apply, Config, CARD_FIELDS, configSnapshotFrom, normalizeCardPatch, normalizeTargets, normalizeConfig, parseViewport, DEVFONT_GUIDANCE, webAuditSink, webAuditText, verifyOutput, verifyRenderText, fillRenderText, releaseOutput, releaseRenderText, loginOutput, loginRenderText, } from './plugin.js';
export { PROJECT_SITES_REL, loadProjectSites, mergeSites } from './project-sites.js';
//# sourceMappingURL=index.js.map