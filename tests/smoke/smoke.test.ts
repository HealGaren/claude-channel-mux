import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const ROOT = join(import.meta.dirname, '..', '..')
const TMP = join(tmpdir(), `channel-mux-smoke-${process.pid}`)
const tarballs: Record<string, string> = {}

function run(cmd: string, cwd?: string): string {
  return execSync(cmd, { cwd: cwd ?? ROOT, encoding: 'utf8', timeout: 30_000 }).trim()
}

describe('smoke tests', () => {
  beforeAll(() => {
    mkdirSync(TMP, { recursive: true })

    // Build all packages
    run('pnpm run build')

    // Pack each package into tarball
    for (const pkg of ['core', 'discord', 'cli']) {
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
    expect(tarballs.core).toBeTruthy()
    expect(tarballs.discord).toBeTruthy()
    expect(tarballs.cli).toBeTruthy()

    for (const tarball of Object.values(tarballs)) {
      expect(existsSync(tarball)).toBe(true)
    }
  })

  it('core tarball contains dist/ with index.mjs and index.d.mts', () => {
    const extracted = join(TMP, 'core-check')
    mkdirSync(extracted, { recursive: true })
    run(`tar xzf ${tarballs.core} -C ${extracted}`)

    const distFiles = readdirSync(join(extracted, 'package', 'dist'))
    expect(distFiles.some((f) => f.includes('index.mjs'))).toBe(true)
    expect(distFiles.some((f) => f.includes('index.d.mts'))).toBe(true)
  })

  it('discord tarball contains dist/, skills/, .claude-plugin/', () => {
    const extracted = join(TMP, 'discord-check')
    mkdirSync(extracted, { recursive: true })
    run(`tar xzf ${tarballs.discord} -C ${extracted}`)

    const contents = readdirSync(join(extracted, 'package'))
    expect(contents).toContain('dist')
    expect(contents).toContain('skills')
    expect(contents).toContain('.claude-plugin')
  })

  it('cli tarball contains dist/ with cli.mjs', () => {
    const extracted = join(TMP, 'cli-check')
    mkdirSync(extracted, { recursive: true })
    run(`tar xzf ${tarballs.cli} -C ${extracted}`)

    const distFiles = readdirSync(join(extracted, 'package', 'dist'))
    expect(distFiles.some((f) => f.includes('cli.mjs'))).toBe(true)
  })

  it('core exports resolve correctly', () => {
    const coreIndex = join(ROOT, 'packages/core/dist/index.mjs')
    const result = run(
      `node -e "import('${coreIndex}').then(m => console.log(Object.keys(m).sort().join(',')))"`,
    )
    expect(result).toContain('IpcClient')
    expect(result).toContain('IpcServer')
    expect(result).toContain('evaluateGate')
    expect(result).toContain('SOCK_PATH')
  })

  it('discord exports resolve correctly', () => {
    const discordIndex = join(ROOT, 'packages/discord/dist/index.mjs')
    const result = run(
      `node -e "import('${discordIndex}').then(m => console.log(Object.keys(m).sort().join(',')))"`,
    )
    expect(result).toContain('DiscordAdapter')
    expect(result).toContain('chunk')
  })

  it('channel-mux status command works', () => {
    const result = run('node packages/cli/dist/cli.mjs status')
    expect(result).toContain('channel-mux daemon')
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
