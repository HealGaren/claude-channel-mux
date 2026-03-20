# claude-channel-mux

Multiplexes Claude Code channel sessions through a single Discord bot connection.

## Architecture

```
[Discord Bot]
       |
   [Daemon Process]  ← single bot connection, IPC server
       | Unix socket (JSON Lines)
   +---+---+
   |   |   |
 [A] [B] [C]  ← MCP server plugins, one per Claude Code session
```

- **Daemon**: Long-running process. Connects to Discord, listens on a Unix socket, routes messages between Discord and plugins.
- **Plugin**: Short-lived MCP server spawned by Claude Code. Connects to the daemon's Unix socket, registers channel claims, exposes MCP tools.

## Dev Setup

```bash
pnpm install
pnpm run typecheck   # type check
pnpm run dev         # start daemon with watch mode
```

## Project Conventions

- **Runtime**: Node.js with tsx (TypeScript execution)
- **Package manager**: pnpm
- **Language**: TypeScript, strict mode
- **Naming**: kebab-case for all files and folders
- **Module**: ESM (`"type": "module"`)

## Directory Structure

```
src/
├── core/           # IPC protocol, config, types
│   ├── types.ts
│   ├── config.ts
│   ├── ipc-server.ts
│   └── ipc-client.ts
├── adapters/       # Platform adapters (Discord, future: Slack)
│   └── discord/
│       ├── adapter.ts
│       ├── access.ts
│       └── utils.ts
├── daemon.ts       # Daemon entry point
├── plugin.ts       # MCP server plugin entry point
└── cli.ts          # CLI commands (start/stop/status)
```

## State Directory

All runtime state lives in `~/.claude/channels/channel-mux/`:
- `.env` — Bot token (`DISCORD_BOT_TOKEN=...`)
- `access.json` — Access control config
- `daemon.pid` / `daemon.sock` — Daemon process files
- `inbox/` — Downloaded attachments
- `approved/` — Pairing approval files

## IPC Protocol

JSON Lines over Unix domain socket at `~/.claude/channels/channel-mux/daemon.sock`.
See `src/core/types.ts` for message type definitions.

## Key Design Decisions

- Plugin does NOT auto-start daemon. User must start manually via `channel-mux start`.
- One bot token per daemon. Multi-bot not supported in v1.
- Unix socket only — Windows native not supported (WSL works).
- Access mutations only via terminal skill, never from channel messages (prompt injection defense).
