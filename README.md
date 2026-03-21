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
- **pnpm** (workspace-enabled package manager)
- A **Discord bot** with Message Content Intent enabled

## Installation

### From source (current)

```bash
git clone https://github.com/HealGaren/claude-channel-mux.git
cd claude-channel-mux
pnpm install
pnpm run build
```

This is a pnpm workspace monorepo. `pnpm install` at the root installs all
workspace packages and links their internal dependencies.

### From npm registry

```bash
# npm
npm install -g @claude-channel-mux/cli

# pnpm
pnpm add -g @claude-channel-mux/cli

# yarn
yarn global add @claude-channel-mux/cli
```

## Quick Start

### 1. Create a Discord bot

See the [Discord Setup Guide](docs/guides/discord-setup.md) for detailed instructions, or the short version:

1. [Discord Developer Portal](https://discord.com/developers/applications) > **New Application** > **Bot** > **Reset Token**
2. Enable **Message Content Intent**
3. **OAuth2 > URL Generator**: scope `bot`, permissions: Send Messages, Read Message History, Add Reactions, Attach Files
4. Invite the bot to your server with the generated URL

### 2. Configure

```bash
mkdir -p ~/.claude/channels/channel-mux
cat > ~/.claude/channels/channel-mux/.env << 'EOF'
DISCORD_BOT_TOKEN=your_token_here
EOF
```

### 3. Start the daemon

```bash
# Foreground (see logs directly)
pnpm run dev

# Or background via CLI
channel-mux start
channel-mux status
```

### 4. Connect Claude Code

Add to your `.mcp.json` (project-level or `~/.claude/.mcp.json`). See the [Plugin Installation Guide](docs/guides/plugin-install.md) for all options (dev mode, npm, marketplace) or the [MCP Configuration Guide](docs/guides/mcp-config.md) for details.

```json
{
  "mcpServers": {
    "channel-mux": {
      "command": "channel-mux-plugin",
      "env": {
        "CHANNEL_MUX_CHANNELS": "YOUR_CHANNEL_ID",
        "CHANNEL_MUX_HANDLE_DMS": "true"
      }
    }
  }
}
```

If running from the monorepo source with tsx:

```json
{
  "mcpServers": {
    "channel-mux": {
      "command": "npx",
      "args": ["tsx", "packages/discord/src/plugin.ts"],
      "env": {
        "CHANNEL_MUX_CHANNELS": "YOUR_CHANNEL_ID",
        "CHANNEL_MUX_HANDLE_DMS": "true"
      }
    }
  }
}
```

> **Tip**: Get a channel ID by enabling Developer Mode in Discord settings, then right-clicking a channel -> "Copy Channel ID". Separate multiple channels with commas.

### 5. Start chatting

Send a DM to your bot. It will respond with a pairing code. In your terminal:

```
/channel-mux:access pair <code>
```

You're paired. Messages now flow to your Claude session.

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

Managed via the `/channel-mux:access` skill in your Claude terminal:

```bash
/channel-mux:access                    # Show current status
/channel-mux:access pair <code>        # Approve a pairing
/channel-mux:access allow <userId>     # Add user to allowlist
/channel-mux:access policy allowlist   # Switch DM policy
/channel-mux:access group add <chId>   # Add a guild channel
```

### Environment variables (plugin)

| Variable | Description |
|----------|-------------|
| `CHANNEL_MUX_CHANNELS` | Comma-separated Discord channel IDs to claim |
| `CHANNEL_MUX_HANDLE_DMS` | `true` to handle DMs in this session |

## Architecture

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

- **Access mutations are terminal-only** -- the `/channel-mux:access` skill only runs from the user's terminal, never triggered by channel messages
- **Outbound gate** -- bot can only send to channels listed in `access.json`
- **File path security** -- `assertSendable()` blocks sending state directory files (except inbox)
- **Attachment sanitization** -- filenames are stripped of injection characters

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
