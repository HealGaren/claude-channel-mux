# Architecture

> Overview of the claude-channel-mux system architecture.

## System Overview

```mermaid
graph TB
    subgraph Discord
        Bot[Discord Bot]
    end

    subgraph Daemon Process
        Adapter[DiscordAdapter]
        Gate[Gate Check]
        IPC[IPC Server]
        Monitor[Monitor Server]
    end

    subgraph Claude Code Sessions
        P1[Plugin A]
        P2[Plugin B]
        P3[Plugin C]
    end

    Bot <-->|Discord.js| Adapter
    Adapter -->|inbound msg| Gate
    Gate -->|deliver| IPC
    IPC <-->|Unix socket| P1
    IPC <-->|Unix socket| P2
    IPC <-->|Unix socket| P3
    Monitor -.->|status query| IPC
```

The daemon holds a single Discord bot connection and multiplexes messages to multiple Claude Code sessions via Unix socket IPC. Each session runs as an MCP server plugin that connects to the daemon.

## Package Dependency Graph

```mermaid
graph LR
    CLI["@claude-channel-mux/cli<br/><small>start · stop · status</small>"]
    Discord["@claude-channel-mux/discord<br/><small>adapter · daemon · plugin</small>"]
    Core["@claude-channel-mux/core<br/><small>IPC · types · gate · config</small>"]

    CLI --> Core
    CLI --> Discord
    Discord --> Core
```

| Package | Responsibility |
|---|---|
| **core** | Platform-agnostic: IPC protocol, types, gate logic, config paths |
| **discord** | Platform-specific: Discord.js adapter, daemon wiring, MCP plugin |
| **cli** | Daemon process management (start/stop/status) |

## Message Flow: Inbound (Discord to Claude)

```mermaid
sequenceDiagram
    participant D as Discord
    participant A as Adapter
    participant G as Gate
    participant IPC as IPC Server
    participant P as Plugin
    participant C as Claude Code

    D->>A: messageCreate event
    A->>A: filter own/bot messages
    A->>G: gate({ platform, raw })
    G->>G: read access.json
    G->>G: check mention / allowlist
    G->>G: evaluateGate()

    alt deliver
        G-->>A: { action: deliver }
        A->>A: build InboundMsg
        A->>IPC: routeInbound(msg)
        IPC->>IPC: lookup session by channelId or DM
        IPC->>P: send via socket
        P->>C: MCP notification
    else drop
        G-->>A: { action: drop }
        A->>A: ignore
    else pair
        G-->>A: { action: pair, code }
        A->>D: send pairing code
    end
```

## Message Flow: Outbound (Claude to Discord)

```mermaid
sequenceDiagram
    participant C as Claude Code
    participant P as Plugin
    participant IPC as IPC Server
    participant Daemon as Daemon
    participant A as Adapter
    participant D as Discord

    C->>P: call tool (reply/react/edit/fetch/download)
    P->>IPC: tool_call { id, tool, args }
    IPC->>Daemon: toolCallHandler(tool, args)
    Daemon->>A: adapter.reply(args)
    A->>A: chunk text, load files
    A->>D: channel.send()
    D-->>A: sent message
    A-->>Daemon: { sentIds }
    Daemon-->>IPC: tool_result { id, ok, sentIds }
    IPC-->>P: response via socket
    P-->>C: tool result
```

## Session Registration

```mermaid
sequenceDiagram
    participant CC as Claude Code
    participant P as Plugin
    participant IPC as IPC Server

    CC->>P: spawn (env: CHANNELS, HANDLE_DMS)
    P->>IPC: connect to daemon.sock
    P->>IPC: register { sessionId, channels, handleDMs }

    alt no conflict
        IPC->>IPC: store session, map channels
        IPC-->>P: register_ack { ok: true, botUsername }
        P->>P: start MCP server
        P->>CC: ready (stdio transport)
    else conflict
        IPC-->>P: register_ack { ok: false, error }
        P->>P: exit with error
    end
```

Session claims are exclusive: one session per channel, one session for DMs. Re-registration from the same session ID releases old claims first.

## Access Control (Gate)

```mermaid
flowchart TD
    Start([Message arrives]) --> IsDM{DM?}

    IsDM -->|Yes| DmPolicy{dmPolicy}
    DmPolicy -->|disabled| Drop([Drop])
    DmPolicy -->|allowlist / pairing| InAllowFrom{sender in allowFrom?}
    InAllowFrom -->|Yes| Deliver([Deliver])
    InAllowFrom -->|No| IsAllowlist{dmPolicy = allowlist?}
    IsAllowlist -->|Yes| Drop
    IsAllowlist -->|No| Pair([Pair: send code])

    IsDM -->|No| HasPolicy{group policy exists?}
    HasPolicy -->|No| Drop
    HasPolicy -->|Yes| CheckAllow{allowFrom filter?}
    CheckAllow -->|not in list| Drop
    CheckAllow -->|pass| NeedMention{requireMention?}
    NeedMention -->|Yes, not mentioned| Drop
    NeedMention -->|No / mentioned| Deliver
```

Gate logic is pure (no platform deps) in `core/gate.ts`. The Discord adapter resolves mentions and reads `access.json` before delegating to the pure function.

## State Directory

All runtime state lives in `~/.claude/channels/channel-mux/`:

```
~/.claude/channels/channel-mux/
  .env              Bot token (DISCORD_BOT_TOKEN)
  access.json       Access control config
  daemon.pid        Running daemon PID
  daemon.sock       Unix domain socket
  daemon.log        Daemon stderr output
  monitor.port      Monitor server port (if enabled)
  inbox/            Downloaded attachments
  approved/         Pairing approval files
```

## IPC Protocol

JSON Lines (newline-delimited JSON) over Unix domain socket.

```mermaid
graph LR
    subgraph "Plugin to Daemon"
        R[register]
        T[tool_call]
        U[unregister]
        PI[ping]
    end

    subgraph "Daemon to Plugin"
        RA[register_ack]
        I[inbound]
        TR[tool_result]
        PO[pong]
        S[shutdown]
    end
```

| Direction | Message | Purpose |
|---|---|---|
| Plugin to Daemon | `register` | Claim channels, opt into DMs |
| Plugin to Daemon | `tool_call` | Execute adapter tool (reply, react, etc.) |
| Plugin to Daemon | `unregister` | Release claims |
| Plugin to Daemon | `ping` | Keep-alive |
| Daemon to Plugin | `register_ack` | Registration result + bot username |
| Daemon to Plugin | `inbound` | Routed Discord message |
| Daemon to Plugin | `tool_result` | Tool call response |
| Daemon to Plugin | `pong` | Keep-alive response |
| Daemon to Plugin | `shutdown` | Daemon shutting down |
