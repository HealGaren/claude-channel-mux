import { mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { IpcClient } from '../src/ipc-client.js'
import { IpcServer } from '../src/ipc-server.js'
import type { InboundMsg } from '../src/types.js'

describe('IPC server/client', () => {
  const testDir = join(tmpdir(), `channel-mux-ipc-test-${process.pid}`)
  const sockPath = join(testDir, 'test.sock')
  let server: IpcServer

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true })
    server = new IpcServer(sockPath)
    server.start()
  })

  afterEach(() => {
    server.stop()
    rmSync(testDir, { recursive: true, force: true })
  })

  async function createClient(opts?: { timeoutMs?: number }): Promise<IpcClient> {
    const client = new IpcClient(sockPath, opts)
    await client.connect()
    return client
  }

  it('registers a session and receives ack', async () => {
    const client = await createClient()
    const ack = await client.register('session-1', ['ch-100'], false)
    expect(ack.ok).toBe(true)
    client.disconnect('session-1')
  })

  it('includes botUsername in register ack', async () => {
    server.setBotUsername('test-bot')
    const client = await createClient()
    const ack = await client.register('session-1', ['ch-100'], false)
    expect(ack.botUsername).toBe('test-bot')
    client.disconnect('session-1')
  })

  it('rejects duplicate channel claims', async () => {
    const client1 = await createClient()
    const client2 = await createClient()

    const ack1 = await client1.register('session-1', ['ch-100'], false)
    expect(ack1.ok).toBe(true)

    const ack2 = await client2.register('session-2', ['ch-100'], false)
    expect(ack2.ok).toBe(false)
    expect(ack2.error).toContain('ch-100')

    client1.disconnect('session-1')
    client2.disconnect('session-2')
  })

  it('rejects duplicate DM handlers', async () => {
    const client1 = await createClient()
    const client2 = await createClient()

    const ack1 = await client1.register('session-1', [], true)
    expect(ack1.ok).toBe(true)

    const ack2 = await client2.register('session-2', [], true)
    expect(ack2.ok).toBe(false)
    expect(ack2.error).toContain('DM')

    client1.disconnect('session-1')
    client2.disconnect('session-2')
  })

  it('routes inbound messages to the correct session', async () => {
    const client = await createClient()
    await client.register('session-1', ['ch-200'], false)

    const received: InboundMsg[] = []
    client.onInbound((msg) => received.push(msg))

    const msg: InboundMsg = {
      type: 'inbound',
      channelId: 'ch-200',
      messageId: 'msg-1',
      content: 'hello',
      userId: 'user-1',
      username: 'testuser',
      timestamp: new Date().toISOString(),
      attachments: [],
      isDM: false,
    }

    const routed = server.routeInbound(msg)
    expect(routed).toBe('session-1')

    // Wait for message to arrive
    await new Promise((r) => setTimeout(r, 50))
    expect(received).toHaveLength(1)
    expect(received[0].content).toBe('hello')

    client.disconnect('session-1')
  })

  it('routes DM messages to DM handler', async () => {
    const client = await createClient()
    await client.register('session-dm', [], true)

    const received: InboundMsg[] = []
    client.onInbound((msg) => received.push(msg))

    const msg: InboundMsg = {
      type: 'inbound',
      channelId: 'dm-ch-1',
      messageId: 'msg-2',
      content: 'dm hello',
      userId: 'user-2',
      username: 'dmuser',
      timestamp: new Date().toISOString(),
      attachments: [],
      isDM: true,
    }

    expect(server.routeInbound(msg)).toBe('session-dm')
    await new Promise((r) => setTimeout(r, 50))
    expect(received).toHaveLength(1)
    expect(received[0].content).toBe('dm hello')

    client.disconnect('session-dm')
  })

  it('returns false for unroutable messages', () => {
    const msg: InboundMsg = {
      type: 'inbound',
      channelId: 'ch-unknown',
      messageId: 'msg-3',
      content: 'lost',
      userId: 'user-3',
      username: 'nobody',
      timestamp: new Date().toISOString(),
      attachments: [],
      isDM: false,
    }
    expect(server.routeInbound(msg)).toBeNull()
  })

  it('releases claims on disconnect', async () => {
    const client1 = await createClient()
    await client1.register('session-1', ['ch-300'], false)
    client1.disconnect('session-1')

    // Wait for disconnect to propagate
    await new Promise((r) => setTimeout(r, 50))

    // Now another client can claim the same channel
    const client2 = await createClient()
    const ack = await client2.register('session-2', ['ch-300'], false)
    expect(ack.ok).toBe(true)
    client2.disconnect('session-2')
  })

  it('forwards tool calls and returns results', async () => {
    server.onToolCall(async (tool, _args) => {
      if (tool === 'reply') {
        return { sentIds: ['sent-1'], result: 'ok' }
      }
      throw new Error(`unknown tool: ${tool}`)
    })

    const client = await createClient()
    await client.register('session-1', ['ch-400'], false)

    const result = await client.toolCall('session-1', 'reply', {
      chat_id: 'ch-400',
      text: 'hello',
    })
    expect(result.ok).toBe(true)
    expect(result.sentIds).toEqual(['sent-1'])

    client.disconnect('session-1')
  })

  it('returns error for failed tool calls', async () => {
    server.onToolCall(async () => {
      throw new Error('boom')
    })

    const client = await createClient()
    await client.register('session-1', [], false)

    const result = await client.toolCall('session-1', 'reply', {})
    expect(result.ok).toBe(false)
    expect(result.error).toContain('boom')

    client.disconnect('session-1')
  })

  it('allows re-registration from same session', async () => {
    const client = await createClient()
    const ack = await client.register('session-1', ['ch-500'], false)
    expect(ack.ok).toBe(true)

    const ack2 = await client.register('session-1', ['ch-500'], false)
    expect(ack2.ok).toBe(true)

    client.disconnect('session-1')
  })

  it('times out pending requests', async () => {
    // Set a handler that never resolves
    server.onToolCall(() => new Promise(() => {}))

    const client = await createClient({ timeoutMs: 200 })
    await client.register('session-1', [], false)

    const start = Date.now()
    await expect(client.toolCall('session-1', 'reply', { text: 'hello' })).rejects.toThrow(
      'timed out',
    )
    const elapsed = Date.now() - start

    expect(elapsed).toBeGreaterThanOrEqual(150)
    expect(elapsed).toBeLessThan(1000)

    client.disconnect('session-1')
  })

  it('returns session snapshots', async () => {
    const client1 = await createClient()
    const client2 = await createClient()
    await client1.register('session-1', ['ch-700'], false)
    await client2.register('session-2', ['ch-701', 'ch-702'], true)

    const snapshots = server.getSessionSnapshots()
    expect(snapshots).toHaveLength(2)

    const s1 = snapshots.find((s) => s.sessionId === 'session-1')!
    expect(s1.channels).toEqual(['ch-700'])
    expect(s1.handleDMs).toBe(false)
    expect(s1.connectedAt).toBeGreaterThan(0)

    const s2 = snapshots.find((s) => s.sessionId === 'session-2')!
    expect(s2.channels).toEqual(expect.arrayContaining(['ch-701', 'ch-702']))
    expect(s2.handleDMs).toBe(true)

    client1.disconnect('session-1')
    client2.disconnect('session-2')
  })

  it('broadcasts shutdown to all connected clients', async () => {
    const client1 = await createClient()
    const client2 = await createClient()
    await client1.register('session-1', ['ch-600'], false)
    await client2.register('session-2', ['ch-601'], false)

    let shutdown1 = false
    let shutdown2 = false
    client1.onShutdown(() => {
      shutdown1 = true
    })
    client2.onShutdown(() => {
      shutdown2 = true
    })

    server.broadcastShutdown()
    await new Promise((r) => setTimeout(r, 50))

    expect(shutdown1).toBe(true)
    expect(shutdown2).toBe(true)

    client1.disconnect('session-1')
    client2.disconnect('session-2')
  })
})
