/**
 * @hyzyn/dsh-tty — 凭据引用名派生规则的单元测试。
 *
 * 为什么有这份测试（2026-09-20 复核）：这条规则此前**没有测试**，只在
 * `client-src/index.js` 的注释与两份 README 里以示例形式存在，于是两处示例都漂了：
 *   ① 示例 IP 换成文档网段后，派生名却留在**原来那个私网网段**，输入与输出字面对不上；
 *   ② 「撞名」举例写成三个名字"折出来完全一样"，实际其中之一归一后与前两者不同
 *      折成 `LAB_A`，与前两者不同。
 * 现在示例本身就是断言（下面第三组），改示例而改错方向会被这里拦下。
 */
import { describe, expect, it } from 'vitest'
import { asciiRefToken, derivedCredentialRef } from '../client-src/credential-ref.js'

describe('asciiRefToken', () => {
  it('折非法字符为下划线、转大写、修剪首尾', () => {
    expect(asciiRefToken('  lab-a  ')).toBe('LAB_A')
    expect(asciiRefToken('192.0.2.10')).toBe('192_0_2_10')
    expect(asciiRefToken('web 01')).toBe('WEB_01')
  })

  it('空值 / 纯符号 → 空串（调用方据此拒绝）', () => {
    expect(asciiRefToken('')).toBe('')
    expect(asciiRefToken(undefined)).toBe('')
    expect(asciiRefToken(null)).toBe('')
    expect(asciiRefToken('   ')).toBe('')
    expect(asciiRefToken('---')).toBe('')
    expect(asciiRefToken('...')).toBe('')
  })

  it('撞名分组：空格与下划线同组；lab-a 是另一组（文档曾把三者写成同一组）', () => {
    expect(asciiRefToken('web 01')).toBe(asciiRefToken('web_01'))
    expect(asciiRefToken('lab-a')).toBe(asciiRefToken('lab a'))
    expect(asciiRefToken('lab-a')).toBe(asciiRefToken('LAB_A'))
    // 关键：lab-a 与前两者**不同组**——这正是原来文档举例的错误
    expect(asciiRefToken('lab-a')).not.toBe(asciiRefToken('web_01'))
  })
})

describe('derivedCredentialRef', () => {
  it('文档示例逐字对得上（README 中英与源码注释共用这两例）', () => {
    expect(derivedCredentialRef('192.0.2.10', '22', 'hsadmin', 'PASSWORD'))
      .toBe('DSH_TTY_HSADMIN_192_0_2_10_PASSWORD')
    expect(derivedCredentialRef('192.0.2.10', '2222', 'root', 'PASSWORD'))
      .toBe('DSH_TTY_ROOT_192_0_2_10_2222_PASSWORD')
  })

  it('默认端口（留空 / 22 / " 22 "）都不进键，归成同一个名字', () => {
    const a = derivedCredentialRef('192.0.2.10', '', 'hsadmin', 'PASSWORD')
    const b = derivedCredentialRef('192.0.2.10', '22', 'hsadmin', 'PASSWORD')
    const c = derivedCredentialRef('192.0.2.10', ' 22 ', 'hsadmin', 'PASSWORD')
    expect(a).toBe(b)
    expect(b).toBe(c)
    expect(a).toBe('DSH_TTY_HSADMIN_192_0_2_10_PASSWORD')
  })

  it('非默认端口进键（同一主机不同端口多是不同盒子）', () => {
    expect(derivedCredentialRef('192.0.2.10', '2222', 'root', 'PASSWORD'))
      .toBe('DSH_TTY_ROOT_192_0_2_10_2222_PASSWORD')
    expect(derivedCredentialRef('192.0.2.10', '2222', 'root', 'PASSWORD'))
      .not.toBe(derivedCredentialRef('192.0.2.10', '22', 'root', 'PASSWORD'))
  })

  it('字段参与名字：同一资源的 PASSWORD 与 PASSPHRASE 不同名', () => {
    expect(derivedCredentialRef('192.0.2.10', '22', 'root', 'PASSWORD'))
      .not.toBe(derivedCredentialRef('192.0.2.10', '22', 'root', 'PASSPHRASE'))
  })

  it('主机名（非 IP）同样可派生，且大小写归一', () => {
    expect(derivedCredentialRef('db.internal', '22', 'root', 'PASSWORD'))
      .toBe('DSH_TTY_ROOT_DB_INTERNAL_PASSWORD')
    expect(derivedCredentialRef('DB.Internal', '22', 'ROOT', 'PASSWORD'))
      .toBe(derivedCredentialRef('db.internal', '22', 'root', 'PASSWORD'))
  })

  it('空主机 / 空用户名 → 空串（拒绝存入，避免所有条目挤到同一个引用）', () => {
    expect(derivedCredentialRef('', '22', 'root', 'PASSWORD')).toBe('')
    expect(derivedCredentialRef('192.0.2.10', '22', '', 'PASSWORD')).toBe('')
    expect(derivedCredentialRef('   ', '22', 'root', 'PASSWORD')).toBe('')
    expect(derivedCredentialRef('192.0.2.10', '22', '   ', 'PASSWORD')).toBe('')
  })

  it('连接名不参与键：同一主机同一账号永远同名（改连接名不产生孤儿引用）', () => {
    // 只有 host / username / port 进键，函数签名里根本没有"连接名"这一维
    const one = derivedCredentialRef('192.0.2.10', '22', 'hsadmin', 'PASSWORD')
    const two = derivedCredentialRef('192.0.2.10', '22', 'hsadmin', 'PASSWORD')
    expect(one).toBe(two)
  })
})
