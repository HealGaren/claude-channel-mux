#!/usr/bin/env node
import { mkdirSync, unlinkSync, writeFileSync } from 'node:fs'
import {
  createDebug,
  IpcServer,
  loadEnvFile,
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

  const ipc = new IpcServer(SOCK_PATH)
  ipc.start()

  const adapter = new DiscordAdapter()

  adapter.onMessage((msg) => {
    dbg('inbound', `channel=${msg.channelId}`, `user=${msg.username}`, `isDM=${msg.isDM}`)
    const routed = ipc.routeInbound(msg)
    dbg(routed ? 'routed' : 'no matching session')
  })

  ipc.onToolCall(async (tool, args) => {
    dbg('tool_call', tool, Object.keys(args as Record<string, unknown>))
    switch (tool) {
      case 'reply':
        return adapter.reply(args as Parameters<typeof adapter.reply>[0])
      case 'react': {
        await adapter.react(args as Parameters<typeof adapter.react>[0])
        return { result: 'ok' }
      }
      case 'edit_message':
        return adapter.editMessage(args as Parameters<typeof adapter.editMessage>[0])
      case 'fetch_messages': {
        const result = await adapter.fetchMessages(
          args as Parameters<typeof adapter.fetchMessages>[0],
        )
        return { result }
      }
      case 'download_attachment':
        return adapter.downloadAttachment(args as Parameters<typeof adapter.downloadAttachment>[0])
      default:
        throw new Error(`unknown tool: ${tool}`)
    }
  })

  await adapter.connect(token)
  ipc.setBotUsername(adapter.botUsername)

  const shutdown = () => {
    process.stderr.write('channel-mux daemon: shutting down\n')
    ipc.broadcastShutdown()
    ipc.stop()
    adapter.disconnect()
    try {
      unlinkSync(PID_FILE)
    } catch {}
    try {
      unlinkSync(SOCK_PATH)
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
