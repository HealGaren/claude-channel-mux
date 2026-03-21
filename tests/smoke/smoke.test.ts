import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

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

  describe('CLI (isolated HOME)', () => {
    let fakeHome: string
    let cli: string
    let testIndex = 0

    beforeEach(() => {
      testIndex++
      fakeHome = join(TMP, `fake-home-${testIndex}`)
      mkdirSync(join(fakeHome, '.claude', 'channels', 'channel-mux'), { recursive: true })
      cli = `HOME=${fakeHome} node packages/cli/dist/cli.mjs`
    })

    it('daemon status', () => {
      const result = run(`${cli} daemon status`)
      expect(result).toContain('channel-mux daemon')
    })

    it('daemon group add/list/rm', () => {
      expect(run(`${cli} daemon group add 111 222 333`)).toContain('Added 3 channel(s)')
      expect(run(`${cli} daemon group add 111 444`)).toContain('Added 1 channel(s)')

      const list = run(`${cli} daemon group list`)
      expect(list).toContain('111')
      expect(list).toContain('222')
      expect(list).toContain('444')

      expect(run(`${cli} daemon group rm 222 333`)).toContain('Removed 2 channel(s)')

      const listAfter = run(`${cli} daemon group list`)
      expect(listAfter).toContain('111')
      expect(listAfter).toContain('444')
      expect(listAfter).not.toContain('222')
    })

    it('daemon group add --no-mention', () => {
      run(`${cli} daemon group add 555 --no-mention`)
      const list = run(`${cli} daemon group list`)
      expect(list).toContain('555')
      expect(list).not.toContain('mention-required')
    })

    it('session shows env vars', () => {
      const result = run(
        `CHANNEL_MUX_CHANNELS=111,222 CHANNEL_MUX_HANDLE_DMS=true ${cli} session`,
      )
      expect(result).toContain('env:')
      expect(result).toContain('channels: 111,222')
      expect(result).toContain('DMs: true')
    })

    it('session shows .mcp.json config', () => {
      const fakeProject = join(TMP, `fake-project-${testIndex}`)
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

    it('session channels writes .mcp.json', () => {
      const fakeProject = join(TMP, `fake-project-write-${testIndex}`)
      mkdirSync(join(fakeProject, '.claude'), { recursive: true })
      const cliCmd = `HOME=${fakeHome} node ${join(ROOT, 'packages/cli/dist/cli.mjs')}`

      const result = run(`cd ${fakeProject} && ${cliCmd} session channels 111 222 --scope=local`)
      expect(result).toContain('CHANNEL_MUX_CHANNELS=111,222')
      expect(result).toContain('local')

      const written = JSON.parse(readFileSync(join(fakeProject, '.claude', '.mcp.json'), 'utf8'))
      expect(written.mcpServers['channel-mux'].env.CHANNEL_MUX_CHANNELS).toBe('111,222')
    })

    it('session dms writes .mcp.json', () => {
      const fakeProject = join(TMP, `fake-project-dms-${testIndex}`)
      mkdirSync(fakeProject, { recursive: true })
      const cliCmd = `HOME=${fakeHome} node ${join(ROOT, 'packages/cli/dist/cli.mjs')}`

      const result = run(`cd ${fakeProject} && ${cliCmd} session dms true --scope=project`)
      expect(result).toContain('CHANNEL_MUX_HANDLE_DMS=true')
      expect(result).toContain('project')

      const written = JSON.parse(readFileSync(join(fakeProject, '.mcp.json'), 'utf8'))
      expect(written.mcpServers['channel-mux'].env.CHANNEL_MUX_HANDLE_DMS).toBe('true')
    })

    it('session channels preserves existing .mcp.json content', () => {
      const fakeProject = join(TMP, `fake-project-preserve-${testIndex}`)
      mkdirSync(join(fakeProject, '.claude'), { recursive: true })
      writeFileSync(
        join(fakeProject, '.claude', '.mcp.json'),
        JSON.stringify({ mcpServers: { other: { command: 'foo' } } }),
      )
      const cliCmd = `HOME=${fakeHome} node ${join(ROOT, 'packages/cli/dist/cli.mjs')}`

      run(`cd ${fakeProject} && ${cliCmd} session channels 555 --scope=local`)

      const written = JSON.parse(readFileSync(join(fakeProject, '.claude', '.mcp.json'), 'utf8'))
      expect(written.mcpServers.other.command).toBe('foo')
      expect(written.mcpServers['channel-mux'].env.CHANNEL_MUX_CHANNELS).toBe('555')
    })

    it('session shows no config when empty', () => {
      const result = run(`CHANNEL_MUX_CHANNELS= CHANNEL_MUX_HANDLE_DMS= ${cli} session`)
      expect(result).toContain('No channel-mux session config found')
    })

    it('plugin exits with correct error (no daemon)', () => {
      try {
        run(`HOME=${fakeHome} node packages/discord/dist/plugin.mjs`)
        expect.unreachable('should have thrown')
      } catch (err: unknown) {
        const msg = (err as Error).message ?? String(err)
        expect(msg).toContain('cannot connect to daemon')
      }
    })
  })
})
