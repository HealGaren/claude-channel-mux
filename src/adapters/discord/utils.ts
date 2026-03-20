import { realpathSync } from 'node:fs'
import { join, sep } from 'node:path'
import { STATE_DIR, INBOX_DIR } from '../../core/config.js'
import type { Attachment } from 'discord.js'

export const MAX_CHUNK_LIMIT = 2000
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024
export const MAX_ATTACHMENT_COUNT = 10
export const RECENT_SENT_CAP = 200

export function chunk(text: string, limit: number, mode: 'length' | 'newline'): string[] {
  if (text.length <= limit) return [text]
  const out: string[] = []
  let rest = text
  while (rest.length > limit) {
    let cut = limit
    if (mode === 'newline') {
      const para = rest.lastIndexOf('\n\n', limit)
      const line = rest.lastIndexOf('\n', limit)
      const space = rest.lastIndexOf(' ', limit)
      cut = para > limit / 2 ? para : line > limit / 2 ? line : space > 0 ? space : limit
    }
    out.push(rest.slice(0, cut))
    rest = rest.slice(cut).replace(/^\n+/, '')
  }
  if (rest) out.push(rest)
  return out
}

export function assertSendable(f: string): void {
  let real: string, stateReal: string
  try {
    real = realpathSync(f)
    stateReal = realpathSync(STATE_DIR)
  } catch {
    return
  }
  const inbox = join(stateReal, 'inbox')
  if (real.startsWith(stateReal + sep) && !real.startsWith(inbox + sep)) {
    throw new Error(`refusing to send channel state: ${f}`)
  }
}

export function safeAttName(att: Attachment): string {
  return (att.name ?? att.id).replace(/[\[\]\r\n;]/g, '_')
}

export function noteSent(recentSentIds: Set<string>, id: string): void {
  recentSentIds.add(id)
  if (recentSentIds.size > RECENT_SENT_CAP) {
    const first = recentSentIds.values().next().value
    if (first) recentSentIds.delete(first)
  }
}
