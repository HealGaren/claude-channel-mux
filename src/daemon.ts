import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs'
import { DiscordAdapter } from './adapters/discord/adapter.js'
import { IpcServer } from './core/ipc-server.js'
import { loadEnvFile, SOCK_PATH, PID_FILE, STATE_DIR } from './core/config.js'

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
    ipc.routeInbound(msg)
  })

  ipc.onToolCall(async (tool, args) => {
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
        const result = await adapter.fetchMessages(args as Parameters<typeof adapter.fetchMessages>[0])
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
    try { unlinkSync(PID_FILE) } catch {}
    try { unlinkSync(SOCK_PATH) } catch {}
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
