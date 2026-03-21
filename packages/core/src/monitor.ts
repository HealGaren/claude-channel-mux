import http from 'node:http'
import { createDebug } from './debug.js'
import { RingBuffer } from './ring-buffer.js'
import type { SessionSnapshot } from './types.js'

const dbg = createDebug('mux:monitor')

export type RequestLogEntry = {
  timestamp: string
  direction: 'inbound' | 'outbound'
  type: string
  channelId?: string
  sessionId?: string
  summary: string
}

export type MonitorEvent = {
  event: 'inbound' | 'tool_call' | 'session_connect' | 'session_disconnect'
  data: RequestLogEntry | { sessionId: string }
  timestamp: string
}

export type StatusProvider = () => {
  uptime: number
  sessions: SessionSnapshot[]
  botUsername: string | null
}

const MAX_SUMMARY = 200

function truncate(s: string, max = MAX_SUMMARY): string {
  return s.length > max ? `${s.slice(0, max)}...` : s
}

export class MonitorServer {
  private server: http.Server | null = null
  private requests: RingBuffer<RequestLogEntry>
  private sseClients = new Set<http.ServerResponse>()

  constructor(
    private statusProvider: StatusProvider,
    options?: { bufferSize?: number },
  ) {
    this.requests = new RingBuffer(options?.bufferSize ?? 200)
  }

  start(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => this.handleRequest(req, res))

      server.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          process.stderr.write(`channel-mux monitor: port ${port} in use, monitor disabled\n`)
          reject(err)
          return
        }
        process.stderr.write(`channel-mux monitor: error: ${err.message}\n`)
      })

      server.listen(port, '127.0.0.1', () => {
        this.server = server
        dbg(`listening on http://127.0.0.1:${port}`)
        resolve()
      })
    })
  }

  get port(): number | null {
    const addr = this.server?.address()
    return addr && typeof addr === 'object' ? addr.port : null
  }

  stop(): void {
    for (const res of this.sseClients) {
      res.end()
    }
    this.sseClients.clear()
    this.server?.close()
    this.server = null
  }

  recordInbound(msg: {
    channelId: string
    username: string
    content: string
    sessionId?: string
  }): void {
    const entry: RequestLogEntry = {
      timestamp: new Date().toISOString(),
      direction: 'inbound',
      type: 'message',
      channelId: msg.channelId,
      sessionId: msg.sessionId,
      summary: truncate(`${msg.username}: ${msg.content}`),
    }
    this.requests.push(entry)
    this.emit({ event: 'inbound', data: entry, timestamp: entry.timestamp })
  }

  recordToolCall(
    tool: string,
    args: Record<string, unknown>,
    ok: boolean,
    sessionId?: string,
  ): void {
    const argsPreview = truncate(JSON.stringify(args), 150)
    const entry: RequestLogEntry = {
      timestamp: new Date().toISOString(),
      direction: 'outbound',
      type: tool,
      channelId: args.chat_id as string | undefined,
      sessionId,
      summary: `${tool}(${argsPreview}) -> ${ok ? 'ok' : 'error'}`,
    }
    this.requests.push(entry)
    this.emit({ event: 'tool_call', data: entry, timestamp: entry.timestamp })
  }

  recordSessionEvent(type: 'connect' | 'disconnect', sessionId: string): void {
    this.emit({
      event: `session_${type}`,
      data: { sessionId },
      timestamp: new Date().toISOString(),
    })
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`)

    switch (url.pathname) {
      case '/status':
        this.handleStatus(res)
        break
      case '/sessions':
        this.handleSessions(res)
        break
      case '/requests':
        this.handleRequests(res)
        break
      case '/events':
        this.handleEvents(req, res)
        break
      default:
        this.json(res, 404, { error: 'not found' })
    }
  }

  private handleStatus(res: http.ServerResponse): void {
    const status = this.statusProvider()
    this.json(res, 200, {
      uptime: status.uptime,
      sessionCount: status.sessions.length,
      botUsername: status.botUsername,
      requestBufferSize: this.requests.size,
    })
  }

  private handleSessions(res: http.ServerResponse): void {
    const status = this.statusProvider()
    this.json(res, 200, status.sessions)
  }

  private handleRequests(res: http.ServerResponse): void {
    this.json(res, 200, this.requests.toArray())
  }

  private handleEvents(_req: http.IncomingMessage, res: http.ServerResponse): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })
    res.write(':ok\n\n')

    this.sseClients.add(res)
    const cleanup = () => this.sseClients.delete(res)
    res.on('close', cleanup)
    res.on('error', cleanup)
  }

  private emit(event: MonitorEvent): void {
    if (this.sseClients.size === 0) return
    const line = `data: ${JSON.stringify(event)}\n\n`
    for (const res of this.sseClients) {
      try {
        res.write(line)
      } catch {
        this.sseClients.delete(res)
      }
    }
  }

  private json(res: http.ServerResponse, status: number, data: unknown): void {
    const body = JSON.stringify(data)
    res.writeHead(status, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    })
    res.end(body)
  }
}
