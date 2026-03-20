# MCP Configuration Guide

This guide explains how to connect claude-channel-mux to Claude Code via `.mcp.json`.

## Prerequisites

- Discord bot set up and token configured (see [Discord Setup Guide](./discord-setup.md))
- `@claude-channel-mux/cli` and `@claude-channel-mux/discord` installed
- Daemon running (`channel-mux start`)

## Configuration File

Add to your `.mcp.json` (project-level or `~/.claude/.mcp.json`):

### Global install

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

### Local install (from source)

```json
{
  "mcpServers": {
    "channel-mux": {
      "command": "npx",
      "args": ["tsx", "/path/to/claude-channel-mux/packages/discord/src/plugin.ts"],
      "env": {
        "CHANNEL_MUX_CHANNELS": "YOUR_CHANNEL_ID",
        "CHANNEL_MUX_HANDLE_DMS": "true"
      }
    }
  }
}
```

## Environment Variables

| Variable | Description | Example |
|---|---|---|
| `CHANNEL_MUX_CHANNELS` | Comma-separated Discord channel IDs to claim | `1234567890,9876543210` |
| `CHANNEL_MUX_HANDLE_DMS` | Handle direct messages in this session | `true` or `false` |

## Multiple Sessions

Different Claude Code sessions can claim different channels:

**Session A** (project channel):
```json
{
  "env": {
    "CHANNEL_MUX_CHANNELS": "1234567890",
    "CHANNEL_MUX_HANDLE_DMS": "false"
  }
}
```

**Session B** (support channel + DMs):
```json
{
  "env": {
    "CHANNEL_MUX_CHANNELS": "9876543210",
    "CHANNEL_MUX_HANDLE_DMS": "true"
  }
}
```

Only one session can handle DMs at a time. Channel IDs cannot overlap between sessions.

## Verifying the Connection

1. Start the daemon: `channel-mux start`
2. Start a Claude Code session with the `.mcp.json` configured
3. Check daemon logs: `tail -f ~/.claude/channels/channel-mux/daemon.log`
4. You should see: `channel-mux ipc: session <id> registered`

## Troubleshooting

### "cannot connect to daemon"
- Start the daemon first: `channel-mux start`
- Check status: `channel-mux status`

### "channel already claimed by another session"
- Another Claude Code session has already claimed that channel
- Use different channel IDs per session, or stop the other session

### Plugin doesn't appear in Claude Code
- Verify `.mcp.json` syntax is valid JSON
- Check the `command` path is correct
- Restart Claude Code after changing `.mcp.json`
