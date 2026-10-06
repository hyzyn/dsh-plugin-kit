/**
 * SFTP 双栏的列表过滤与拖放落点规则（`client-src/sftp-view.js`）。
 *
 * 这三条都是「判错了不报错、只让人困惑」的规则，所以抽成纯函数在这里钉：
 *   ① 隐藏文件默认不显示、但开关能打开；
 *   ② 拖放**只有远端栏**接（丢到本机栏等于把文件放到它已经在的地方）；
 *   ③ 拖文件夹时先预建的目录集合（父在子前、去重）。
 *
 * 反向也钉住：宿主侧 `list` 与 `sftp_list` 工具**不参与过滤**——隐藏文件的可见性
 * 纯粹是界面选择，agent 看不到 `.env` 会得出错误结论（过滤在渲染层，见 sftp-view.js）。
 */
import { describe, expect, it } from 'vitest'
import { dirsToCreate, filterEntries, isHiddenName, planDrop } from '../client-src/sftp-view.js'

describe('isHiddenName', () => {
  it('点开头的名字是隐藏项', () => {
    expect(isHiddenName('.env')).toBe(true)
    expect(isHiddenName('.gitignore')).toBe(true)
    expect(isHiddenName('.config')).toBe(true)
  })

  it('`.` / `..` 不是「隐藏文件」（它们是遍历用的特殊项，另有处理）', () => {
    expect(isHiddenName('.')).toBe(false)
    expect(isHiddenName('..')).toBe(false)
  })

  it('普通名字、空值、非字符串都不是隐藏项', () => {
    expect(isHiddenName('readme.md')).toBe(false)
    expect(isHiddenName('a.env')).toBe(false)
    expect(isHiddenName('')).toBe(false)
    expect(isHiddenName(undefined)).toBe(false)
    expect(isHiddenName(null)).toBe(false)
  })
})

describe('filterEntries', () => {
  const rows = [{ name: 'a.txt' }, { name: '.env' }, { name: 'dir' }, { name: '.git' }]

  it('默认（showHidden 假值）过滤掉隐藏项', () => {
    expect(filterEntries(rows, false).map((r) => r.name)).toEqual(['a.txt', 'dir'])
    expect(filterEntries(rows, undefined).map((r) => r.name)).toEqual(['a.txt', 'dir'])
  })

  it('开关打开时全部显示', () => {
    expect(filterEntries(rows, true).map((r) => r.name)).toEqual(['a.txt', '.env', 'dir', '.git'])
  })

  it('返回新数组（不修改入参——调用方还要用原始列表算条目数）', () => {
    const out = filterEntries(rows, false)
    expect(out).not.toBe(rows)
    expect(rows).toHaveLength(4)
  })

  it('垃圾输入不抛错（列表还没回来时是 undefined）', () => {
    expect(filterEntries(undefined, false)).toEqual([])
    expect(filterEntries(null, true)).toEqual([])
    expect(filterEntries([null, { name: 'x' }], false)).toEqual([{ name: 'x' }])
  })
})

describe('planDrop：只有远端栏接受拖放', () => {
  it('远端栏 + 真的拖了文件 → 接受', () => {
    expect(planDrop('remote', { types: ['Files'], files: { length: 1 } })).toEqual({ accept: true })
    expect(planDrop('remote', { types: ['Files'], files: { length: 3 } })).toEqual({ accept: true })
  })

  it('本机栏 → 拒绝（丢到本机栏等于放到它已经在的地方）', () => {
    expect(planDrop('local', { types: ['Files'], files: { length: 1 } })).toEqual({ accept: false, reason: 'wrongPane' })
  })

  it('栏内 HTML5 拖动（不带 Files 类型）→ 拒绝（不该变成一次传输）', () => {
    expect(planDrop('remote', { types: ['text/plain'], files: { length: 0 } })).toEqual({ accept: false, reason: 'notFiles' })
    expect(planDrop('remote', { types: [], files: { length: 0 } })).toEqual({ accept: false, reason: 'notFiles' })
  })

  it('带 Files 类型但没有文件 → 拒绝', () => {
    expect(planDrop('remote', { types: ['Files'], files: { length: 0 } })).toEqual({ accept: false, reason: 'empty' })
    expect(planDrop('remote', { types: ['Files'] })).toEqual({ accept: false, reason: 'empty' })
  })
})

describe('dirsToCreate：拖文件夹时先预建的远程目录', () => {
  it('从 relPath 里归出父目录，去重', () => {
    expect(dirsToCreate([{ relPath: 'a/b/c.txt' }, { relPath: 'a/b/d.txt' }])).toEqual(['a/b'])
    expect(dirsToCreate([{ relPath: 'a/x.txt' }, { relPath: 'b/y.txt' }])).toEqual(['a', 'b'])
  })

  it('按深度排序（父在子前）——逐个 parents:true 建时顺序可预期', () => {
    expect(dirsToCreate([{ relPath: 'a/b/c/d.txt' }, { relPath: 'a/e.txt' }, { relPath: 'a/b/f.txt' }])).toEqual(['a', 'a/b', 'a/b/c'])
  })

  it('顶层文件（relPath 没有目录段）不产出目录', () => {
    expect(dirsToCreate([{ relPath: 'top.txt' }])).toEqual([])
    // cut <= 0：以 `/` 开头（不该出现，但别产出空目录名）
    expect(dirsToCreate([{ relPath: '/abs.txt' }])).toEqual([])
  })

  it('垃圾输入不抛错', () => {
    expect(dirsToCreate(undefined)).toEqual([])
    expect(dirsToCreate([null, {}, { relPath: 123 }])).toEqual([])
  })
})
