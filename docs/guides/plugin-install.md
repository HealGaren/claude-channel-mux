# Plugin Installation Guide

How to install and use claude-channel-mux as a Claude Code channel plugin.

> **Important**: Claude Code channels are in [research preview](https://code.claude.com/docs/en/channels#research-preview) and require Claude Code v2.1.80+, claude.ai login, and the `--channels` flag. Team/Enterprise orgs must enable channels in admin settings.

## Prerequisites

- [Claude Code](https://claude.com/claude-code) v2.1.80+ (`claude --version` to check)
- claude.ai account (Console/API key auth not supported for channels)
- Discord bot set up (see [Discord Setup Guide](./discord-setup.md))
- Bot token configured (`~/.claude/channels/channel-mux/.env`)

## Install from npm

### 1. Install the package

```bash
# npm
npm install -g @claude-channel-mux/cli

# pnpm
pnpm add -g @claude-channel-mux/cli

# yarn
yarn global add @claude-channel-mux/cli
```

This also installs `@claude-channel-mux/discord` as a dependency.

### 2. Start the daemon

```bash
channel-mux start
channel-mux status   # verify it's running
```

### 3. Configure .mcp.json

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

### 4. Start Claude Code with channels enabled

The `.mcp.json` alone connects the MCP server and its tools, but **channel messages (push events from Discord) only arrive when you enable channels** with the `--channels` flag.

During the research preview, custom channels need the development flag:

```bash
claude --dangerously-load-development-channels server:channel-mux
```

> `server:channel-mux` refers to the server name in your `.mcp.json` (`"channel-mux"`).

Once the project marketplace is set up, this will become:

```bash
claude --channels plugin:channel-mux@HealGaren/claude-channel-mux
```

### 5. Verify the connection

1. Check daemon logs: `tail -f ~/.claude/channels/channel-mux/daemon.log`
2. You should see: `channel-mux ipc: session <id> registered`
3. Send a message in your configured Discord channel or DM the bot
4. The message should appear in your Claude Code session as a `<channel>` tag

## Install from marketplace (planned)

A project marketplace will be published so users can install with:

```bash
# Add the marketplace (one-time)
/plugin marketplace add HealGaren/claude-channel-mux

# Install the plugin
/plugin install channel-mux@HealGaren/claude-channel-mux

# Start with channel enabled
claude --channels plugin:channel-mux@HealGaren/claude-channel-mux
```

Not available yet. See the [project roadmap](https://github.com/HealGaren/claude-channel-mux/issues/1).

> **Note**: This plugin connects to external services (Discord) and injects external messages into Claude sessions. Due to security considerations, it is distributed through a project marketplace rather than the official Anthropic marketplace.

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
node packages/cli/dist/cli.mjs start   # background
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
channel-mux start
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
