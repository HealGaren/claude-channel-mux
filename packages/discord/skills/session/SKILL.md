---
name: session
description: Configure channel-mux session routing -- set which Discord channels this session receives. Use when the user wants to configure channels for their session.
user-invocable: true
allowed-tools:
  - Read
  - Write
---

# /channel-mux:session -- Session Configuration

Configures session-level settings for channel-mux. Currently supports setting
which Discord channels this Claude session receives messages from.

Arguments passed: `$ARGUMENTS`

---

## Dispatch on arguments

Parse `$ARGUMENTS` (space-separated). If empty or unrecognized, show current
config by reading the relevant `.mcp.json` files and reporting
`CHANNEL_MUX_CHANNELS` values found.

### `channels <channelId1> [channelId2 ...]` (optional: `--scope user|project|local`)

Configure which daemon channels this Claude session receives. Writes the
`CHANNEL_MUX_CHANNELS` env var into the appropriate `.mcp.json` file.

Scope determines which `.mcp.json` to write:
- `user` -- `~/.claude/.mcp.json` (applies to all sessions)
- `project` -- `.mcp.json` in the current project root (applies to this project)
- `local` -- `.claude/.mcp.json` in the current project root (gitignored, this machine only)

Default scope: `local` (safest, no risk of committing channel IDs to git).

Steps:
1. Determine the target `.mcp.json` path based on `--scope`.
2. Read the existing file (or start with `{}`).
3. Set/update `mcpServers["channel-mux"].env.CHANNEL_MUX_CHANNELS` to the
   comma-joined channel IDs.
4. Preserve all other fields in the file.
5. Write back with 2-space indent.
6. Confirm the path written and the channel IDs set.
7. Tell the user to restart Claude Code for changes to take effect.

### `dms <true|false>` (optional: `--scope user|project|local`)

Set whether this session handles DMs. Same scope logic as `channels`.
Writes `CHANNEL_MUX_HANDLE_DMS` to the `.mcp.json` env block.

---

## Implementation notes

- Always Read before Write -- the file may have other MCP servers configured.
- Pretty-print JSON (2-space indent).
- If `mcpServers` or `mcpServers["channel-mux"]` or `mcpServers["channel-mux"].env`
  doesn't exist in the target file, create the nested structure.
- Multiple channel IDs are comma-joined into a single string value.
