import { mkdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { GateResult, InboundMsg, PlatformAdapter } from '@claude-channel-mux/core'
import { createDebug, INBOX_DIR } from '@claude-channel-mux/core'
import {
  AttachmentBuilder,
  ChannelType,
  Client,
  type DMChannel,
  GatewayIntentBits,
  type Message,
  Partials,
  type TextChannel,
  type ThreadChannel,
} from 'discord.js'
import { checkApprovals, gate as gateCheck, readAccessFile } from './access.js'
import {
  assertSendable,
  chunk,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENT_COUNT,
  MAX_CHUNK_LIMIT,
  noteSent,
  safeAttName,
} from './utils.js'

type SendableChannel = TextChannel | DMChannel | ThreadChannel

const dbg = createDebug('mux:discord')

export class DiscordAdapter implements PlatformAdapter {
  name = 'discord'
  private client: Client
  private messageHandler: ((msg: InboundMsg) => void) | null = null
  private recentSentIds = new Set<string>()
  private approvalInterval: ReturnType<typeof setInterval> | null = null

  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
      partials: [Partials.Channel],
    })
  }

  async connect(token: string): Promise<void> {
    this.client.on('messageCreate', (msg) => this.handleMessageCreate(msg))

    await this.client.login(token)

    await new Promise<void>((resolve) => {
      if (this.client.isReady()) {
        resolve()
      } else {
        this.client.once('ready', () => resolve())
      }
    })

    // Start polling for pairing approvals
    this.approvalInterval = setInterval(() => {
      checkApprovals((id) => this.fetchTextChannel(id))
    }, 5000)

    process.stderr.write(`channel-mux discord: logged in as ${this.client.user?.tag}\n`)
  }

  async disconnect(): Promise<void> {
    if (this.approvalInterval) {
      clearInterval(this.approvalInterval)
      this.approvalInterval = null
    }
    this.client.destroy()
  }

  onMessage(handler: (msg: InboundMsg) => void): void {
    this.messageHandler = handler
  }

  async reply(args: {
    chat_id: string
    text: string
    reply_to?: string
    files?: string[]
  }): Promise<{ sentIds: string[] }> {
    const ch = await this.fetchAllowedChannel(args.chat_id)
    const access = readAccessFile()
    const limit = Math.max(1, Math.min(access.textChunkLimit ?? MAX_CHUNK_LIMIT, MAX_CHUNK_LIMIT))
    const mode = access.chunkMode ?? 'length'
    const replyMode = access.replyToMode ?? 'first'
    const chunks = chunk(args.text, limit, mode)

    // Prepare file attachments
    const fileAttachments: AttachmentBuilder[] = []
    if (args.files) {
      for (const f of args.files.slice(0, MAX_ATTACHMENT_COUNT)) {
        assertSendable(f)
        const stat = statSync(f)
        if (stat.size > MAX_ATTACHMENT_BYTES) {
          throw new Error(
            `file too large: ${(stat.size / 1024 / 1024).toFixed(1)}MB, max ${MAX_ATTACHMENT_BYTES / 1024 / 1024}MB`,
          )
        }
        fileAttachments.push(new AttachmentBuilder(f))
      }
    }

    const sentIds: string[] = []
    for (let i = 0; i < chunks.length; i++) {
      const shouldReplyTo =
        args.reply_to != null && replyMode !== 'off' && (replyMode === 'all' || i === 0)

      const sent = await ch.send({
        content: chunks[i],
        ...(i === 0 && fileAttachments.length > 0 ? { files: fileAttachments } : {}),
        ...(shouldReplyTo
          ? { reply: { messageReference: args.reply_to!, failIfNotExists: false } }
          : {}),
      })
      noteSent(this.recentSentIds, sent.id)
      sentIds.push(sent.id)
    }

    return { sentIds }
  }

  async react(args: { chat_id: string; message_id: string; emoji: string }): Promise<void> {
    const ch = await this.fetchAllowedChannel(args.chat_id)
    const msg = await ch.messages.fetch(args.message_id)
    await msg.react(args.emoji)
  }

  async editMessage(args: {
    chat_id: string
    message_id: string
    text: string
  }): Promise<{ editedId: string }> {
    const ch = await this.fetchAllowedChannel(args.chat_id)
    const msg = await ch.messages.fetch(args.message_id)
    if (msg.author.id !== this.client.user?.id) {
      throw new Error('can only edit own messages')
    }
    await msg.edit(args.text)
    return { editedId: msg.id }
  }

  async fetchMessages(args: { channel: string; limit?: number }): Promise<string> {
    const ch = await this.fetchAllowedChannel(args.channel)
    const limit = Math.min(args.limit ?? 20, 100)
    const messages = await ch.messages.fetch({ limit })

    const lines = messages
      .reverse()
      .map(
        (m) =>
          `[${m.createdAt.toISOString()}] ${m.author.username}: ${m.content}` +
          (m.attachments.size > 0 ? ` [${m.attachments.size} attachment(s)]` : ''),
      )

    return lines.join('\n')
  }

  async downloadAttachment(args: {
    chat_id: string
    message_id: string
  }): Promise<{ paths: string[]; descriptions: string[] }> {
    const ch = await this.fetchAllowedChannel(args.chat_id)
    const msg = await ch.messages.fetch(args.message_id)

    if (msg.attachments.size === 0) {
      return { paths: [], descriptions: ['no attachments on this message'] }
    }

    mkdirSync(INBOX_DIR, { recursive: true })
    const paths: string[] = []
    const descriptions: string[] = []

    for (const att of msg.attachments.values()) {
      if (att.size > MAX_ATTACHMENT_BYTES) {
        descriptions.push(
          `${att.name}: too large (${(att.size / 1024 / 1024).toFixed(1)}MB, max ${MAX_ATTACHMENT_BYTES / 1024 / 1024}MB)`,
        )
        continue
      }

      const res = await fetch(att.url)
      const buf = Buffer.from(await res.arrayBuffer())
      const name = safeAttName(att)
      const rawExt = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : 'bin'
      const ext = rawExt.replace(/[^a-zA-Z0-9]/g, '') || 'bin'
      const path = join(INBOX_DIR, `${Date.now()}-${att.id}.${ext}`)
      writeFileSync(path, buf)
      paths.push(path)
      descriptions.push(`${att.name} → ${path}`)
    }

    return { paths, descriptions }
  }

  async gate(rawMsg: { platform: string; raw: unknown }): Promise<GateResult> {
    return gateCheck(rawMsg.raw as Message, this.client, this.recentSentIds)
  }

  async sendPairingCode(channelId: string, code: string, isResend: boolean): Promise<void> {
    try {
      const ch = await this.client.channels.fetch(channelId)
      if (ch && 'send' in ch && typeof ch.send === 'function') {
        const prefix = isResend ? 'Pairing code (resent)' : 'Pairing code'
        await ch.send(
          `${prefix}: **${code}**\nAsk the Claude Code user to run: \`/channel-mux:access pair ${code}\``,
        )
      }
    } catch (err) {
      process.stderr.write(`channel-mux discord: failed to send pairing code: ${err}\n`)
    }
  }

  get botUsername(): string {
    return this.client.user?.username ?? 'channel-mux-bot'
  }

  private async handleMessageCreate(msg: Message): Promise<void> {
    // Ignore own messages
    if (msg.author.id === this.client.user?.id) return
    // Ignore bots
    if (msg.author.bot) return

    const gateResult = await this.gate({ platform: 'discord', raw: msg })
    dbg('gate', `channel=${msg.channelId}`, `user=${msg.author.id}`, `action=${gateResult.action}`)

    if (gateResult.action === 'pair') {
      await this.sendPairingCode(msg.channelId, gateResult.code, gateResult.isResend)
      return
    }

    if (gateResult.action === 'drop') return

    // Ack reaction (fire-and-forget)
    const access = gateResult.access
    if (access.ackReaction) {
      msg.react(access.ackReaction).catch(() => {})
    }

    // Send typing indicator
    try {
      if ('sendTyping' in msg.channel) {
        await msg.channel.sendTyping()
      }
    } catch {}

    // Convert to InboundMsg
    const isDM = msg.channel.type === ChannelType.DM
    const attachments = msg.attachments.map((att) => ({
      name: safeAttName(att),
      contentType: att.contentType ?? 'application/octet-stream',
      size: att.size,
    }))

    const inbound: InboundMsg = {
      type: 'inbound',
      channelId: msg.channelId,
      messageId: msg.id,
      content: msg.content,
      userId: msg.author.id,
      username: msg.author.username,
      timestamp: msg.createdAt.toISOString(),
      attachments,
      isDM,
    }

    if (this.messageHandler) {
      this.messageHandler(inbound)
    }
  }

  private async fetchTextChannel(id: string): Promise<SendableChannel> {
    const ch = await this.client.channels.fetch(id)
    if (!ch) throw new Error(`channel ${id} not found`)
    if (
      ch.type !== ChannelType.GuildText &&
      ch.type !== ChannelType.DM &&
      ch.type !== ChannelType.PublicThread &&
      ch.type !== ChannelType.PrivateThread
    ) {
      throw new Error(`channel ${id} is not a text channel`)
    }
    return ch as SendableChannel
  }

  private async fetchAllowedChannel(id: string): Promise<SendableChannel> {
    const ch = await this.fetchTextChannel(id)
    const access = readAccessFile()

    if (ch.type === ChannelType.DM) {
      const recipientId = ch.recipientId
      if (recipientId && access.allowFrom.includes(recipientId)) return ch
    } else {
      const key = ch.isThread() ? ((ch as ThreadChannel).parentId ?? ch.id) : ch.id
      if (key in access.groups) return ch
    }

    throw new Error(`channel ${id} is not allowlisted — add via /channel-mux:access`)
  }
}
