/**
 * @hyzyn/dsh-kit — 子进程输出解码器的回归测试。
 *
 * 背景（报告 #2——外部真机缺陷报告的序号，**不是本包台账的编号**）：Windows 中文系统上 cmd.exe 自己的报错按 **CP936** 写
 * stderr，而插件按 UTF-8 解，卡片上的红色报错于是变成
 * `'x' �����ڲ����ⲿ���...`。这里用报告附录给出的**原始 CP936 字节**做断言——
 * 字节序列由 `python3 -c "s.encode('gbk')"` 生成，与报告截图逐字一致。
 *
 * 另一个必须守住的点：报告建议的「逐块 `TextDecoder(fatal)` 失败就回落 gbk」是**错的**
 * ——块边界切在多字节字符中间时会误判成非 UTF-8，反而把好数据解坏。用例 2/3 就是
 * 这条的防线：**切块位置不影响结果**。
 */
import { describe, expect, it } from 'vitest'
import { codePageEncoding, createOutputDecoder, decodeOutput } from '../src/index.js'

/** 报告第 5 节实测的那句话，按 CP936（GBK）编码后的原始字节。 */
const CP936_CMD_ERROR = Buffer.from([
  0x27, 0x63, 0x6f, 0x64, 0x65, 0x67, 0x72, 0x61, 0x70, 0x68, 0x27, 0x20,
  0xb2, 0xbb, 0xca, 0xc7, 0xc4, 0xda, 0xb2, 0xbf, 0xbb, 0xf2, 0xcd, 0xe2,
  0xb2, 0xbf, 0xc3, 0xfc, 0xc1, 0xee, 0xa3, 0xac, 0xd2, 0xb2, 0xb2, 0xbb,
  0xca, 0xc7, 0xbf, 0xc9, 0xd4, 0xcb, 0xd0, 0xd0, 0xb5, 0xc4, 0xb3, 0xcc,
  0xd0, 0xf2, 0xbb, 0xf2, 0xc5, 0xfa, 0xb4, 0xa6, 0xc0, 0xed, 0xce, 0xc4,
  0xbc, 0xfe, 0xa1, 0xa3,
])

const EXPECTED_ERROR = "'codegraph' 不是内部或外部命令，也不是可运行的程序或批处理文件。"

/** 把整段字节按给定长度切成块喂进去，返回解出的文本。 */
function decodeInChunks(bytes: Buffer, size: number): string {
  const decoder = createOutputDecoder({ fallbackEncoding: 'gbk' })
  let out = ''
  for (let offset = 0; offset < bytes.length; offset += size) {
    out += decoder.decode(bytes.subarray(offset, offset + size))
  }
  return out + decoder.flush()
}

describe('createOutputDecoder — CP936（报告 #2 的原始证据）', () => {
  it('整段喂入：CP936 的 cmd.exe 报错解出中文原文', () => {
    expect(decodeOutput(CP936_CMD_ERROR, { fallbackEncoding: 'gbk' })).toBe(EXPECTED_ERROR)
  })

  it('块边界切在多字节字符中间也不影响结果（报告建议的逐块 fatal 解码会在这里解坏）', () => {
    // CP936 汉字是 2 字节；按 1 字节切会让每个汉字都被切开
    for (const size of [1, 2, 3, 5, 7, 13]) {
      expect(decodeInChunks(CP936_CMD_ERROR, size)).toBe(EXPECTED_ERROR)
    }
  })

  it('ASCII 前缀 + CP936 汉字：ASCII 段在两种编码下一致，不产生重复或丢失', () => {
    const decoder = createOutputDecoder({ fallbackEncoding: 'gbk' })
    const firstLine = Buffer.from("'codegraph' ", 'ascii')
    const text = decoder.decode(firstLine) + decoder.decode(CP936_CMD_ERROR.subarray(12)) + decoder.flush()
    expect(text).toBe(EXPECTED_ERROR)
  })
})

