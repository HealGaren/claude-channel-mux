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

The other intents (Presence, Server Members) are not needed currently.

## 4. Set Bot Permissions

Select all permissions you want from the table below. We recommend enabling recommended permissions upfront so you don't need to re-invite later.

### Required

These are needed for core functionality:

| Permission | What it enables |
|---|---|
| View Channels | See channel list and read messages |
| Send Messages | Reply to users |
| Read Message History | Fetch channel history |
| Add Reactions | Ack reactions, emoji reactions |
| Attach Files | Send file attachments |

### Recommended

These enable useful features that are available or planned:

| Permission | What it enables |
|---|---|
| Embed Links | Rich message formatting (links, previews) |
| Create Public Threads | Thread-based conversations |
| Send Messages in Threads | Reply within threads |
| Manage Messages | Pin messages, clean up conversations |
| Change Nickname | Show bot status in server nickname |

### Future (voice channel presence)

These are for a planned feature that uses voice channel presence to indicate daemon/session status (e.g. connected = running, muted = idle). Not required now, but saves a re-invite later.

| Permission | What it enables |
|---|---|
| Connect | Join voice channels |
| Speak | Voice presence indication |
| Video | Visual status indicator |
| Use Voice Activity Detection | Activity-based status |

## 5. Generate Invite URL

1. Go to **OAuth2 > URL Generator**
2. Under **Scopes**, select `bot`
3. Under **Bot Permissions**, select the permissions from the tables above
4. Copy the generated URL
5. Open it in your browser to invite the bot to your server

> **Tip**: If you add permissions later, you'll need to re-invite the bot using a new URL with the updated permissions. Users won't lose any data.

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
- Check the bot has **View Channels** permission
- Some channels may have permission overrides that exclude the bot role
