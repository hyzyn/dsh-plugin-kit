/**
 * @hyzyn/dsh-profile — DSH Web GUI 的 Profile 管理插件（宿主半体）。
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'

export const name = 'profile-manager'
export const inject: string[] = []

export interface Config {
  enabled?: boolean
  announceToAgent?: boolean
}

/* ------------------------------------------------------------------ *
 * 常量与类型
 * ------------------------------------------------------------------ */

const PROFILE_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
const RESERVED_PROFILE_NAMES = new Set(['node_modules', '.', '..'])
const MAX_JSON_BODY_BYTES = 512 * 1024
const DEFAULT_BUNDLES = ['@deepseek-ai/dsh-base']
const PROFILE_TEMPLATES: Record<string, string[]> = {
  web: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'],
  headless: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-headless'],
}

const dshHome = () => process.env.DSH_HOME?.trim() || join(homedir(), '.dsh')
const profilesRoot = () => join(dshHome(), 'profiles')
const profileDir = (name: string) => join(profilesRoot(), name)

interface ProfileInfo {
  name: string
  initialized: boolean
  packageJson: boolean
  patchExists: boolean
  bundles: string[]
  dependencies: Record<string, string>
  dir: string
}

/* ------------------------------------------------------------------ *
 * 文件读写
 * ------------------------------------------------------------------ */

function isValidProfileName(name: unknown): name is string {
  if (typeof name !== 'string') return false
  const trimmed = name.trim()
  return PROFILE_NAME_RE.test(trimmed) && !RESERVED_PROFILE_NAMES.has(trimmed)
}

function readProfileInfo(name: string): ProfileInfo {
  const dir = profileDir(name)
  const manifestPath = join(dir, 'package.json')
  const patchPath = join(dir, 'cordis.patch.yml')
  const packageJson = existsSync(manifestPath)
  let bundles: string[] = []
  let dependencies: Record<string, string> = {}
  if (packageJson) {
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
        dsh?: { profile?: { bundles?: unknown } }
        dependencies?: Record<string, unknown>
      }
      if (Array.isArray(manifest.dsh?.profile?.bundles)) {
        bundles = manifest.dsh.profile.bundles.filter((item): item is string => typeof item === 'string')
      }
      dependencies = Object.fromEntries(
        Object.entries(manifest.dependencies ?? {}).map(([key, value]) => [key, String(value)]),
      )
    } catch {
      /* 解析失败时仍展示目录，bundles/dependencies 为空 */
    }
  }
  return {
    name,
    initialized: packageJson,
    packageJson,
    patchExists: existsSync(patchPath),
    bundles,
    dependencies,
    dir,
  }
}

function listProfiles(): ProfileInfo[] {
  const root = profilesRoot()
  if (!existsSync(root)) return []
  const names = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !RESERVED_PROFILE_NAMES.has(entry.name))
    .map((entry) => entry.name)
    .sort()
  return names.map(readProfileInfo)
}

function ensureProfilesRoot(): void {
  mkdirSync(profilesRoot(), { recursive: true })
}

/** 与 dsh-app-boot 的 initProfile 对齐：创建最小可用的 profile 目录。 */
function createProfile(name: string, template?: string): void {
  const dir = profileDir(name)
  ensureProfilesRoot()
  if (existsSync(join(dir, 'package.json'))) {
    throw new Error('profile 已存在: ' + name)
  }
  mkdirSync(dir, { recursive: true })
  const bundles = (template !== undefined && PROFILE_TEMPLATES[template] !== undefined)
    ? PROFILE_TEMPLATES[template]
    : DEFAULT_BUNDLES
  const manifest = {
    name: `dsh-profile-${name}`,
    private: true,
    dependencies: {},
    dsh: {
      profile: {
        bundles,
      },
    },
  }
  writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest, null, 2) + '\n')
  const patchPath = join(dir, 'cordis.patch.yml')
  if (!existsSync(patchPath)) {
    writeFileSync(
      patchPath,
      [
        '# Your patch layer for this dsh profile, applied after every bundle layer:',
        '# a top-level YAML array of loader patch entries (id-targeted config',
        '# overrides, disables, and insert lists; `!!js` expressions allowed).',
        '',
        '[]',
        '',
      ].join('\n'),
    )
  }
  const workspacePath = join(dir, 'pnpm-workspace.yaml')
  if (!existsSync(workspacePath)) {
    writeFileSync(
      workspacePath,
      [
        'packages:',
        '  - .',
        '',
        'nodeLinker: hoisted',
        'autoInstallPeers: false',
        '',
      ].join('\n'),
    )
  }
}