describe('createOutputDecoder — UTF-8 主路径', () => {
  const utf8Text = 'codegraph 索引完成：共 1234 个符号、56 条调用边。\n'

  it('合法 UTF-8（含中文）原样返回', () => {
    expect(decodeOutput(Buffer.from(utf8Text, 'utf8'), { fallbackEncoding: 'gbk' })).toBe(utf8Text)
  })

  it('UTF-8 汉字被切块时不回落、不产生替换字符', () => {
    const bytes = Buffer.from(utf8Text, 'utf8')
    for (const size of [1, 2, 3, 4, 5, 8]) {
      const text = decodeInChunks(bytes, size)
      expect(text).toBe(utf8Text)
      expect(text).not.toContain('\uFFFD')
    }
  })

  it('UTF-8 与 CP936 两条流各自独立判定（stdout UTF-8 / stderr CP936）', () => {
    const stdout = createOutputDecoder({ fallbackEncoding: 'gbk' })
    const stderr = createOutputDecoder({ fallbackEncoding: 'gbk' })
    expect(stdout.decode(Buffer.from(utf8Text, 'utf8')) + stdout.flush()).toBe(utf8Text)
    expect(stderr.decode(CP936_CMD_ERROR) + stderr.flush()).toBe(EXPECTED_ERROR)
  })

  it('超过回放窗口的合法 UTF-8 之后混入非法字节：不再回落，但也绝不抛错', () => {
    const decoder = createOutputDecoder({ fallbackEncoding: 'gbk' })
    const big = Buffer.from('a'.repeat(64 * 1024 + 100), 'utf8')
    expect(decoder.decode(big)).toHaveLength(big.length)
    expect(() => decoder.decode(Buffer.from([0xb2, 0xbb]))).not.toThrow()
    expect(() => decoder.flush()).not.toThrow()
  })

  it('结尾停在残缺序列上：flush 给出替换字符而不是抛错', () => {
    const decoder = createOutputDecoder({ fallbackEncoding: 'gbk' })
    const partial = Buffer.from('中', 'utf8').subarray(0, 2)
    expect(decoder.decode(partial)).toBe('')
    expect(() => decoder.flush()).not.toThrow()
  })
})

describe('codePageEncoding（代码页 → 编码标签）', () => {
  it('中文 / 日文 / 韩文 / 繁体 OEM 代码页有对应标签', () => {
    expect(codePageEncoding(936)).toBe('gbk')
    expect(codePageEncoding(932)).toBe('shift_jis')
    expect(codePageEncoding(949)).toBe('euc-kr')
    expect(codePageEncoding(950)).toBe('big5')
  })

  it('UTF-8 代码页与西里尔 OEM 也认得', () => {
    expect(codePageEncoding(65001)).toBe('utf-8')
    expect(codePageEncoding(866)).toBe('ibm866')
    expect(codePageEncoding(1252)).toBe('windows-1252')
  })

  it('437 / 850（西欧 OEM）刻意返回 undefined，交给 windows-1252 兜底', () => {
    // 这两个没有 WHATWG 标签。早先映射到 ibm866（西里尔）——会把西欧文本解成西里尔字母，
    // 比不解还糟。留空落到 windows-1252（西欧 ANSI）方向才是对的。
    // en-US 的 x64 Windows 控制台默认就是 437，比 CP936 更常走到这条分支。
    expect(codePageEncoding(437)).toBeUndefined()
    expect(codePageEncoding(850)).toBeUndefined()
  })

  it('未知代码页返回 undefined（不抛错）', () => {
    expect(codePageEncoding(0)).toBeUndefined()
    expect(codePageEncoding(12345)).toBeUndefined()
  })
})

describe('createOutputDecoder — 其它', () => {
  it('空块不产出内容', () => {
    const decoder = createOutputDecoder()
    expect(decoder.decode(Buffer.alloc(0))).toBe('')
    expect(decoder.decode('')).toBe('')
    expect(decoder.flush()).toBe('')
  })

  it('显式 fallbackEncoding 生效（latin1 与 gbk 给出不同结果）', () => {
    expect(decodeOutput(CP936_CMD_ERROR, { fallbackEncoding: 'windows-1252' })).not.toBe(EXPECTED_ERROR)
    expect(decodeOutput(CP936_CMD_ERROR, { fallbackEncoding: 'gbk' })).toBe(EXPECTED_ERROR)
  })

  it('显式 fallbackEncoding=utf-8 时非法字节走替换字符，不抛错', () => {
    const text = decodeOutput(Buffer.from([0xb2, 0xbb]), { fallbackEncoding: 'utf-8' })
    expect(text).toBe('\uFFFD\uFFFD')
  })

  it('流式与一次性解码结果一致', () => {
    const streamed = decodeInChunks(CP936_CMD_ERROR, 3)
    expect(streamed).toBe(decodeOutput(CP936_CMD_ERROR, { fallbackEncoding: 'gbk' }))
  })
})
