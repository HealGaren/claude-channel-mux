import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { Access } from '@claude-channel-mux/core'

// Mock config paths before importing access module
const testDir = join(tmpdir(), `channel-mux-access-test-${process.pid}`)
const accessFile = join(testDir, 'access.json')

vi.mock('@claude-channel-mux/core', () => ({
  DEFAULT_ACCESS: { dmPolicy: 'pairing', allowFrom: [], groups: {}, pending: {} },
  STATE_DIR: testDir,
  ACCESS_FILE: accessFile,
  APPROVED_DIR: join(testDir, 'approved'),
  INBOX_DIR: join(testDir, 'inbox'),
  ENV_FILE: join(testDir, '.env'),
  PID_FILE: join(testDir, 'daemon.pid'),
  SOCK_PATH: join(testDir, 'daemon.sock'),
}))

// Import after mock
const { readAccessFile, saveAccess, pruneExpired } = await import(
  '../src/access.js'
)

describe('access file operations', () => {
  beforeEach(() => {
    mkdirSync(testDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  it('returns defaults when file is missing', () => {
    const access = readAccessFile()
    expect(access.dmPolicy).toBe('pairing')
    expect(access.allowFrom).toEqual([])
    expect(access.groups).toEqual({})
    expect(access.pending).toEqual({})
  })

  it('reads existing access file', () => {
    const data: Access = {
      dmPolicy: 'allowlist',
      allowFrom: ['user-1'],
      groups: { 'ch-1': { requireMention: true, allowFrom: [] } },
      pending: {},
    }
    writeFileSync(accessFile, JSON.stringify(data))
    const access = readAccessFile()
    expect(access.dmPolicy).toBe('allowlist')
    expect(access.allowFrom).toEqual(['user-1'])
  })

  it('saves access file with pretty print', () => {
    const data: Access = {
      dmPolicy: 'pairing',
      allowFrom: ['user-1'],
      groups: {},
      pending: {},
    }
    saveAccess(data)
    const raw = readFileSync(accessFile, 'utf8')
    expect(raw).toContain('  ')  // indented
    const parsed = JSON.parse(raw)
    expect(parsed.allowFrom).toEqual(['user-1'])
  })
})

describe('pruneExpired()', () => {
  it('removes expired pending entries', () => {
    const access: Access = {
      dmPolicy: 'pairing',
      allowFrom: [],
      groups: {},
      pending: {
        abc123: {
          senderId: 'u1',
          chatId: 'ch1',
          createdAt: Date.now() - 7200000,
          expiresAt: Date.now() - 3600000,  // expired 1h ago
          replies: 1,
        },
        def456: {
          senderId: 'u2',
          chatId: 'ch2',
          createdAt: Date.now(),
          expiresAt: Date.now() + 3600000,  // expires in 1h
          replies: 1,
        },
      },
    }
    const changed = pruneExpired(access)
    expect(changed).toBe(true)
    expect(access.pending).not.toHaveProperty('abc123')
    expect(access.pending).toHaveProperty('def456')
  })

  it('returns false when nothing to prune', () => {
    const access: Access = {
      dmPolicy: 'pairing',
      allowFrom: [],
      groups: {},
      pending: {
        abc123: {
          senderId: 'u1',
          chatId: 'ch1',
          createdAt: Date.now(),
          expiresAt: Date.now() + 3600000,
          replies: 1,
        },
      },
    }
    expect(pruneExpired(access)).toBe(false)
  })
})
