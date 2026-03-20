import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { loadEnvFile } from '../src/config.js'

describe('loadEnvFile()', () => {
  const testDir = join(tmpdir(), `channel-mux-test-${process.pid}`)
  const envPath = join(testDir, '.env')

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
    // Clean up any env vars we set
    delete process.env.TEST_CMX_FOO
    delete process.env.TEST_CMX_BAR
    delete process.env.TEST_CMX_EXISTING
  })

  it('parses KEY=VALUE lines', () => {
    writeFileSync(envPath, 'TEST_CMX_FOO=hello\nTEST_CMX_BAR=world\n')
    loadEnvFile(envPath)
    expect(process.env.TEST_CMX_FOO).toBe('hello')
    expect(process.env.TEST_CMX_BAR).toBe('world')
  })

  it('does not overwrite existing env vars', () => {
    process.env.TEST_CMX_EXISTING = 'original'
    writeFileSync(envPath, 'TEST_CMX_EXISTING=overwritten\n')
    loadEnvFile(envPath)
    expect(process.env.TEST_CMX_EXISTING).toBe('original')
  })

  it('ignores blank lines and comments', () => {
    writeFileSync(envPath, '\n# comment\nTEST_CMX_FOO=val\n\n')
    loadEnvFile(envPath)
    expect(process.env.TEST_CMX_FOO).toBe('val')
  })

  it('handles missing file gracefully', () => {
    expect(() => loadEnvFile(join(testDir, 'nonexistent'))).not.toThrow()
  })

  it('handles values with equals signs', () => {
    writeFileSync(envPath, 'TEST_CMX_FOO=a=b=c\n')
    loadEnvFile(envPath)
    expect(process.env.TEST_CMX_FOO).toBe('a=b=c')
  })

  it('handles empty values', () => {
    writeFileSync(envPath, 'TEST_CMX_FOO=\n')
    loadEnvFile(envPath)
    expect(process.env.TEST_CMX_FOO).toBe('')
  })
})
