/**
 * @hyzyn/dsh-tty — 凭据引用名的派生规则（纯逻辑）。
 *
 * 为什么单独成文件：规则原先只写在 `client-src/index.js` 的注释里、且**没有任何测试**
 * 钉住，于是文档里的示例漂了两次都没人发现（2026-09-20 复核）：
 *   ① 示例 IP 换成文档网段时，派生名却留在**原来那个私网网段**，输入与输出字面对不上；
 *   ② 「撞名」举例写成三个名字"折出来完全一样"，实际其中之一归一后与前两者不同
 *      折成 `LAB_A`，与前两者不同。
 * 抽成纯模块后可直接单测（`test/credential-ref.test.ts`），与 `status-line.js` /
 * `stats-bar.js` 同款；esbuild 打包时按普通本地模块内联，产物形态不变。
 */

/**
 * 把一段文本压成引用文法允许的 ASCII 标识符片段（非法字符折成 `_`，首尾修剪）。
 *
 * 引用文法只认 POSIX 标识符，所以任何进名字的字段都必须过这一关。**只用于 host / username
 * 这类本身就该是 ASCII 的资源标识**——**别拿人类起的连接名来过这里**（`web 01` / `web_01`
 * 会折成同一个片段，`lab-a` / `lab a` / `LAB_A` 也一样，那正是第一版静默覆盖的成因；见下）。
 */
export function asciiRefToken(value) {
  return String(value ?? '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

/**
 * 由**资源身份**（用户名 + 主机 + 非默认端口）派生一个合法的凭据引用名。
 *
 * 规则（**恒定不变，别按需省略**）：
 *   `DSH_TTY_<用户名>_<主机>[_<端口>]_<字段>`，端口为 22（默认）时省略；字段 = PASSWORD / PASSPHRASE
 *   例：`hsadmin@192.0.2.10:22` → `DSH_TTY_HSADMIN_192_0_2_10_PASSWORD`
 *       `root@192.0.2.10:2222` → `DSH_TTY_ROOT_192_0_2_10_2222_PASSWORD`
 *   （点分 IP 的 `.` 折成 `_`；**改示例时输入与派生名必须字面对得上**——`test/credential-ref.test.ts`
 *   就是为此钉的。）
 *
 * 为什么按资源身份、**不用连接名也不用哈希**（与 git-credential-store 的 `protocol://username@host`、
 * docker credential helpers 的 `ServerURL` + `Username` 同一派）：host 与 username **本来就是 ASCII
 * 标识符**，不需要清洗、也就不需要哈希兜底。曾经的哈希版是为了补救"把人类标签清洗成键"——
 * 而 `web 01` / `web_01`（空格与下划线）折出来完全一样，只能靠哈希避免静默覆盖。资源身份没有这个死结：
 * 撞名只可能发生在**同一主机、同一用户、同一端口**，而那本来就该是同一个密码（共享是正确行为）。
 *
 * 顺带的好处：**连接名完全不参与键**，所以改连接名/重新保存都不会产生孤儿引用（旧哈希版会）。
 *
 * 代价（写出来免得日后惊讶）：名字可读性弱于人类标签（`DSH_TTY_ROOT_192_0_2_10_PASSWORD`）。
 * 这是 git / docker 那派的共同取舍——要人读的名字，就在存入前把预填的名字改掉（对话框里可编辑）。
 *
 * 另：**派生只发生在"存入"那一刻**。存完以后，配置里那个 `env:NAME` 就是唯一事实来源，没有任何
 * 地方会再派生一次——所以改连接名不会让已存的值失效（用「清除已存凭据」按字段里的引用清掉）。
 *
 * 为什么拒绝空主机 / 空用户名：两者是键的全部来源，缺一都会退化成常量（把所有条目挤到同一个引用上）。
 */
export function derivedCredentialRef(host, port, username, suffix) {
  const user = asciiRefToken(username)
  const server = asciiRefToken(host)
  if (user === '' || server === '') return ''
  const normalizedPort = asciiRefToken(port)
  const parts = ['DSH_TTY', user, server]
  // 默认端口不进键：**端口留空、写 22、写 " 22 " 都归成同一个键**（连接侧是 `spec.port ?? 22`，
  // 留空就是 22，键必须与它一致——否则同一个账号会有两个名字、同一个密码存两份，改一处另一处
  // 还指着旧值）。非默认端口才进键：同一主机不同端口常是不同盒子（NAT 后面），必须区分。
  if (normalizedPort !== '' && normalizedPort !== '22') parts.push(normalizedPort)
  parts.push(suffix)
  return parts.join('_')
}
