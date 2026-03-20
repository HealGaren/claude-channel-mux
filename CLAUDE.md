# claude-channel-mux

Multiplexes Claude Code channel sessions through a single Discord bot connection.

## Architecture

```
[Discord Bot]
       |
   [Daemon Process]  <- single bot connection, IPC server
       | Unix socket (JSON Lines)
   +---+---+
   |   |   |
 [A] [B] [C]  <- MCP server plugins, one per Claude Code session
```

- **Daemon**: Long-running process. Connects to Discord, listens on a Unix socket, routes messages between Discord and plugins.
- **Plugin**: Short-lived MCP server spawned by Claude Code. Connects to the daemon's Unix socket, registers channel claims, exposes MCP tools.

## Dev Setup

```bash
pnpm install
pnpm run typecheck   # type check all packages
pnpm run build       # build all packages (pnpm -r run build)
pnpm run dev         # start daemon with watch mode
pnpm run test        # run tests across all packages
```

## Project Conventions

- **Runtime**: Node.js with tsx (TypeScript execution)
- **Package manager**: pnpm (workspaces)
- **Language**: TypeScript, strict mode
- **Naming**: kebab-case for all files and folders
- **Module**: ESM (`"type": "module"`)

## Monorepo Structure

This is a pnpm workspace monorepo with three packages:

```
packages/
  core/       @claude-channel-mux/core     # IPC protocol, config, types
  discord/    @claude-channel-mux/discord   # Discord adapter, daemon, MCP plugin
  cli/        @claude-channel-mux/cli       # CLI commands (start/stop/status)
```

### packages/core
Shared types, IPC protocol, config loading. Depended on by both discord and cli.

### packages/discord
Discord adapter, daemon entry point, MCP server plugin, access control, utilities.

### packages/cli
CLI binary (`channel-mux`) for daemon lifecycle management. Spawns the daemon
from `@claude-channel-mux/discord`.

## State Directory

All runtime state lives in `~/.claude/channels/channel-mux/`:
- `.env` -- Bot token (`DISCORD_BOT_TOKEN=...`)
- `access.json` -- Access control config
- `daemon.pid` / `daemon.sock` -- Daemon process files
- `inbox/` -- Downloaded attachments
- `approved/` -- Pairing approval files

## IPC Protocol

JSON Lines over Unix domain socket at `~/.claude/channels/channel-mux/daemon.sock`.
See `packages/core/src/types.ts` for message type definitions.

## Key Design Decisions

- Plugin does NOT auto-start daemon. User must start manually via `channel-mux start`.
- One bot token per daemon. Multi-bot not supported in v1.
- Unix socket only -- Windows native not supported (WSL works).
- Access mutations only via terminal skill, never from channel messages (prompt injection defense).
