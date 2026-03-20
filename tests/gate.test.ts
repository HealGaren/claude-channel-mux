import { describe, it, expect } from 'vitest'
import { evaluateGate, type GateInput } from '../src/core/gate.js'
import type { Access } from '../src/core/types.js'

function makeAccess(overrides: Partial<Access> = {}): Access {
  return {
    dmPolicy: 'pairing',
    allowFrom: [],
    groups: {},
    pending: {},
    ...overrides,
  }
}

function makeInput(overrides: Partial<GateInput> = {}): GateInput {
  return {
    senderId: 'user-1',
    channelId: 'ch-1',
    isDM: false,
    isThread: false,
    isMentioned: false,
    ...overrides,
  }
}

describe('evaluateGate() DM', () => {
  it('delivers to allowlisted sender', () => {
    const access = makeAccess({ allowFrom: ['user-1'] })
    const result = evaluateGate(makeInput({ isDM: true }), access)
    expect(result.action).toBe('deliver')
  })

  it('drops when dmPolicy is disabled', () => {
    const access = makeAccess({ dmPolicy: 'disabled' })
    const result = evaluateGate(makeInput({ isDM: true }), access)
    expect(result.action).toBe('drop')
  })

  it('drops unknown sender when dmPolicy is allowlist', () => {
    const access = makeAccess({ dmPolicy: 'allowlist' })
    const result = evaluateGate(makeInput({ isDM: true }), access)
    expect(result.action).toBe('drop')
  })

  it('creates pairing code for unknown sender in pairing mode', () => {
    const access = makeAccess()
    const result = evaluateGate(makeInput({ isDM: true }), access)
    expect(result.action).toBe('pair')
    if (result.action === 'pair') {
      expect(result.isResend).toBe(false)
      expect(result.code).toHaveLength(6)
    }
    // access.pending should be mutated
    expect(Object.keys(access.pending)).toHaveLength(1)
  })

  it('resends existing code for same sender', () => {
    const access = makeAccess({
      pending: {
        abc123: {
          senderId: 'user-1',
          chatId: 'ch-1',
          createdAt: Date.now(),
          expiresAt: Date.now() + 3600000,
          replies: 1,
        },
      },
    })
    const result = evaluateGate(makeInput({ isDM: true }), access)
    expect(result.action).toBe('pair')
    if (result.action === 'pair') {
      expect(result.code).toBe('abc123')
      expect(result.isResend).toBe(true)
    }
    expect(access.pending.abc123.replies).toBe(2)
  })

  it('drops when sender has already received 2 replies', () => {
    const access = makeAccess({
      pending: {
        abc123: {
          senderId: 'user-1',
          chatId: 'ch-1',
          createdAt: Date.now(),
          expiresAt: Date.now() + 3600000,
          replies: 2,
        },
      },
    })
    const result = evaluateGate(makeInput({ isDM: true }), access)
    expect(result.action).toBe('drop')
  })

  it('drops when 3 pending codes already exist', () => {
    const access = makeAccess({
      pending: {
        aaa: { senderId: 'other-1', chatId: 'c', createdAt: 0, expiresAt: Date.now() + 3600000, replies: 1 },
        bbb: { senderId: 'other-2', chatId: 'c', createdAt: 0, expiresAt: Date.now() + 3600000, replies: 1 },
        ccc: { senderId: 'other-3', chatId: 'c', createdAt: 0, expiresAt: Date.now() + 3600000, replies: 1 },
      },
    })
    const result = evaluateGate(makeInput({ isDM: true }), access)
    expect(result.action).toBe('drop')
  })
})

describe('evaluateGate() guild', () => {
  it('drops when channel is not in groups', () => {
    const access = makeAccess()
    const result = evaluateGate(makeInput({ channelId: 'ch-unknown' }), access)
    expect(result.action).toBe('drop')
  })

  it('delivers when channel is in groups and no restrictions', () => {
    const access = makeAccess({
      groups: { 'ch-1': { requireMention: false, allowFrom: [] } },
    })
    const result = evaluateGate(makeInput(), access)
    expect(result.action).toBe('deliver')
  })

  it('drops when sender not in group allowFrom', () => {
    const access = makeAccess({
      groups: { 'ch-1': { requireMention: false, allowFrom: ['other-user'] } },
    })
    const result = evaluateGate(makeInput(), access)
    expect(result.action).toBe('drop')
  })

  it('delivers when sender is in group allowFrom', () => {
    const access = makeAccess({
      groups: { 'ch-1': { requireMention: false, allowFrom: ['user-1'] } },
    })
    const result = evaluateGate(makeInput(), access)
    expect(result.action).toBe('deliver')
  })

  it('drops when mention required but not mentioned', () => {
    const access = makeAccess({
      groups: { 'ch-1': { requireMention: true, allowFrom: [] } },
    })
    const result = evaluateGate(makeInput({ isMentioned: false }), access)
    expect(result.action).toBe('drop')
  })

  it('delivers when mention required and mentioned', () => {
    const access = makeAccess({
      groups: { 'ch-1': { requireMention: true, allowFrom: [] } },
    })
    const result = evaluateGate(makeInput({ isMentioned: true }), access)
    expect(result.action).toBe('deliver')
  })

  it('uses parent channel ID for thread messages', () => {
    const access = makeAccess({
      groups: { 'parent-ch': { requireMention: false, allowFrom: [] } },
    })
    const result = evaluateGate(makeInput({
      channelId: 'thread-ch',
      isThread: true,
      parentChannelId: 'parent-ch',
    }), access)
    expect(result.action).toBe('deliver')
  })

  it('falls back to thread channel ID when parent is missing', () => {
    const access = makeAccess({
      groups: { 'thread-ch': { requireMention: false, allowFrom: [] } },
    })
    const result = evaluateGate(makeInput({
      channelId: 'thread-ch',
      isThread: true,
      parentChannelId: undefined,
    }), access)
    expect(result.action).toBe('deliver')
  })
})
