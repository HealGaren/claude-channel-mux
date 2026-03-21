#!/usr/bin/env node
import { mkdirSync, unlinkSync, writeFileSync } from 'node:fs'
import {
  createDebug,
  IpcServer,
  loadEnvFile,
  MONITOR_PORT_FILE,
  MonitorServer,
  PID_FILE,
  SOCK_PATH,
  STATE_DIR,
} from '@claude-channel-mux/core'
import { DiscordAdapter } from './adapter.js'

const dbg = createDebug('mux:daemon')

async function main() {
  loadEnvFile()

  const token = process.env.DISCORD_BOT_TOKEN
  if (!token) {
    process.stderr.write(
      'channel-mux: DISCORD_BOT_TOKEN required\n' +
        `  set in ~/.claude/channels/channel-mux/.env\n`,
    )
    process.exit(1)
  }

  mkdirSync(STATE_DIR, { recursive: true })
  writeFileSync(PID_FILE, String(process.pid))

  const startedAt = Date.now()

  const ipc = new IpcServer(SOCK_PATH)
  ipc.start()

  const adapter = new DiscordAdapter()

  const monitorPort = process.env.MONITOR_PORT
    ? Number.parseInt(process.env.MONITOR_PORT, 10)
    : null
  let monitor: MonitorServer | null = null

  if (monitorPort) {
    monitor = new MonitorServer(() => ({
      uptime: Math.floor((Date.now() - startedAt) / 1000),
      sessions: ipc.getSessionSnapshots(),
      botUsername: adapter.botUsername,
    }))
    try {
      await monitor.start(monitorPort)
      writeFileSync(MONITOR_PORT_FILE, String(monitorPort))
      process.stderr.write(`channel-mux daemon: monitor on http://127.0.0.1:${monitorPort}\n`)
    } catch {
      monitor = null
    }
  }

  adapter.onMessage((msg) => {
    const routed = ipc.routeInbound(msg)
    monitor?.recordInbound({
      channelId: msg.channelId,
      username: msg.username,
      content: msg.content,
    })
    if (dbg.enabled) {
      dbg(
        routed ? 'routed' : 'dropped (no matching session)',
        `channel=${msg.channelId}`,
        `user=${msg.username}`,
        `isDM=${msg.isDM}`,
      )
    }
  })

  ipc.onToolCall(async (tool, args) => {
    dbg('tool_call', tool, Object.keys(args as Record<string, unknown>))
    try {
      let result: Record<string, unknown>
      switch (tool) {
        case 'reply':
          result = await adapter.reply(args as Parameters<typeof adapter.reply>[0])
          break
        case 'react':
          await adapter.react(args as Parameters<typeof adapter.react>[0])
          result = { result: 'ok' }
          break
        case 'edit_message':
          result = await adapter.editMessage(args as Parameters<typeof adapter.editMessage>[0])
          break
        case 'fetch_messages': {
          const fetchResult = await adapter.fetchMessages(
            args as Parameters<typeof adapter.fetchMessages>[0],
          )
          result = { result: fetchResult }
          break
        }
        case 'download_attachment':
          result = await adapter.downloadAttachment(
            args as Parameters<typeof adapter.downloadAttachment>[0],
          )
          break
        default:
          throw new Error(`unknown tool: ${tool}`)
      }
      monitor?.recordToolCall(tool, args, true)
      return result
    } catch (err) {
      monitor?.recordToolCall(tool, args, false)
      throw err
    }
  })

  await adapter.connect(token)
  ipc.setBotUsername(adapter.botUsername)

  const shutdown = () => {
    process.stderr.write('channel-mux daemon: shutting down\n')
    ipc.broadcastShutdown()
    ipc.stop()
    monitor?.stop()
    adapter.disconnect()
    try {
      unlinkSync(PID_FILE)
    } catch {}
    try {
      unlinkSync(SOCK_PATH)
    } catch {}
    try {
      unlinkSync(MONITOR_PORT_FILE)
    } catch {}
    process.exit(0)
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)

  process.stderr.write(`channel-mux daemon: running (pid ${process.pid})\n`)
}

main().catch((err) => {
  process.stderr.write(`channel-mux daemon: fatal: ${err}\n`)
  process.exit(1)
})