function copyProfile(source: string, target: string): void {
  const src = profileDir(source)
  const dest = profileDir(target)
  if (!existsSync(join(src, 'package.json'))) {
    throw new Error('源 profile 不存在或未初始化: ' + source)
  }
  if (existsSync(join(dest, 'package.json'))) {
    throw new Error('目标 profile 已存在: ' + target)
  }
  ensureProfilesRoot()
  mkdirSync(dest, { recursive: true })
  const entries = readdirSync(src, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'pnpm-lock.yaml') continue
    const from = join(src, entry.name)
    const to = join(dest, entry.name)
    if (entry.isDirectory()) {
      cpSync(from, to, { recursive: true })
    } else {
      cpSync(from, to)
    }
  }
  const manifestPath = join(dest, 'package.json')
  if (existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { name?: string }
      manifest.name = `dsh-profile-${target}`
      writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
    } catch {
      /* 复制后改名失败不阻塞，目录仍可用 */
    }
  }
}

function deleteProfile(name: string): void {
  const dir = profileDir(name)
  if (!existsSync(dir)) {
    throw new Error('profile 不存在: ' + name)
  }
  rmSync(dir, { recursive: true, force: true })
}


function renameProfile(oldName: string, newName: string): void {
  const oldDir = profileDir(oldName)
  const newDir = profileDir(newName)
  if (!existsSync(oldDir)) {
    throw new Error('profile 不存在: ' + oldName)
  }
  if (existsSync(newDir)) {
    throw new Error('目标 profile 已存在: ' + newName)
  }
  ensureProfilesRoot()
  renameSync(oldDir, newDir)
  const manifestPath = join(newDir, 'package.json')
  if (existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { name?: string }
      manifest.name = `dsh-profile-${newName}`
      writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
    } catch {
      /* 改名后更新 manifest 失败不阻塞，目录已移动 */
    }
  }
}

/* ------------------------------------------------------------------ *
 * HTTP 路由（loopback-only 围栏）
 * ------------------------------------------------------------------ */

interface ReqLike {
  method?: string
  url?: string
  headers: Record<string, string | string[] | undefined>
  socket: { remoteAddress?: string }
}

interface ResLike {
  writeHead(status: number, headers?: Record<string, string>): void
  end(body?: string): void
}

function isLoopbackRequest(request: ReqLike): boolean {
  const address = request.socket.remoteAddress
  if (address !== '127.0.0.1' && address !== '::1' && address !== '::ffff:127.0.0.1') return false
  const host = request.headers.host
  if (typeof host !== 'string') return false
  let hostUrl: URL
  try {
    hostUrl = new URL('http://' + host)
  } catch {
    return false
  }
  if (hostUrl.hostname !== '127.0.0.1' && hostUrl.hostname !== 'localhost' && hostUrl.hostname !== '[::1]') return false
  if (request.headers['sec-fetch-site'] === 'cross-site') return false
  const origin = request.headers.origin
  if (origin === undefined) return true
  try {
    return new URL(origin).host === hostUrl.host
  } catch {
    return false
  }
}

function writeJson(res: ResLike, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'referrer-policy': 'no-referrer' })
  res.end(JSON.stringify(body))
}

async function readJsonBody(req: ReqLike & AsyncIterable<Uint8Array>): Promise<Record<string, unknown> | undefined> {
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for await (const chunk of req) {
      size += chunk.length
      if (size > MAX_JSON_BODY_BYTES) return undefined
      chunks.push(chunk)
    }
  } catch {
    return undefined
  }
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : undefined
  } catch {
    return undefined
  }
}

type RouteHandler = (req: ReqLike & AsyncIterable<Uint8Array>, res: ResLike) => Promise<void>

