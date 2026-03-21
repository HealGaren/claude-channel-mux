# claude-channel-mux

> Multiplex Claude Code channel sessions through a single Discord bot.

[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![CI](https://github.com/HealGaren/claude-channel-mux/actions/workflows/ci.yml/badge.svg)](https://github.com/HealGaren/claude-channel-mux/actions/workflows/ci.yml)

> **Note**: This is a community project and is not affiliated with or endorsed by Anthropic.

---

## What is this?

The official Claude Code Discord plugin spawns a dedicated bot per session. That means one bot connection per `claude` invocation, no channel sharing, and no routing.

**claude-channel-mux** fixes this with a daemon/plugin split:

```
[Discord Bot]
       |
   [Daemon]          <- single bot connection, holds the Discord session
       | Unix socket (JSON Lines)
   +---+---+
   |   |   |
  [A] [B] [C]       <- MCP server plugins, one per Claude Code session
```

- **One daemon** holds the bot connection and routes messages
- **Multiple plugins** (one per Claude session) claim specific channels
- Messages flow through the daemon -- no duplicate bot logins

## Features

- **Channel multiplexing** -- Multiple Claude sessions share one bot
- **DM pairing** -- Secure opt-in flow for direct messages
- **Guild channel groups** -- Per-channel access policies with mention gating
- **Message chunking** -- Respects Discord's 2000-char limit with smart splitting
- **Attachment handling** -- Upload/download with size limits and path security
- **Prompt injection defense** -- Access control mutations only via terminal, never from channel messages

## Prerequisites

- **Node.js** >= 20
- A **Discord bot** with Message Content Intent enabled

## Quick Start

### 1. Create a Discord bot

See the [Discord Setup Guide](docs/guides/discord-setup.md) for detailed instructions, or the short version:

1. [Discord Developer Portal](https://discord.com/developers/applications) > **New Application** > **Bot** > **Reset Token**
2. Enable **Message Content Intent**
3. **OAuth2 > URL Generator**: scope `bot`, permissions: Send Messages, Read Message History, Add Reactions, Attach Files
4. Invite the bot to your server with the generated URL

### 2. Install

```bash
npm install -g @claude-channel-mux/cli
```

### 3. Configure bot token

```bash
echo "DISCORD_BOT_TOKEN=your_token_here" > ~/.claude/channels/channel-mux/.env
```

> The state directory (`~/.claude/channels/channel-mux/`) is created automatically on first daemon start.

### 4. Start the daemon

```bash
channel-mux start
channel-mux status   # verify it's running
```

### 5. Install the plugin

In a Claude Code session, install the plugin from the custom marketplace:

```bash
# Add the marketplace (one-time)
/plugins marketplace add HealGaren/claude-channel-mux

# Install the plugin
/plugins install channel-mux@HealGaren/claude-channel-mux
```

The plugin ships with `.mcp.json`, so the MCP server is configured automatically.

### 6. Start Claude Code with channels enabled

The simplest way is to pass the channel ID and DM handling as environment variables:

```bash
CHANNEL_MUX_CHANNELS=YOUR_CHANNEL_ID CHANNEL_MUX_HANDLE_DMS=true \
  claude --dangerously-load-development-channels server:channel-mux
```

> You can also set these in `.mcp.json` (project-level or `~/.claude/.mcp.json`) env block. See the [Plugin Installation Guide](docs/guides/plugin-install.md) for details.

> **Warning**: The `--dangerously-load-development-channels` flag loads channel plugins that are NOT from the official Anthropic marketplace. Only official Anthropic channels can run without this flag. Do not use this flag if you do not understand what it does -- it allows third-party code to inject messages into your Claude session.

### 7. Start chatting

Send a DM to your bot. It will respond with a pairing code. In your terminal:

```
/channel-mux:daemon pair <code>
```

You're paired. Messages now flow to your Claude session.

> **Tip**: Get a channel ID by enabling Developer Mode in Discord settings, then right-clicking a channel > "Copy Channel ID".

## CLI Reference

```bash
channel-mux start    # Start daemon in background
channel-mux stop     # Stop daemon (SIGTERM -> SIGKILL)
channel-mux status   # Check if daemon is running
```

## Configuration

All state lives in `~/.claude/channels/channel-mux/`:

| File | Purpose |
|------|---------|
| `.env` | `DISCORD_BOT_TOKEN=...` |
| `access.json` | Access control (pairings, allowlists, groups) |
| `daemon.pid` | PID of running daemon |
| `daemon.sock` | Unix domain socket for IPC |
| `inbox/` | Downloaded attachments |

### Access control

Managed via the `/channel-mux:daemon` skill in your Claude terminal:

```bash
/channel-mux:daemon                    # Show current status
/channel-mux:daemon pair <code>        # Approve a pairing
/channel-mux:daemon allow <userId>     # Add user to allowlist
/channel-mux:daemon policy allowlist   # Switch DM policy
/channel-mux:daemon group add <chId>   # Add a guild channel
```

### Environment variables (plugin)

| Variable | Description |
|----------|-------------|
| `CHANNEL_MUX_CHANNELS` | Comma-separated Discord channel IDs to claim |
| `CHANNEL_MUX_HANDLE_DMS` | `true` to handle DMs in this session |

## Architecture

> For detailed diagrams and message flows, see the [Architecture Guide](docs/guides/architecture.md).

### IPC Protocol

Daemon and plugins communicate via **JSON Lines** over a Unix domain socket.

```
Plugin -> Daemon: register, tool_call, unregister, ping
Daemon -> Plugin: register_ack, inbound, tool_result, pong, shutdown
```

Each request carries a UUID `id` for response correlation. Timeout: 30s.

### Platform Adapter

Discord support is implemented as a `PlatformAdapter` interface, designed for future adapters (Slack, etc.):

```typescript
interface PlatformAdapter {
  connect(token: string): Promise<void>
  disconnect(): Promise<void>
  onMessage(handler: (msg: InboundMsg) => void): void
  reply(args): Promise<{ sentIds: string[] }>
  react(args): Promise<void>
  // ...
}
```

### Security Model

- **Access mutations are terminal-only** -- the `/channel-mux:daemon` skill only runs from the user's terminal, never triggered by channel messages
- **Outbound gate** -- bot can only send to channels listed in `access.json`
- **File path security** -- `assertSendable()` blocks sending state directory files (except inbox)
- **Attachment sanitization** -- filenames are stripped of injection characters

## Monitoring

The daemon has an optional HTTP monitoring server for observing runtime state. Set `MONITOR_PORT` in your `.env`:

```
MONITOR_PORT=9100
```

Endpoints (bound to `127.0.0.1` only):

| Endpoint | Description |
|---|---|
| `GET /status` | Daemon uptime, session count, bot username |
| `GET /sessions` | Connected sessions with claimed channels |
| `GET /requests` | Recent request log (last 200 entries) |
| `GET /events` | SSE stream (inbound, tool_call, session connect/disconnect) |

See the [Monitor API Guide](docs/guides/monitor-api.md) for full response schemas.

## Project Structure

```
packages/
  core/                @claude-channel-mux/core
    src/
      types.ts           # IPC protocol + PlatformAdapter interface
      config.ts          # Paths, .env loader
      ipc-server.ts      # Daemon-side Unix socket server
      ipc-client.ts      # Plugin-side Unix socket client
  discord/             @claude-channel-mux/discord
    src/
      daemon.ts          # Daemon entry point
      plugin.ts          # MCP server entry point
      adapter.ts         # Discord.js PlatformAdapter
      access.ts          # Gate logic, pairing, allowlists
      utils.ts           # chunk(), assertSendable(), safeAttName()
  cli/                 @claude-channel-mux/cli
    src/
      cli.ts             # CLI (start/stop/status)
```

## Development

```bash
pnpm install
pnpm run check        # Full pre-PR check (lint, build, typecheck, test, smoke)
pnpm run dev          # Start daemon with watch mode
```

See [CLAUDE.md](CLAUDE.md) for detailed development conventions.

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

<!-- ## Changelog

See [CHANGELOG.md](CHANGELOG.md) for release history. -->

## Roadmap

See [Roadmap Issue #1](https://github.com/HealGaren/claude-channel-mux/issues/1) for planned features and priorities.

## License

[MIT](LICENSE)
