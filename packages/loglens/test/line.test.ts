/**
 * @hyzyn/dsh-loglens — 行模型（标签展平 + 级别）的用例。
 *
 * 这两件事是 2026-10-11 真机反馈里代价最大的两条：只收标量时，filebeat 的 container / host 全被跳过，
 * 60 行输出里唯一的标签是 stream——agent 看不出哪台机器、哪个容器，只能绕出插件去 curl（一绕出去
 * 围栏 / 认证 / 归一化全没了）。所以夹具直接照 filebeat 的真实文档形状写。
 */
import { describe, expect, it } from 'vitest'
import {
  CANONICAL_LEVELS,
  LABEL_PRIORITY,
  LABEL_VALUE_MAX,
  canonicalLevel,
  flattenLabels,
  inferLevel,
  isContinuation,
  levelHint,
  levelMatches,
  withLevel,
} from '../src/line.js'
import type { LogLine } from '../src/backends/types.js'

/** filebeat 的容器日志文档（照真机那份裁剪，字段名一模一样；内网标识已脱敏）。 */
const FILEBEAT_DOC = {
  '@timestamp': '2026-10-11T14:00:00.000Z',
  message: 'app service started',
  container: {
    id: 'abc123',
    name: 'app-svc-1',
    image: { name: 'registry.internal/app-svc-1:1.2.3' },
    labels: { 'com.docker.compose.project': 'app-svc-1' },
  },
  host: { name: 'host-a.internal', architecture: 'x86_64', containerized: false },
  agent: { name: 'filebeat', type: 'filebeat', version: '8.6.2' },
  log: { file: { path: '/var/lib/docker/containers/abc123/abc123-json.log' }, offset: 4096 },
  stream: 'stdout',
  input: { type: 'container' },
}

function line(partial: Partial<LogLine> = {}): LogLine {
  return { ts: 1_760_000_000_000, message: 'm', source: 'i', labels: {}, raw: '{}', id: 'x', ...partial }
}

describe('flattenLabels：嵌套对象要摊开，且「谁写的」排在前面', () => {
  it('filebeat 文档里能看出是哪台机器、哪个容器、哪个文件', () => {
    const labels = flattenLabels(FILEBEAT_DOC)
    expect(labels['container.name']).toBe('app-svc-1')
    expect(labels['container.image.name']).toBe('registry.internal/app-svc-1:1.2.3')
    expect(labels['host.name']).toBe('host-a.internal')
    expect(labels['log.file.path']).toBe('/var/lib/docker/containers/abc123/abc123-json.log')
    expect(labels['agent.name']).toBe('filebeat')
    expect(labels.stream).toBe('stdout')
  })

  it('优先键先占位：即使文档里别的字段更多，container / host 也在前几个', () => {
    const labels = flattenLabels({ ...FILEBEAT_DOC, zzz_first_alphabetically: 'x', aaa_second: 'y' })
    const keys = Object.keys(labels)
    expect(keys.indexOf('container.name')).toBeLessThan(3)
    expect(keys.indexOf('host.name')).toBeLessThan(5)
    expect(keys.length).toBeLessThanOrEqual(20)
  })

  it('上限生效，且不把优先键挤掉（只装得下 4 个时，先给名单里靠前的）', () => {
    const labels = flattenLabels({ ...FILEBEAT_DOC, extra1: 'a', extra2: 'b' }, { limit: 4 })
    expect(Object.keys(labels)).toEqual(['container.name', 'host.name', 'log.file.path', 'stream'])
  })

  it('已搬到显式字段上的键不进 labels（时间 / 正文 / 级别）', () => {
    const labels = flattenLabels({ '@timestamp': 'x', timestamp: 'y', message: 'z', level: 'error', 'log.level': 'error', keep: 'k' })
    expect(Object.keys(labels)).toEqual(['keep'])
  })

  it('标量数组拼成逗号串；空串丢掉；布尔与数字照收', () => {
    const labels = flattenLabels({ tags: ['a', 'b'], empty: '', ok: true, n: 4096 })
    expect(labels.tags).toBe('a,b')
    expect(labels.empty).toBeUndefined()
    expect(labels.ok).toBe('true')
    expect(labels.n).toBe('4096')
  })

  it('超长的值被截断（labels 不是放整段堆栈的地方，全文在 raw 里）', () => {
    const stack = 'x'.repeat(LABEL_VALUE_MAX + 50)
    const labels = flattenLabels({ stack_trace: stack })
    expect(labels.stack_trace.length).toBe(LABEL_VALUE_MAX + 1)
    expect(labels.stack_trace.endsWith('…')).toBe(true)
  })

  it('下钻有深度上限（不该把一棵深树整棵摊进 labels）', () => {
    const deep = { a: { b: { c: { d: { e: 'too deep' } } } } }
    const labels = flattenLabels(deep)
    expect(labels['a.b.c.d.e']).toBeUndefined()
    expect(labels['a.b.c']).toBeUndefined()
    expect(JSON.stringify(labels)).not.toContain('too deep')
  })

  it('优先键名单本身是「谁在写」这组，不是随手排的', () => {
    expect(LABEL_PRIORITY[0]).toBe('container.name')
    expect(LABEL_PRIORITY).toContain('host.name')
    expect(LABEL_PRIORITY).toContain('log.file.path')
    expect(LABEL_PRIORITY.length).toBeLessThanOrEqual(16)
  })
})

