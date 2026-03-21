import { unlinkSync } from 'node:fs'
import net from 'node:net'
import { createDebug } from './debug.js'
import type {
  DaemonMessage,
  InboundMsg,
  PluginMessage,
  RegisterMsg,
  Session,
  ToolCallHandler,
  ToolCallMsg,
  UnregisterMsg,
} from './types.js'

const dbg = createDebug('mux:ipc-server')

export class IpcServer {
  private server: net.Server | null = null
  private sessions = new Map<string, Session>()
  private channelToSession = new Map<string, string>()
  private dmSessionId: string | null = null
  private socketToSession = new Map<net.Socket, string>()
  private toolCallHandler: ToolCallHandler | null = null
  private botUsername: string | null = null

  constructor(private sockPath: string) {}

  start(): void {
    try {
      unlinkSync(this.sockPath)
    } catch {}

    this.server = net.createServer((socket) => this.handleConnection(socket))
    this.server.listen(this.sockPath)
    process.stderr.write(`channel-mux ipc: listening on ${this.sockPath}\n`)
  }

  stop(): void {
    for (const session of this.sessions.values()) {
      session.socket.destroy()
    }
    this.sessions.clear()
    this.channelToSession.clear()
    this.dmSessionId = null
    this.socketToSession.clear()

    this.server?.close()
    this.server = null
  }

  setBotUsername(name: string): void {
    this.botUsername = name
  }

  onToolCall(handler: ToolCallHandler): void {
    this.toolCallHandler = handler
  }

  routeInbound(msg: InboundMsg): boolean {
    let sessionId: string | undefined

    if (msg.isDM) {
      sessionId = this.dmSessionId ?? undefined
    } else {
      sessionId = this.channelToSession.get(msg.channelId)
    }

    if (!sessionId) {
      dbg(
        'routeInbound miss',
        `channel=${msg.channelId}`,
        `isDM=${msg.isDM}`,
        `registered=[${[...this.channelToSession.keys()].join(', ')}]`,
      )
      return false
    }

    const session = this.sessions.get(sessionId)
    if (!session) return false

    dbg('routeInbound hit', `channel=${msg.channelId}`, `-> session ${sessionId}`)
    this.send(session.socket, msg)
    return true
  }

  broadcastShutdown(): void {
    const msg: DaemonMessage = { type: 'shutdown' }
    for (const session of this.sessions.values()) {
      this.send(session.socket, msg)
    }
  }

  private handleConnection(socket: net.Socket): void {
    let buffer = ''

    socket.on('data', (data) => {
      buffer += data.toString()
      const lines = buffer.split('\n')
      buffer = lines.pop()!
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const msg = JSON.parse(line) as PluginMessage
          this.dispatch(socket, msg)
        } catch (err) {
          process.stderr.write(`channel-mux ipc: bad json: ${err}\n`)
        }
      }
    })

    socket.on('close', () => this.handleDisconnect(socket))
    socket.on('error', (err) => {
      process.stderr.write(`channel-mux ipc: socket error: ${err.message}\n`)
      this.handleDisconnect(socket)
    })
  }

  private dispatch(socket: net.Socket, msg: PluginMessage): void {
    switch (msg.type) {
      case 'register':
        this.handleRegister(socket, msg)
        break
      case 'tool_call':
        this.handleToolCall(socket, msg)
        break
      case 'unregister':
        this.handleUnregister(msg)
        break
      case 'ping':
        this.send(socket, { type: 'pong' })
        break
    }
  }

  private handleRegister(socket: net.Socket, msg: RegisterMsg): void {
    // Check channel conflicts
    for (const ch of msg.channels) {
      const existing = this.channelToSession.get(ch)
      if (existing && existing !== msg.sessionId) {
        this.send(socket, {
          type: 'register_ack',
          id: msg.id,
          ok: false,
          error: `channel ${ch} already claimed by session ${existing}`,
        })
        return
      }
    }

    // Check DM conflict
    if (msg.handleDMs && this.dmSessionId && this.dmSessionId !== msg.sessionId) {
      this.send(socket, {
        type: 'register_ack',
        id: msg.id,
        ok: false,
        error: `DMs already claimed by session ${this.dmSessionId}`,
      })
      return
    }

    // Release old claims if re-registering
    const existing = this.sessions.get(msg.sessionId)
    if (existing) {
      this.releaseClaims(msg.sessionId)
    }

    // Register
    const session: Session = {
      sessionId: msg.sessionId,
      socket,
      channels: new Set(msg.channels),
      handleDMs: msg.handleDMs,
    }

    this.sessions.set(msg.sessionId, session)
    this.socketToSession.set(socket, msg.sessionId)

    for (const ch of msg.channels) {
      this.channelToSession.set(ch, msg.sessionId)
    }
    if (msg.handleDMs) {
      this.dmSessionId = msg.sessionId
    }

    this.send(socket, {
      type: 'register_ack',
      id: msg.id,
      ok: true,
      botUsername: this.botUsername ?? undefined,
    })

    process.stderr.write(
      `channel-mux ipc: session ${msg.sessionId} registered ` +
        `(channels: [${msg.channels.join(', ')}], DMs: ${msg.handleDMs})\n`,
    )
  }

  private async handleToolCall(socket: net.Socket, msg: ToolCallMsg): Promise<void> {
    if (!this.toolCallHandler) {
      this.send(socket, {
        type: 'tool_result',
        id: msg.id,
        ok: false,
        error: 'no tool handler registered',
      })
      return
    }

    try {
      const result = await this.toolCallHandler(msg.tool, msg.args)
      this.send(socket, {
        type: 'tool_result',
        id: msg.id,
        ok: true,
        result: typeof result.result === 'string' ? result.result : JSON.stringify(result),
        sentIds: Array.isArray(result.sentIds) ? (result.sentIds as string[]) : undefined,
      })
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      this.send(socket, {
        type: 'tool_result',
        id: msg.id,
        ok: false,
        error: errMsg,
      })
    }
  }

  private handleUnregister(msg: UnregisterMsg): void {
    this.releaseClaims(msg.sessionId)
    const session = this.sessions.get(msg.sessionId)
    if (session) {
      this.socketToSession.delete(session.socket)
    }
    this.sessions.delete(msg.sessionId)
    process.stderr.write(`channel-mux ipc: session ${msg.sessionId} unregistered\n`)
  }

  private handleDisconnect(socket: net.Socket): void {
    const sessionId = this.socketToSession.get(socket)
    if (!sessionId) return

    this.releaseClaims(sessionId)
    this.socketToSession.delete(socket)
    this.sessions.delete(sessionId)
    process.stderr.write(`channel-mux ipc: session ${sessionId} disconnected\n`)
  }

  private releaseClaims(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (!session) return

    for (const ch of session.channels) {
      if (this.channelToSession.get(ch) === sessionId) {
        this.channelToSession.delete(ch)
      }
    }
    if (this.dmSessionId === sessionId) {
      this.dmSessionId = null
    }
  }

  private send(socket: net.Socket, msg: DaemonMessage): void {
    socket.write(`${JSON.stringify(msg)}\n`)
  }
}
