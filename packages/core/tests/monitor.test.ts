import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MonitorServer, type StatusProvider } from '../src/monitor.js'

describe('MonitorServer', () => {
  let monitor: MonitorServer
  let port: number
  const baseUrl = () => `http://127.0.0.1:${port}`

  const statusProvider: StatusProvider = () => ({
    uptime: 42,
    sessions: [
      { sessionId: 's1', channels: ['ch-1', 'ch-2'], handleDMs: false, connectedAt: 1000 },
    ],
    botUsername: 'test-bot',
  })

  beforeEach(async () => {
    monitor = new MonitorServer(statusProvider, { bufferSize: 5 })
    await monitor.start(0)
    port = monitor.port!
  })

  afterEach(() => {
    monitor.stop()
  })

  it('GET /status returns daemon status', async () => {
    const res = await fetch(`${baseUrl()}/status`)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.uptime).toBe(42)
    expect(data.sessionCount).toBe(1)
    expect(data.botUsername).toBe('test-bot')
  })

  it('GET /sessions returns session list', async () => {
    const res = await fetch(`${baseUrl()}/sessions`)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toHaveLength(1)
    expect(data[0].sessionId).toBe('s1')
    expect(data[0].channels).toEqual(['ch-1', 'ch-2'])
  })

  it('GET /requests returns recorded events', async () => {
    monitor.recordInbound({ channelId: 'ch-1', username: 'alice', content: 'hello' })
    monitor.recordToolCall('reply', { chat_id: 'ch-1', text: 'hi' }, true)

    const res = await fetch(`${baseUrl()}/requests`)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toHaveLength(2)
    expect(data[0].direction).toBe('inbound')
    expect(data[0].type).toBe('message')
    expect(data[1].direction).toBe('outbound')
    expect(data[1].type).toBe('reply')
  })

  it('respects buffer size limit', async () => {
    for (let i = 0; i < 10; i++) {
      monitor.recordInbound({ channelId: 'ch-1', username: 'user', content: `msg-${i}` })
    }

    const res = await fetch(`${baseUrl()}/requests`)
    const data = await res.json()
    expect(data).toHaveLength(5)
    expect(data[0].summary).toContain('msg-5')
    expect(data[4].summary).toContain('msg-9')
  })

  it('returns 404 for unknown paths', async () => {
    const res = await fetch(`${baseUrl()}/unknown`)
    expect(res.status).toBe(404)
    const data = await res.json()
    expect(data.error).toBe('not found')
  })

  it('GET /events returns SSE stream', async () => {
    const controller = new AbortController()
    const res = await fetch(`${baseUrl()}/events`, { signal: controller.signal })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('text/event-stream')

    const reader = res.body!.getReader()
    const decoder = new TextDecoder()

    // Read initial :ok comment
    const { value: initial } = await reader.read()
    expect(decoder.decode(initial)).toContain(':ok')

    // Record an event
    monitor.recordInbound({ channelId: 'ch-1', username: 'bob', content: 'test' })

    // Read the SSE event
    const { value: eventData } = await reader.read()
    const text = decoder.decode(eventData)
    expect(text).toContain('data:')
    expect(text).toContain('"event":"inbound"')

    controller.abort()
  })

  it('truncates long content in summaries', async () => {
    const longContent = 'x'.repeat(500)
    monitor.recordInbound({ channelId: 'ch-1', username: 'user', content: longContent })

    const res = await fetch(`${baseUrl()}/requests`)
    const data = await res.json()
    expect(data[0].summary.length).toBeLessThan(250)
    expect(data[0].summary).toContain('...')
  })
})
