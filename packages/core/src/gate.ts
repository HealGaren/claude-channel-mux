import { randomBytes } from 'node:crypto'
import type { Access, GateResult } from './types.js'

export type GateInput = {
  senderId: string
  channelId: string
  isDM: boolean
  isThread: boolean
  parentChannelId?: string
  isMentioned: boolean
}

/**
 * Pure gate logic: decides whether to deliver, drop, or pair based on
 * access policy and message metadata. No platform-specific dependencies.
 *
 * NOTE: when the result is 'pair', the caller is responsible for persisting
 * the updated access object (it mutates access.pending in place).
 */
export function evaluateGate(input: GateInput, access: Access): GateResult {
  const { senderId, channelId, isDM, isThread, parentChannelId, isMentioned } = input

  if (isDM) {
    if (access.dmPolicy === 'disabled') return { action: 'drop' }
    if (access.allowFrom.includes(senderId)) return { action: 'deliver', access }
    if (access.dmPolicy === 'allowlist') return { action: 'drop' }

    // Pairing mode: check existing pending code for this sender
    for (const [code, p] of Object.entries(access.pending)) {
      if (p.senderId === senderId) {
        if ((p.replies ?? 1) >= 2) return { action: 'drop' }
        p.replies = (p.replies ?? 1) + 1
        return { action: 'pair', code, isResend: true }
      }
    }
    if (Object.keys(access.pending).length >= 3) return { action: 'drop' }

    const code = randomBytes(3).toString('hex')
    const now = Date.now()
    access.pending[code] = {
      senderId,
      chatId: channelId,
      createdAt: now,
      expiresAt: now + 60 * 60 * 1000,
      replies: 1,
    }
    return { action: 'pair', code, isResend: false }
  }

  // Guild message
  const gateChannelId = isThread ? (parentChannelId ?? channelId) : channelId
  const policy = access.groups[gateChannelId]
  if (!policy) return { action: 'drop' }

  const groupAllowFrom = policy.allowFrom ?? []
  const requireMention = policy.requireMention ?? true

  if (groupAllowFrom.length > 0 && !groupAllowFrom.includes(senderId)) {
    return { action: 'drop' }
  }
  if (requireMention && !isMentioned) {
    return { action: 'drop' }
  }
  return { action: 'deliver', access }
}
