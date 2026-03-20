import { readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import {
  ACCESS_FILE,
  APPROVED_DIR,
  DEFAULT_ACCESS,
  evaluateGate,
  type Access,
  type GateResult,
} from '@claude-channel-mux/core'
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

  const isDM = msg.channel.type === ChannelType.DM
  const isThread = !isDM && msg.channel.isThread()

  // Resolve mention before calling pure gate logic (guild messages only)
  const mentioned = !isDM && await isMentioned(msg, client, recentSentIds, access.mentionPatterns)

  const result = evaluateGate({
    senderId: msg.author.id,
    channelId: msg.channelId,
    isDM,
    isThread,
    parentChannelId: isThread ? (msg.channel.parentId ?? undefined) : undefined,
    isMentioned: mentioned,
  }, access)

  // Persist access changes from pairing
  if (result.action === 'pair') {
    saveAccess(access)
  }

  return result
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
