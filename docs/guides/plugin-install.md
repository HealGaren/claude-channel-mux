# Plugin Installation Guide

How to install and use claude-channel-mux as a Claude Code channel plugin.

> **Important**: Claude Code channels are in [research preview](https://code.claude.com/docs/en/channels#research-preview) and require Claude Code v2.1.80+, claude.ai login, and the `--channels` flag. Team/Enterprise orgs must enable channels in admin settings.

## Prerequisites

- [Claude Code](https://claude.com/claude-code) v2.1.80+ (`claude --version` to check)
- claude.ai account (Console/API key auth not supported for channels)
- Discord bot set up (see [Discord Setup Guide](./discord-setup.md))
- Bot token configured (`~/.claude/channels/channel-mux/.env`)
- Daemon running (`channel-mux daemon start`)

## Install from marketplace (recommended)

The plugin is available through a custom marketplace.

### 1. Add the marketplace and install

In your Claude Code terminal:

```bash
# Add the marketplace (one-time)
/plugins marketplace add HealGaren/claude-channel-mux

# Install the plugin
/plugins install channel-mux@HealGaren/claude-channel-mux
```

The plugin ships with `.mcp.json`, so the MCP server is configured automatically.

### 2. Configure channels

```bash
# Allow the daemon to receive from your channel
channel-mux daemon group add YOUR_CHANNEL_ID

# Set which channels this session routes
channel-mux session channels YOUR_CHANNEL_ID
channel-mux session dms true
```

> `channel-mux session` writes to `.mcp.json`. Use `--scope=local|project|user` to choose which file (default: `local`).

### 3. Start Claude Code with channels enabled

```bash
claude --dangerously-load-development-channels server:channel-mux
```

> `server:channel-mux` refers to the MCP server name defined in the plugin's `.mcp.json`.

> **Warning**: The `--dangerously-load-development-channels` flag loads channel plugins that are NOT from the official Anthropic marketplace. Only official Anthropic channels can run without this flag. This flag allows third-party code to inject messages into your Claude session. Do not use it if you do not understand the implications.

### 4. Verify the connection

1. Check daemon logs: `tail -f ~/.claude/channels/channel-mux/daemon.log`
2. You should see: `channel-mux ipc: session <id> registered`
3. Send a message in your configured Discord channel or DM the bot
4. The message should appear in your Claude Code session as a `<channel>` tag

## Install from npm (manual MCP setup)

If you prefer to configure the MCP server manually instead of using the plugin marketplace:

### 1. Install the package

```bash
npm install -g @claude-channel-mux/cli
```

### 2. Configure .mcp.json

Add to your `.mcp.json` (project-level or `~/.claude/.mcp.json`):

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

Replace `YOUR_CHANNEL_ID` with your Discord channel ID (see [Discord Setup Guide](./discord-setup.md#7-get-channel-ids)).

### 3. Start Claude Code with channels enabled

```bash
claude --dangerously-load-development-channels server:channel-mux
```

## Install from source (for development)

For contributors or testing unreleased changes.

### 1. Clone and build

```bash
git clone git@github.com:HealGaren/claude-channel-mux.git
cd claude-channel-mux
pnpm install
pnpm run build
```

### 2. Start the daemon

```bash
pnpm run dev          # foreground with watch mode
# or
node packages/cli/dist/cli.mjs daemon start   # background
```

### 3. Configure .mcp.json

```json
{
  "mcpServers": {
    "channel-mux": {
      "command": "node",
      "args": ["/path/to/claude-channel-mux/packages/discord/dist/plugin.mjs"],
      "env": {
        "CHANNEL_MUX_CHANNELS": "YOUR_CHANNEL_ID",
        "CHANNEL_MUX_HANDLE_DMS": "true"
      }
    }
  }
}
```

Or with tsx (direct TypeScript execution):

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

### 4. Start Claude Code

```bash
claude --dangerously-load-development-channels server:channel-mux
```

Or load it as a plugin directory:

```bash
claude --plugin-dir ./packages/discord --dangerously-load-development-channels plugin:channel-mux
```

### 5. Reload after changes

```bash
pnpm run build
```

Then in Claude Code:
```
/reload-plugins
```

## First conversation (DM pairing)

If `CHANNEL_MUX_HANDLE_DMS` is `true` and someone DMs the bot for the first time:

1. The bot sends a 6-character pairing code in the DM
2. In your Claude Code terminal, run: `/channel-mux:daemon pair <code>`
3. Lock down access: `/channel-mux:daemon policy allowlist`
4. The user is now paired and can chat with Claude through DMs

## Environment variables

| Variable | Description |
|---|---|
| `CHANNEL_MUX_CHANNELS` | Comma-separated Discord channel IDs to claim |
| `CHANNEL_MUX_HANDLE_DMS` | `true` to handle direct messages in this session |

## Troubleshooting

### Messages not arriving (tools work, but no push events)
You started Claude Code without `--channels` or `--dangerously-load-development-channels`. The MCP server connects and tools work, but channel push events are blocked. Restart with the flag.

### "cannot connect to daemon"
The daemon isn't running. Start it:
```bash
channel-mux daemon start
```

### "channel already claimed by another session"
Another Claude Code session has claimed that channel. Use different channel IDs per session, or stop the other session.

### "blocked by org policy"
Your Team/Enterprise admin needs to enable channels. See [Enterprise controls](https://code.claude.com/docs/en/channels#enterprise-controls).

### Plugin not showing up in Claude Code
- Check that `.mcp.json` is valid JSON
- Verify the command path is correct
- Restart Claude Code after changing `.mcp.json`

### Bot doesn't respond to DMs
- Make sure Claude Code is running with `--channels` or `--dangerously-load-development-channels`
- Check daemon log: `tail -f ~/.claude/channels/channel-mux/daemon.log`
- Check access policy: `/channel-mux:daemon`
