import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const PACKAGES = ['core', 'discord', 'cli'] as const
type PackageName = (typeof PACKAGES)[number]

const ROOT = join(import.meta.dirname, '..', '..')
const TMP = join(tmpdir(), `channel-mux-smoke-${process.pid}`)
const tarballs: Partial<Record<PackageName, string>> = {}

function run(cmd: string, cwd?: string): string {
  return execSync(cmd, { cwd: cwd ?? ROOT, encoding: 'utf8', timeout: 30_000 }).trim()
}

function extractTarball(pkg: PackageName): string {
  const extracted = join(TMP, `${pkg}-check`)
  mkdirSync(extracted, { recursive: true })
  run(`tar xzf ${tarballs[pkg]} -C ${extracted}`)
  return join(extracted, 'package')
}

function getExports(pkg: PackageName): string {
  const indexPath = join(ROOT, `packages/${pkg}/dist/index.mjs`)
  return run(
    `node -e "import('${indexPath}').then(m => console.log(Object.keys(m).sort().join(',')))"`,
  )
}

describe('smoke tests', () => {
  beforeAll(() => {
    mkdirSync(TMP, { recursive: true })
    run('pnpm run build')

    for (const pkg of PACKAGES) {
      const pkgDir = join(ROOT, 'packages', pkg)
      const output = run(`pnpm pack --pack-destination ${TMP}`, pkgDir)
      const tarball = output.split('\n').pop()!
      tarballs[pkg] = tarball
    }
  }, 60_000)

  afterAll(() => {
    rmSync(TMP, { recursive: true, force: true })
  })

  it('pnpm pack produces tarballs for all packages', () => {
    for (const pkg of PACKAGES) {
      expect(tarballs[pkg]).toBeTruthy()
      expect(existsSync(tarballs[pkg]!)).toBe(true)
    }
  })

  it('core tarball contains dist/ with index.mjs and index.d.mts', () => {
    const pkgRoot = extractTarball('core')
    const distFiles = readdirSync(join(pkgRoot, 'dist'))
    expect(distFiles.some((f) => f.includes('index.mjs'))).toBe(true)
    expect(distFiles.some((f) => f.includes('index.d.mts'))).toBe(true)
  })

  it('discord tarball contains dist/, skills/, .claude-plugin/, .mcp.json', () => {
    const pkgRoot = extractTarball('discord')
    const contents = readdirSync(pkgRoot)
    expect(contents).toContain('dist')
    expect(contents).toContain('skills')
    expect(contents).toContain('.claude-plugin')
    expect(contents).toContain('.mcp.json')
  })

  it('cli tarball contains dist/ with cli.mjs', () => {
    const pkgRoot = extractTarball('cli')
    const distFiles = readdirSync(join(pkgRoot, 'dist'))
    expect(distFiles.some((f) => f.includes('cli.mjs'))).toBe(true)
  })

  it('core exports resolve correctly', () => {
    const result = getExports('core')
    expect(result).toContain('IpcClient')
    expect(result).toContain('IpcServer')
    expect(result).toContain('evaluateGate')
    expect(result).toContain('SOCK_PATH')
  })

  it('discord exports resolve correctly', () => {
    const result = getExports('discord')
    expect(result).toContain('DiscordAdapter')
    expect(result).toContain('chunk')
  })

  it('channel-mux daemon status command works', () => {
    const result = run('node packages/cli/dist/cli.mjs daemon status')
    expect(result).toContain('channel-mux daemon')
  })

  it('channel-mux daemon group add/list/rm works', () => {
    const fakeHome = join(TMP, 'fake-home')
    mkdirSync(join(fakeHome, '.claude', 'channels', 'channel-mux'), { recursive: true })
    const cli = `HOME=${fakeHome} node packages/cli/dist/cli.mjs`

    const addResult = run(`${cli} daemon group add 111 222 333`)
    expect(addResult).toContain('Added 3 channel(s)')

    const addDupe = run(`${cli} daemon group add 111 444`)
    expect(addDupe).toContain('Added 1 channel(s)')

    const listResult = run(`${cli} daemon group list`)
    expect(listResult).toContain('111')
    expect(listResult).toContain('222')
    expect(listResult).toContain('444')

    const rmResult = run(`${cli} daemon group rm 222 333`)
    expect(rmResult).toContain('Removed 2 channel(s)')

    const listAfter = run(`${cli} daemon group list`)
    expect(listAfter).toContain('111')
    expect(listAfter).toContain('444')
    expect(listAfter).not.toContain('222')
  })

  it('channel-mux daemon group add --no-mention sets requireMention false', () => {
    const fakeHome = join(TMP, 'fake-home-mention')
    mkdirSync(join(fakeHome, '.claude', 'channels', 'channel-mux'), { recursive: true })
    const cli = `HOME=${fakeHome} node packages/cli/dist/cli.mjs`

    run(`${cli} daemon group add 555 --no-mention`)
    const listResult = run(`${cli} daemon group list`)
    expect(listResult).toContain('555')
    expect(listResult).not.toContain('mention-required')
  })

  it('channel-mux session shows env vars', () => {
    const fakeHome = join(TMP, 'fake-home-session')
    mkdirSync(join(fakeHome, '.claude', 'channels', 'channel-mux'), { recursive: true })
    const cli = `HOME=${fakeHome} node packages/cli/dist/cli.mjs`

    const envResult = run(
      `CHANNEL_MUX_CHANNELS=111,222 CHANNEL_MUX_HANDLE_DMS=true ${cli} session`,
    )
    expect(envResult).toContain('env:')
    expect(envResult).toContain('channels: 111,222')
    expect(envResult).toContain('DMs: true')
  })

  it('channel-mux session shows .mcp.json config', () => {
    const fakeHome = join(TMP, 'fake-home-session-mcp')
    const fakeProject = join(TMP, 'fake-project')
    mkdirSync(join(fakeHome, '.claude', 'channels', 'channel-mux'), { recursive: true })
    mkdirSync(join(fakeProject, '.claude'), { recursive: true })
    writeFileSync(
      join(fakeProject, '.claude', '.mcp.json'),
      JSON.stringify({
        mcpServers: { 'channel-mux': { env: { CHANNEL_MUX_CHANNELS: '999' } } },
      }),
    )
    const result = run(
      `cd ${fakeProject} && HOME=${fakeHome} node ${join(ROOT, 'packages/cli/dist/cli.mjs')} session`,
    )
    expect(result).toContain('local')
    expect(result).toContain('999')
  })

  it('channel-mux session shows no config message when empty', () => {
    const fakeHome = join(TMP, 'fake-home-session-empty')
    mkdirSync(join(fakeHome, '.claude', 'channels', 'channel-mux'), { recursive: true })
    const cli = `HOME=${fakeHome} CHANNEL_MUX_CHANNELS= CHANNEL_MUX_HANDLE_DMS= node packages/cli/dist/cli.mjs`

    const result = run(`${cli} session`)
    expect(result).toContain('No channel-mux session config found')
  })

  it('channel-mux-plugin exits with correct error (no daemon)', () => {
    try {
      run('node packages/discord/dist/plugin.mjs')
      expect.unreachable('should have thrown')
    } catch (err: unknown) {
      const msg = (err as Error).message ?? String(err)
      expect(msg).toContain('cannot connect to daemon')
    }
  })
})
