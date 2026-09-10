# 发布流程

目标：让每个版本号值得点开。发布频率是给用户的信号预算——攒批发、过门槛、高危改动走 rc。
与 dsh-safe 的单包流程不同，本仓库是 monorepo：一次发布可涉及多个包，**tag 锚点是
`@hyzyn/dsh-all`**（用户视角的聚合包，沿用 v0.1.15 起的惯例，workflow 会强校验）。

## 一次性配置

GitHub 仓库 Settings → Secrets and variables → Actions 新增 `NPM_TOKEN`。token 在
npmjs.com → Access Tokens → Generate New Token（granular）生成：

- **Packages and scopes**：勾选要发布的包（或 Select all packages）；
- **Permissions**：必须 **Read and write**（只读 token 发包会被拒）；
- **2FA**：选 bypass（CI 没法输动态码）。

未配置时 Release workflow 会跳过 npm publish、只建 GitHub Release，并给出 warning。

## 发布门槛（每次 tag 前过一遍）

1. `pnpm -r build && pnpm -r typecheck` 全绿。本地 `pnpm publish` 没有闸，全靠自觉——
   CI 在发布前会再跑一遍兜底。
   **bump 完版本号先同步 lockfile**：`pnpm install --lockfile-only`，然后
   `git diff --exit-code pnpm-lock.yaml`。workspace 内部依赖是按版本号写进
   lockfile 的（`specifier:` 那一行），只改 package.json 不改 lockfile，CI 第一步
   `pnpm install --frozen-lockfile` 就会红——v0.1.22 就是两次卡在这里（两次都只
   同步了 package.json，白等两轮 CI）。一条命令过完前三项：

   ```bash
   pnpm install --lockfile-only && git diff --exit-code pnpm-lock.yaml \
     && pnpm -r build && pnpm -r typecheck \
     && pnpm aggregate && git diff --exit-code
   ```
2. `pnpm aggregate` 无 diff。聚合层（根 `cordis.patch.yml`、`packages/all`）必须钉住
   本次要发的插件版本；CI 与 Release workflow 都强制检查，过期直接红。
3. 动了插件运行行为的改动，真实装进 DSH 跑一遍：`dsh plugin --profile <name> add
   @hyzyn/dsh-<pkg>`（或 link: 路径调试）。build 绿不等于装上没问题。
   tty 的 integration/live/ssh-smoke 需要真机，按需本地跑。
4. 各包依赖**不要写 `workspace:*`**。它只在 monorepo 内部有效：`pnpm publish` 会把它
   换成真实版本（所以 npm 产物看起来是对的），但用户从 git 子路径安装
   （`git+https://github.com/hyzyn/dsh-plugin-kit.git#main&path:packages/tty`）时协议
   原样保留，pnpm 报 `ERR_PNPM_WORKSPACE_PKG_NOT_FOUND` 装不上——而报错指不到本仓库，
   只能靠用户来提 issue。写真实版本（如 `^0.1.2`）即可；本地开发靠根 `.npmrc` 的
   `link-workspace-packages=true` 仍然链接到 `packages/*`，体验不变。
   CI 与 Release workflow 都会跑 `node scripts/check-publishable.mjs` 兜底。

## 攒批

- 多个 fix 攒一个版本发；feature 单独发。目标一天 ≤ 1–2 个版本。
- 版本号语义（各包独立）：**patch** = 不改行为的修复；**minor** = 新能力或行为变化。
  用户靠这个决定要不要更。发版时受影响的包各自 bump；只要有插件变化，
  `@hyzyn/dsh-all` 和根 `@hyzyn/dsh-plugin-kit` 也要 bump。
- 出 hotfix 链（x.y.1 → x.y.2 → x.y.3）通常说明上一版发布前没过门槛——回看是哪步省了，
  而不是接着发下一版。

## 正式发布

```bash
git switch main && git pull
# 1. bump 受影响包的 package.json 版本号
# 2. pnpm aggregate          # 重新生成聚合层
# 3. 提交全部改动并推送 main（CI 先绿）
git tag "v$(node -p "require('./packages/all/package.json').version")"
git push origin main --tags
```

tag 推上去后 Release workflow 接管：校验 tag 与 `@hyzyn/dsh-all` 版本一致 →
build + typecheck + 聚合检查 → 按依赖序发布全部包（registry 上已存在的「包名@版本」
自动跳过，未 bump 的包不拦路）→ 逐包回查 registry 核实 → 建 GitHub Release
（Highlights 自动过滤 chore 提交）。

发布中途失败：修复后删除并重打同一个 tag 再推即可，已发出的包重跑时自动跳过（幂等）。
兜底的手动发布：`node scripts/release-publish-all.mjs [6位OTP] [only=]包目录,...`
（bypass-2FA token 不需要 OTP；经典 token 传 6 位动态码）。

## 排错（CI 发布 403/404 时对照）

| 症状 | 原因与处理 |
| --- | --- |
| `403 ... Two-factor authentication or granular access token with bypass 2fa` | 缺动态码或 token 不是 bypass-2FA：换 bypass granular token |
| `404 Not found - PUT <包名>` / `404 ... install from a tarball` | token 对该包无发布权（npm 故意 404 隐藏存在性）：检查 granular token 的 Packages and scopes 是否勾到该包、权限是否 Read and write |
| 用户报 `ERR_PNPM_WORKSPACE_PKG_NOT_FOUND ... "@hyzyn/dsh-kit@workspace:*"` | 某包依赖残留 `workspace:*`：从 git 子路径安装必炸（npm 安装正常，因为 publish 期已转换）。改真实版本 + bump 受影响包重发；本地先跑 `node scripts/check-publishable.mjs` 确认 |

校验 token 身份（不泄露值）：

```sh
curl -s -H "Authorization: Bearer $TOKEN" https://registry.npmjs.org/-/whoami
# → {"username":"hyzyn"} 即为正确账号
```

## 高危改动走 prerelease

版本号带 `-` 的包（如 `0.16.0-rc.1`）workflow 自动以 `--tag next` 发布，
GitHub Release 标记为 prerelease：

- `next` dist-tag 不进用户的每日版本检查（检查只读 npm `latest`），正式用户无感。
- 自测：`dsh plugin --profile <name> add @hyzyn/dsh-tty@next`，真实环境跑一天；
  稳定后去掉 `-rc.n` 发 latest。
