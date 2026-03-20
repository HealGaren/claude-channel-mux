import type { Socket } from 'node:net'

// ─── Access Control ───

export type Access = {
  dmPolicy: 'pairing' | 'allowlist' | 'disabled'
  allowFrom: string[]
  groups: Record<string, GroupPolicy>
  pending: Record<string, PendingEntry>
  mentionPatterns?: string[]
  ackReaction?: string
  replyToMode?: 'off' | 'first' | 'all'
  textChunkLimit?: number
  chunkMode?: 'length' | 'newline'
}

export type GroupPolicy = {
  requireMention: boolean
  allowFrom: string[]
}

export type PendingEntry = {
  senderId: string
  chatId: string
  createdAt: number
  expiresAt: number
  replies: number
}

export const DEFAULT_ACCESS: Access = {
  dmPolicy: 'pairing',
  allowFrom: [],
  groups: {},
  pending: {},
}

// ─── IPC: Plugin → Daemon ───

export type RegisterMsg = {
  type: 'register'
  id: string
  sessionId: string
  channels: string[]
  handleDMs: boolean
}

export type ToolCallMsg = {
  type: 'tool_call'
  id: string
  sessionId: string
  tool: 'reply' | 'react' | 'edit_message' | 'fetch_messages' | 'download_attachment'
  args: Record<string, unknown>
}

export type UnregisterMsg = {
  type: 'unregister'
  sessionId: string
}

export type PingMsg = {
  type: 'ping'
  sessionId: string
}

export type PluginMessage = RegisterMsg | ToolCallMsg | UnregisterMsg | PingMsg

// ─── IPC: Daemon → Plugin ───

export type RegisterAckMsg = {
  type: 'register_ack'
  id: string
  ok: boolean
  error?: string
  botUsername?: string
}

export type InboundMsg = {
  type: 'inbound'
  channelId: string
  messageId: string
  content: string
  userId: string
  username: string
  timestamp: string
  attachments: Array<{ name: string; contentType: string; size: number }>
  isDM: boolean
}

export type ToolResultMsg = {
  type: 'tool_result'
  id: string
  ok: boolean
  result?: string
  sentIds?: string[]
  error?: string
}

export type PongMsg = {
  type: 'pong'
}

export type ShutdownMsg = {
  type: 'shutdown'
}

export type DaemonMessage = RegisterAckMsg | InboundMsg | ToolResultMsg | PongMsg | ShutdownMsg

// ─── IPC Session ───

export type Session = {
  sessionId: string
  socket: Socket
  channels: Set<string>
  handleDMs: boolean
}

// ─── Platform Adapter ───

export type GateResult =
  | { action: 'deliver'; access: Access }
  | { action: 'drop' }
  | { action: 'pair'; code: string; isResend: boolean }

export type RawPlatformMessage = {
  platform: string
  raw: unknown
}

export interface PlatformAdapter {
  name: string

  connect(token: string): Promise<void>
  disconnect(): Promise<void>
  onMessage(handler: (msg: InboundMsg) => void): void

  reply(args: {
    chat_id: string
    text: string
    reply_to?: string
    files?: string[]
  }): Promise<{ sentIds: string[] }>

  react(args: {
    chat_id: string
    message_id: string
    emoji: string
  }): Promise<void>

  editMessage(args: {
    chat_id: string
    message_id: string
    text: string
  }): Promise<{ editedId: string }>

  fetchMessages(args: {
    channel: string
    limit?: number
  }): Promise<string>

  downloadAttachment(args: {
    chat_id: string
    message_id: string
  }): Promise<{ paths: string[]; descriptions: string[] }>

  gate(msg: RawPlatformMessage): Promise<GateResult>
  sendPairingCode(channelId: string, code: string, isResend: boolean): Promise<void>
}

// ─── Tool call handler type (used by daemon to wire IPC → adapter) ───

export type ToolCallHandler = (
  tool: string,
  args: Record<string, unknown>,
) => Promise<Record<string, unknown>>
