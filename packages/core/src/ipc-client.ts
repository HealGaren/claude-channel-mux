import { randomUUID } from 'node:crypto'
import net from 'node:net'
import { createDebug } from './debug.js'
import type { DaemonMessage, InboundMsg, RegisterAckMsg, ToolResultMsg } from './types.js'

const dbg = createDebug('mux:ipc-client')

export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000

type PendingRequest = {
  resolve: (msg: DaemonMessage) => void
  reject: (err: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export class IpcClient {
  private sockPath: string
  private socket: net.Socket | null = null
  private pending = new Map<string, PendingRequest>()
  private messageHandler: ((msg: InboundMsg) => void) | null = null
  private shutdownHandler: (() => void) | null = null
  private buffer = ''
  private timeoutMs: number

  constructor(sockPath: string, opts?: { timeoutMs?: number }) {
    this.sockPath = sockPath
    this.timeoutMs = opts?.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection(this.sockPath, () => {
        this.socket = socket
        dbg('connected', this.sockPath)
        resolve()
      })

      socket.on('error', (err) => {
        if (!this.socket) {
          reject(err)
          return
        }
        process.stderr.write(`channel-mux ipc-client: socket error: ${err.message}\n`)
        this.cleanup()
      })

      socket.on('data', (data) => {
        this.buffer += data.toString()
        const lines = this.buffer.split('\n')
        this.buffer = lines.pop()!
        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const msg = JSON.parse(line) as DaemonMessage
            this.handleMessage(msg)
          } catch (err) {
            process.stderr.write(`channel-mux ipc-client: bad json: ${err}\n`)
          }
        }
      })

      socket.on('close', () => {
        this.cleanup()
      })
    })
  }

  async register(
    sessionId: string,
    channels: string[],
    handleDMs: boolean,
  ): Promise<RegisterAckMsg> {
    const id = randomUUID()
    this.send({
      type: 'register',
      id,
      sessionId,
      channels,
      handleDMs,
    })
    const resp = await this.waitForResponse(id)
    return resp as RegisterAckMsg
  }

  async toolCall(
    sessionId: string,
    tool: string,
    args: Record<string, unknown>,
  ): Promise<ToolResultMsg> {
    const id = randomUUID()
    this.send({
      type: 'tool_call',
      id,
      sessionId,
      tool: tool as ToolResultMsg extends { id: string } ? string : never,
      args,
    })
    const resp = await this.waitForResponse(id)
    return resp as ToolResultMsg
  }

  onInbound(handler: (msg: InboundMsg) => void): void {
    this.messageHandler = handler
  }

  onShutdown(handler: () => void): void {
    this.shutdownHandler = handler
  }

  disconnect(sessionId?: string): void {
    if (sessionId && this.socket) {
      this.send({ type: 'unregister', sessionId })
    }
    this.socket?.end()
    this.cleanup()
  }

  private handleMessage(msg: DaemonMessage): void {
    // Response to a pending request
    if ('id' in msg && msg.id) {
      const pending = this.pending.get(msg.id)
      if (pending) {
        clearTimeout(pending.timer)
        this.pending.delete(msg.id)
        pending.resolve(msg)
        return
      }
    }

    // Inbound message from Discord
    if (msg.type === 'inbound' && this.messageHandler) {
      const inbound = msg as InboundMsg
      dbg('inbound', `channel=${inbound.channelId}`, `message=${inbound.messageId}`)
      this.messageHandler(inbound)
      return
    }

    // Daemon shutdown
    if (msg.type === 'shutdown' && this.shutdownHandler) {
      dbg('shutdown received')
      this.shutdownHandler()
      return
    }
  }

  private send(msg: Record<string, unknown>): void {
    if (!this.socket) throw new Error('not connected')
    this.socket.write(`${JSON.stringify(msg)}\n`)
  }

  private waitForResponse(id: string): Promise<DaemonMessage> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`request ${id} timed out after ${this.timeoutMs}ms`))
      }, this.timeoutMs)

      this.pending.set(id, { resolve, reject, timer })
    })
  }

  private cleanup(): void {
    for (const [, p] of this.pending) {
      clearTimeout(p.timer)
      p.reject(new Error('connection closed'))
    }
    this.pending.clear()
    this.socket = null
    this.buffer = ''
  }
}
