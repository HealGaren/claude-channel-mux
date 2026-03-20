import { readFileSync, writeFileSync, readdirSync, rmSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { ACCESS_FILE, APPROVED_DIR } from '../../core/config.js'
import type { Access, GateResult } from '../../core/types.js'
import { DEFAULT_ACCESS } from '../../core/types.js'
import type { Client, Message } from 'discord.js'
import { ChannelType } from 'discord.js'

export function readAccessFile(): Access {
  try {
    const raw = readFileSync(ACCESS_FILE, 'utf8')
    return { ...DEFAULT_ACCESS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_ACCESS }
  }
}

export function saveAccess(a: Access): void {
  writeFileSync(ACCESS_FILE, JSON.stringify(a, null, 2) + '\n')
}

export function pruneExpired(a: Access): boolean {
  const now = Date.now()
  let changed = false
  for (const [code, entry] of Object.entries(a.pending)) {
    if (entry.expiresAt <= now) {
      delete a.pending[code]
      changed = true
    }
  }
  return changed
}

export async function gate(
  msg: Message,
  client: Client,
  recentSentIds: Set<string>,
): Promise<GateResult> {
  const access = readAccessFile()
  pruneExpired(access)

  const senderId = msg.author.id
  const isDM = msg.channel.type === ChannelType.DM

  if (isDM) {
    if (access.dmPolicy === 'disabled') return { action: 'drop' }
    if (access.allowFrom.includes(senderId)) return { action: 'deliver', access }
    if (access.dmPolicy === 'allowlist') return { action: 'drop' }

    // Pairing mode — check existing pending code for this sender
    for (const [code, p] of Object.entries(access.pending)) {
      if (p.senderId === senderId) {
        if ((p.replies ?? 1) >= 2) return { action: 'drop' }
        p.replies = (p.replies ?? 1) + 1
        saveAccess(access)
        return { action: 'pair', code, isResend: true }
      }
    }
    if (Object.keys(access.pending).length >= 3) return { action: 'drop' }

    const code = randomBytes(3).toString('hex')
    const now = Date.now()
    access.pending[code] = {
      senderId,
      chatId: msg.channelId,
      createdAt: now,
      expiresAt: now + 60 * 60 * 1000,
      replies: 1,
    }
    saveAccess(access)
    return { action: 'pair', code, isResend: false }
  }

  // Guild message
  const channelId = msg.channel.isThread()
    ? msg.channel.parentId ?? msg.channelId
    : msg.channelId
  const policy = access.groups[channelId]
  if (!policy) return { action: 'drop' }

  const groupAllowFrom = policy.allowFrom ?? []
  const requireMention = policy.requireMention ?? true

  if (groupAllowFrom.length > 0 && !groupAllowFrom.includes(senderId)) {
    return { action: 'drop' }
  }
  if (requireMention && !(await isMentioned(msg, client, recentSentIds, access.mentionPatterns))) {
    return { action: 'drop' }
  }
  return { action: 'deliver', access }
}

export async function isMentioned(
  msg: Message,
  client: Client,
  recentSentIds: Set<string>,
  extraPatterns?: string[],
): Promise<boolean> {
  if (client.user && msg.mentions.has(client.user)) return true

  const refId = msg.reference?.messageId
  if (refId) {
    if (recentSentIds.has(refId)) return true
    try {
      const ref = await msg.fetchReference()
      if (ref.author.id === client.user?.id) return true
    } catch {}
  }

  const text = msg.content
  for (const pat of extraPatterns ?? []) {
    try {
      if (new RegExp(pat, 'i').test(text)) return true
    } catch {}
  }
  return false
}

export function checkApprovals(
  fetchTextChannel: (id: string) => Promise<unknown>,
): void {
  let files: string[]
  try {
    files = readdirSync(APPROVED_DIR)
  } catch {
    return
  }
  if (files.length === 0) return

  for (const senderId of files) {
    const file = join(APPROVED_DIR, senderId)
    let dmChannelId: string
    try {
      dmChannelId = readFileSync(file, 'utf8').trim()
    } catch {
      rmSync(file, { force: true })
      continue
    }
    if (!dmChannelId) {
      rmSync(file, { force: true })
      continue
    }
    void (async () => {
      try {
        const ch = (await fetchTextChannel(dmChannelId)) as { send?: (s: string) => Promise<void> }
        if (ch && typeof ch.send === 'function') {
          await ch.send('Paired! Say hi to Claude.')
        }
        rmSync(file, { force: true })
      } catch (err) {
        process.stderr.write(`channel-mux: failed to send approval confirm: ${err}\n`)
        rmSync(file, { force: true })
      }
    })()
  }
}
