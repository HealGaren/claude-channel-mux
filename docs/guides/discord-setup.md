# Discord Bot Setup Guide

This guide walks through creating a Discord bot for claude-channel-mux.

## 1. Create a Discord Application

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click **New Application**
3. Enter a name (e.g. "Claude Channel Mux") and create

## 2. Create a Bot

1. Go to the **Bot** tab in your application
2. Click **Reset Token** and copy the token
3. Save it somewhere safe (you'll need it later)

## 3. Enable Required Intents

In the **Bot** tab, under **Privileged Gateway Intents**, enable:

- **Message Content Intent** (required to read message text)

The other intents (Presence, Server Members) are not needed.

## 4. Set Bot Permissions

The bot needs these permissions:

| Permission | Why |
|---|---|
| Send Messages | Reply to users |
| Read Message History | Fetch channel history |
| Add Reactions | Ack reactions, emoji reactions |
| Attach Files | Send file attachments |

## 5. Generate Invite URL

1. Go to **OAuth2 > URL Generator**
2. Under **Scopes**, select `bot`
3. Under **Bot Permissions**, select the permissions above
4. Copy the generated URL
5. Open it in your browser to invite the bot to your server

## 6. Configure claude-channel-mux

Save the bot token:

```bash
mkdir -p ~/.claude/channels/channel-mux
echo "DISCORD_BOT_TOKEN=your_token_here" > ~/.claude/channels/channel-mux/.env
```

## 7. Get Channel IDs

To configure which channels the bot listens to:

1. Open Discord Settings > Advanced > enable **Developer Mode**
2. Right-click a channel > **Copy Channel ID**

You'll use these IDs in your `.mcp.json` configuration. See [MCP Configuration Guide](./mcp-config.md).

## Troubleshooting

### Bot doesn't respond to messages
- Check that **Message Content Intent** is enabled
- Verify the bot is in the server (check member list)
- Check `~/.claude/channels/channel-mux/daemon.log` for errors

### "DISCORD_BOT_TOKEN required" error
- Verify `~/.claude/channels/channel-mux/.env` exists and contains the token
- Make sure there are no extra spaces or quotes around the token

### Bot can't see a channel
- Check the bot has permission to view that channel
- Some channels may have permission overrides that exclude the bot role
