# @claude-channel-mux/discord

Discord adapter for [claude-channel-mux](https://github.com/HealGaren/claude-channel-mux): connects Discord to Claude Code sessions via a shared daemon.

> **Note**: This is a community project and is not affiliated with or endorsed by Anthropic.

## Install

```bash
npm install @claude-channel-mux/discord
```

## What's included

- **DiscordAdapter**: Full `PlatformAdapter` implementation using discord.js
- **Daemon**: Long-running process that holds the Discord bot connection and routes messages via IPC
- **MCP Plugin**: MCP server that Claude Code spawns, proxies tool calls to the daemon
- **Access control**: DM pairing, guild channel policies, mention gating
- **Utilities**: Message chunking, attachment handling, file path security

## Binaries

- `channel-mux-daemon`: Start the daemon process
- `channel-mux-plugin`: MCP server plugin for Claude Code

## Quick start

See the [main repository](https://github.com/HealGaren/claude-channel-mux) for full setup instructions.

## License

[MIT](https://github.com/HealGaren/claude-channel-mux/blob/main/LICENSE)