describe('级别：归一化、及以上语义、从正文推断', () => {
  it('各家写法归一成六个档', () => {
    expect(CANONICAL_LEVELS).toEqual(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
    expect(canonicalLevel('ERROR')).toBe('error')
    expect(canonicalLevel(' Warning ')).toBe('warn')
    expect(canonicalLevel('SEVERE')).toBe('error')
    expect(canonicalLevel('CRITICAL')).toBe('fatal')
    expect(canonicalLevel('dbg')).toBe('debug')
    expect(canonicalLevel(42)).toBeUndefined()
    expect(canonicalLevel('unknown-word')).toBeUndefined()
  })

  it('level=warn 是「warn 及以上」，但「没有级别」不算命中', () => {
    expect(levelMatches('ERROR', 'warn')).toBe(true)
    expect(levelMatches('warning', 'warn')).toBe(true)
    expect(levelMatches('fatal', 'error')).toBe(true)
    expect(levelMatches('info', 'warn')).toBe(false)
    expect(levelMatches(undefined, 'trace')).toBe(false)
    expect(levelMatches('', 'trace')).toBe(false)
    expect(levelHint('warn')).toBe('warn 及以上')
    expect(levelHint('fatal')).toBe('fatal')
  })

  it('从正文推断：真机里出现过的五种写法各有一条', () => {
    expect(inferLevel('[ERROR] app service failed')).toBe('error')
    expect(inferLevel('[INFO ] started in 3s')).toBe('info')
    expect(inferLevel('level=ERROR msg=boom')).toBe('error')
    expect(inferLevel('{"level":"warn","msg":"slow"}')).toBe('warn')
    expect(inferLevel('ERROR 2026-10-11 14:00:00 service down')).toBe('error')
    expect(inferLevel('2026-10-11 14:00:00.123 ERROR 12345 --- [main] c.x.Y : boom')).toBe('error')
    expect(inferLevel('WARN  2026-10-11 14:00:00 pool is full')).toBe('warn')
  })

  it('正文里「恰好提到」级别词不算——那正是用户点名不要的噪声', () => {
    expect(inferLevel('Propagating ERROR level on Logger[com.example.Foo]')).toBeUndefined()
    expect(inferLevel('see the ERROR section of the manual')).toBeUndefined()
    expect(inferLevel('nothing to see here')).toBeUndefined()
  })

  it('推断只认前 400 个字符（长正文不该被尾部的一次 ERROR 改写级别）', () => {
    expect(inferLevel('[INFO] ' + 'x'.repeat(500) + ' ERROR happened')).toBe('info')
  })

  it('withLevel：来源自己标的级别优先，没有才推断，并标出是推断来的', () => {
    const explicit = withLevel(line({ message: '[ERROR] boom' }), ['warning'])
    expect(explicit.level).toBe('warn')
    expect(explicit.levelInferred).toBeUndefined()

    const inferred = withLevel(line({ message: '[ERROR] boom' }), [undefined, null, ''])
    expect(inferred.level).toBe('error')
    expect(inferred.levelInferred).toBe(true)

    const none = withLevel(line({ message: 'just a message' }), [])
    expect(none.level).toBeUndefined()
    expect(none.levelInferred).toBeUndefined()
  })
})

describe('真机补的级别形态（2026-10-19，固定窗口 300 条里未分类从 139 降到 3）', () => {
  /*
   * 这两条都是"级别不在你以为的位置"：一条在 `|-` 之后（logback 自己的状态日志），
   * 一条在 JSON 的 `"log.level"` 键里（ECS 惯例带点，把原来的裸 `level` 模式打断了）。
   * 认不出来它们不会报错——它们会被当成"无级别"，然后在按级别筛时静默丢掉。
   */
  it('logback 状态日志：`18:31:54,850 |-INFO in ch.qos.logback…`', () => {
    expect(inferLevel('18:31:54,850 |-INFO in ch.qos.logback.classic.joran.action.ConfigurationAction - Adding from resource')).toBe('info')
    expect(inferLevel('18:31:54,849 |-WARN in ch.qos.logback.core.joran.spi.ConfigurationWatchList@1234 - URL is not of type URL')).toBe('warn')
  })

  it('JSON 正文：`{"log.level":"info",...}`', () => {
    expect(inferLevel('{"log.level":"info","@timestamp":"2026-10-19T10:00:00Z","message":"x"}')).toBe('info')
    expect(inferLevel('{"log.level":"error","message":"boom"}')).toBe('error')
    // 裸 level 的老形态仍然认（不许被新模式挤掉）
    expect(inferLevel('time=2026-10-19T04:34:25.204Z level=ERROR msg="x"')).toBe('error')
    expect(inferLevel('{"level":"warn"}')).toBe('warn')
  })
})

describe('堆栈续行判定（levelContinuation，真机 2026-10-19）', () => {
  /*
   * 采集侧没配 multiline 时，一次异常会被拆成多个文档：首文档带 `[ERROR] …`，其余是堆栈后半截。
   * 实测 400 条样本里 63% 属于后者，正文里没有任何级别词——按级别筛时它们被静默丢掉，
   * 用户看到的 error 数因此偏小。这里钉的是**判据本身**：只认堆栈语法，不靠"看起来像"。
   */
  it('堆栈后半截的几种形态都认', () => {
    const tails = [
      '\tat com.moan.cdc.EmsService.run(EmsService.java:42)',
      '\tat org.springframework.beans.factory.support.AbstractBeanFactory.doGetBean(AbstractBeanFactory.java:334)',
      'Caused by: java.lang.IllegalStateException: boom',
      '... 23 more',
      'Suppressed: java.io.IOException: closed',
      '### Error querying database.  Cause: org.opengauss.util.PSQLException',
      '### The error may exist in com/moan/cdc/emsservice/dao/ExamInfoMapper.java',
      // 真机补的两条：MyBatis 把一次异常拆成 11 条，这两条既没 ### 也不是 \tat
      'org.springframework.jdbc.BadSqlGrammarException: ',
      '; bad SQL grammar []',
    ]
    for (const tail of tails) expect(isContinuation(tail), tail).toBe(true)
  })

  it('正常日志**不许**被误标（误标会让它被排除在任何级别之外）', () => {
    const normal = [
      '[INFO ] [2026-10-19 18:27:30] [scheduling-1] ==> [TxId: , SpanId: ] 已释放分布式锁',
      '[ERROR] [2026-10-19 18:27:30] something failed',
      'time=2026-10-19T04:34:25.204Z level=ERROR msg="Failed to determine"',
      'plain log line without any level',
      '2026-10-19 18:27:30 INFO 12345 --- [main] started',
    ]
    for (const line of normal) expect(isContinuation(line), line).toBe(false)
  })

  it('首行带级别的堆栈**不算**续行（它是一条独立日志，只是后面跟了堆栈）', () => {
    const withStack = '[ERROR] [2026-10-19 18:27:30] failed\n\tat com.foo.Bar(Bar.java:1)'
    expect(isContinuation(withStack)).toBe(false)
  })

  it('withLevel 推断不出级别时才标续行；推断得出就标 levelInferred', () => {
    const tail = withLevel({ ts: 1, message: '\tat com.foo.Bar(Bar.java:1)', source: 's', labels: {}, raw: '', id: 'x' }, [])
    expect(tail.levelContinuation).toBe(true)
    expect(tail.level).toBeUndefined()
    const inferred = withLevel({ ts: 1, message: '[ERROR] boom', source: 's', labels: {}, raw: '', id: 'y' }, [])
    expect(inferred.level).toBe('error')
    expect(inferred.levelInferred).toBe(true)
    expect(inferred.levelContinuation).toBeUndefined()
  })
})
