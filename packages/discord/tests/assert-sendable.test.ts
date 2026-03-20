import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const testDir = join(tmpdir(), `channel-mux-sendable-test-${process.pid}`)

vi.mock('@claude-channel-mux/core', () => ({
  STATE_DIR: testDir,
  INBOX_DIR: join(testDir, 'inbox'),
  ACCESS_FILE: join(testDir, 'access.json'),
  ENV_FILE: join(testDir, '.env'),
  PID_FILE: join(testDir, 'daemon.pid'),
  SOCK_PATH: join(testDir, 'daemon.sock'),
  APPROVED_DIR: join(testDir, 'approved'),
}))

const { assertSendable } = await import('../src/utils.js')

describe('assertSendable()', () => {
  beforeEach(() => {
    mkdirSync(join(testDir, 'inbox'), { recursive: true })
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  it('allows files outside state dir', () => {
    const outsideFile = join(tmpdir(), 'safe-file.txt')
    writeFileSync(outsideFile, 'ok')
    expect(() => assertSendable(outsideFile)).not.toThrow()
    rmSync(outsideFile)
  })

  it('allows files inside inbox', () => {
    const inboxFile = join(testDir, 'inbox', 'download.png')
    writeFileSync(inboxFile, 'data')
    expect(() => assertSendable(inboxFile)).not.toThrow()
  })

  it('blocks files inside state dir (not inbox)', () => {
    const secretFile = join(testDir, 'access.json')
    writeFileSync(secretFile, '{}')
    expect(() => assertSendable(secretFile)).toThrow('refusing to send channel state')
  })

  it('blocks .env file', () => {
    const envFile = join(testDir, '.env')
    writeFileSync(envFile, 'TOKEN=secret')
    expect(() => assertSendable(envFile)).toThrow('refusing to send channel state')
  })

  it('does not throw for nonexistent files (realpath fails)', () => {
    expect(() => assertSendable('/nonexistent/path/file.txt')).not.toThrow()
  })
})
