# claude-channel-mux

> Multiplex Claude Code channel sessions through a single Discord bot.

[![npm version](https://img.shields.io/npm/v/@claude-channel-mux/cli)](https://www.npmjs.com/package/@claude-channel-mux/cli)
[![npm downloads](https://img.shields.io/npm/dm/@claude-channel-mux/cli)](https://www.npmjs.com/package/@claude-channel-mux/cli)
[![CI](https://github.com/HealGaren/claude-channel-mux/actions/workflows/ci.yml/badge.svg)](https://github.com/HealGaren/claude-channel-mux/actions/workflows/ci.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/node/v/@claude-channel-mux/cli)](https://nodejs.org/)

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
channel-mux daemon start
channel-mux daemon status   # verify it's running
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

### 6. Configure channels

Add channels to the daemon and configure session routing:

```bash
# Allow the daemon to receive from your channel
channel-mux daemon group add YOUR_CHANNEL_ID

# Set which channels this session routes (updates .mcp.json env block)
channel-mux session channels YOUR_CHANNEL_ID
channel-mux session dms true
```

> **Tip**: Get a channel ID by enabling Developer Mode in Discord settings, then right-clicking a channel > "Copy Channel ID". Multiple IDs can be space-separated.
>
> **Note**: If you installed via the plugin marketplace (step 5), the plugin provides a default `.mcp.json`. Running `session channels` / `session dms` updates the env block in your local `.mcp.json`, which takes precedence.

### 7. Start Claude Code with channels enabled

```bash
claude --dangerously-load-development-channels server:channel-mux
```

> **Warning**: The `--dangerously-load-development-channels` flag loads channel plugins that are NOT from the official Anthropic marketplace. Only official Anthropic channels can run without this flag. Do not use this flag if you do not understand what it does -- it allows third-party code to inject messages into your Claude session.

### 8. Start chatting

Send a DM to your bot. It will respond with a pairing code. In your terminal:

```
/channel-mux:daemon pair <code>
```

You're paired. Messages now flow to your Claude session.

## CLI Reference

```bash
# Daemon management
channel-mux daemon start [--verbose]   # Start daemon in background
channel-mux daemon stop                # Stop daemon (SIGTERM -> SIGKILL)
channel-mux daemon status              # Check if daemon is running
channel-mux daemon group add <id> ...  # Add channels to daemon reception
channel-mux daemon group rm <id> ...   # Remove channels
channel-mux daemon group list          # List configured channels

# Session routing
channel-mux session                            # View current config
channel-mux session channels <id> [...]        # Set channel IDs
channel-mux session dms <true|false>           # Set DM handling
```

> `session channels` and `session dms` accept `--scope=local|project|user` to choose which `.mcp.json` to write (default: `local`).

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
      cli.ts             # CLI (daemon, session)
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