function makeRoutes(): Array<{ kind: 'exact'; path: string; handler: RouteHandler }> {
  const guard = (req: ReqLike, res: ResLike, method: string): boolean => {
    if (!isLoopbackRequest(req)) {
      writeJson(res, 403, { error: 'forbidden: loopback-only' })
      return false
    }
    if (req.method !== method) {
      writeJson(res, 405, { error: 'method not allowed: ' + String(req.method) })
      return false
    }
    return true
  }
  return [
    {
      kind: 'exact',
      path: '/api/dsh-profile/list',
      handler: async (req, res) => {
        if (!guard(req, res, 'GET')) return
        writeJson(res, 200, {
          ok: true,
          home: dshHome(),
          profilesRoot: profilesRoot(),
          profiles: listProfiles(),
        })
      },
    },
    {
      kind: 'exact',
      path: '/api/dsh-profile/create',
      handler: async (req, res) => {
        if (!guard(req, res, 'POST')) return
        const body = await readJsonBody(req)
        if (body === undefined) {
          writeJson(res, 400, { error: 'invalid JSON body' })
          return
        }
        const name = typeof body.name === 'string' ? body.name.trim() : ''
        if (!isValidProfileName(name)) {
          writeJson(res, 400, { error: '非法 profile 名称: ' + JSON.stringify(name) })
          return
        }
        const template = typeof body.template === 'string' ? body.template : undefined
        try {
          createProfile(name, template)
        } catch (error) {
          writeJson(res, 400, { error: error instanceof Error ? error.message : String(error) })
          return
        }
        writeJson(res, 200, { ok: true, profile: readProfileInfo(name) })
      },
    },
    {
      kind: 'exact',
      path: '/api/dsh-profile/duplicate',
      handler: async (req, res) => {
        if (!guard(req, res, 'POST')) return
        const body = await readJsonBody(req)
        if (body === undefined) {
          writeJson(res, 400, { error: 'invalid JSON body' })
          return
        }
        const name = typeof body.name === 'string' ? body.name.trim() : ''
        const from = typeof body.from === 'string' ? body.from.trim() : ''
        if (!isValidProfileName(name)) {
          writeJson(res, 400, { error: '非法 profile 名称: ' + JSON.stringify(name) })
          return
        }
        if (!isValidProfileName(from)) {
          writeJson(res, 400, { error: '非法源 profile 名称: ' + JSON.stringify(from) })
          return
        }
        try {
          copyProfile(from, name)
        } catch (error) {
          writeJson(res, 400, { error: error instanceof Error ? error.message : String(error) })
          return
        }
        writeJson(res, 200, { ok: true, profile: readProfileInfo(name) })
      },
    },
    {
      kind: 'exact',
      path: '/api/dsh-profile/rename',
      handler: async (req, res) => {
        if (!guard(req, res, 'POST')) return
        const body = await readJsonBody(req)
        if (body === undefined) {
          writeJson(res, 400, { error: 'invalid JSON body' })
          return
        }
        const name = typeof body.name === 'string' ? body.name.trim() : ''
        const newName = typeof body.newName === 'string' ? body.newName.trim() : ''
        if (!isValidProfileName(name)) {
          writeJson(res, 400, { error: '非法 profile 名称: ' + JSON.stringify(name) })
          return
        }
        if (!isValidProfileName(newName)) {
          writeJson(res, 400, { error: '非法新 profile 名称: ' + JSON.stringify(newName) })
          return
        }
        try {
          renameProfile(name, newName)
        } catch (error) {
          writeJson(res, 400, { error: error instanceof Error ? error.message : String(error) })
          return
        }
        writeJson(res, 200, { ok: true, profile: readProfileInfo(newName) })
      },
    },

    {
      kind: 'exact',
      path: '/api/dsh-profile/delete',
      handler: async (req, res) => {
        if (!guard(req, res, 'POST')) return
        const body = await readJsonBody(req)
        if (body === undefined) {
          writeJson(res, 400, { error: 'invalid JSON body' })
          return
        }
        const name = typeof body.name === 'string' ? body.name.trim() : ''
        if (!isValidProfileName(name)) {
          writeJson(res, 400, { error: '非法 profile 名称: ' + JSON.stringify(name) })
          return
        }
        try {
          deleteProfile(name)
        } catch (error) {
          writeJson(res, 400, { error: error instanceof Error ? error.message : String(error) })
          return
        }
        writeJson(res, 200, { ok: true, deleted: name })
      },
    },
  ]
}

/* ------------------------------------------------------------------ *
 * 插件本体
 * ------------------------------------------------------------------ */

const PROFILE_GUIDANCE = '本机已安装 dsh-profile-manager 插件（Profile 管理）：Web GUI 的 设置 → 插件 里有「Profile 管理」卡片，提供 DSH profile 的图形化管理（查看、创建、复制、删除）。Profile 是 $DSH_HOME/profiles 下的独立目录，每个 profile 拥有自己的 bundle 层与补丁文件；用户提到「profile / 配置文件 / 多环境」时即指本插件，请引导用户打开设置里的 Profile 卡片操作，而不是直接修改 ~/.dsh/profiles 目录。'

export function apply(ctx: Context, config?: Config): void {
  if (config?.enabled === false) return
  const routes = makeRoutes()
  const announce = config?.announceToAgent !== false

  ctx.inject(['webServer'], (webCtx: Context) => {
    webCtx.effect(() => {
      const server = (webCtx as unknown as { webServer: { register(route: { kind: string; path: string; handler: RouteHandler }): () => void } }).webServer
      const disposers = routes.map((route) => server.register(route))
      return () => {
        for (const dispose of disposers) {
          try {
            dispose()
          } catch {
            /* 释放失败不阻塞 */
          }
        }
      }
    }, 'dsh-profile-manager: routes')
  })

  if (announce) {
    ctx.inject(['systemPrompt'], (promptCtx: Context) => {
      promptCtx.effect(() => {
        const systemPrompt = (promptCtx as unknown as { systemPrompt: { section(options: { name: string; order?: number; text: string }): () => void } }).systemPrompt
        return systemPrompt.section({ name: 'plugin:dsh-profile-manager', order: 150, text: PROFILE_GUIDANCE })
      }, 'dsh-profile-manager: announcement')
    })
  }

  console.log('[dsh-profile-manager] mounted, profiles root: ' + profilesRoot())
}
