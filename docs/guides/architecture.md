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
    participant Daemon as Daemon (IPC Server)
    participant A as Adapter
    participant D as Discord

    C->>P: call tool (reply/react/edit/fetch/download)
    P->>Daemon: tool_call { id, tool, args }
    Daemon->>A: adapter.reply(args)
    A->>A: chunk text, load files
    A->>D: channel.send()
    D-->>A: sent message
    A-->>Daemon: { sentIds }
    Daemon-->>P: tool_result { id, ok, sentIds }
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

Gate logic is pure (no platform deps) in `core/gate.ts`. The Discord adapter resolves mentions and reads `access.json` before delegating to the pure function.

**DM messages:**

```mermaid
flowchart LR
    DM([DM arrives]) --> Policy{dmPolicy?}
    Policy -->|disabled| Drop([Drop])
    Policy -->|allowlist / pairing| Allow{sender in allowFrom?}
    Allow -->|Yes| Deliver([Deliver])
    Allow -->|No| Mode{dmPolicy?}
    Mode -->|allowlist| Drop
    Mode -->|pairing| Pair([Pair: send code])
```

**Guild messages:**

```mermaid
flowchart LR
    Msg([Guild message]) --> Policy{group policy exists?}
    Policy -->|No| Drop([Drop])
    Policy -->|Yes| Allow{sender in allowFrom?}
    Allow -->|not in list| Drop
    Allow -->|pass| Mention{requireMention?}
    Mention -->|Yes, not mentioned| Drop
    Mention -->|No / mentioned| Deliver([Deliver])
```

## State Directory

All runtime state lives in `~/.claude/channels/channel-mux/`.

### User Config

```mermaid
graph LR
    subgraph Components
        Daemon
        Gate
        Skill[Access Skill]
    end
    subgraph Files
        ENV[.env]
        ACC[access.json]
    end

    ENV -->|read on startup| Daemon
    ACC -->|read per message| Gate
    ACC -->|read/write| Skill
```

| File | Description |
|---|---|
| `.env` | Bot token (`DISCORD_BOT_TOKEN`), monitor port, etc. |
| `access.json` | Access control: DM policy, channel groups, allowlists |

### Daemon Lifecycle

Ephemeral files -- created on startup, cleaned up on shutdown or by `channel-mux stop`.

```mermaid
graph LR
    subgraph Daemon
        D[ ]
    end
    subgraph Files
        PID[daemon.pid]
        SOCK[daemon.sock]
        MON[monitor.port]
    end

    D -->|start / stop| PID
    D -->|start / stop| SOCK
    D -->|start / stop| MON
```

```mermaid
graph LR
    subgraph CLI
        C[ ]
    end
    subgraph Files
        PID[daemon.pid]
        SOCK[daemon.sock]
        MON[monitor.port]
    end

    C -->|read status / cleanup| PID
    C -->|cleanup| SOCK
    C -->|read status / cleanup| MON
```

### Pairing Bridge

```mermaid
graph LR
    subgraph Components
        Skill[Access Skill]
        Adapter
    end
    subgraph Files
        APR[approved/]
    end

    Skill -->|write approval| APR
    APR -->|poll & consume| Adapter
```

The `approved/` directory bridges the terminal skill and the daemon. The skill writes a file per approved user; the adapter polls and deletes it after sending confirmation.

### Attachments

```mermaid
graph LR
    subgraph Components
        Adapter
        Claude[Claude Code]
    end
    subgraph Files
        INB[inbox/]
    end

    Adapter -->|download & save| INB
    INB -->|read| Claude
```

## IPC Protocol

JSON Lines (newline-delimited JSON) over Unix domain socket.

**Plugin to Daemon:**

| Message | Purpose |
|---|---|
| `register` | Claim channels, opt into DMs |
| `tool_call` | Execute adapter tool (reply, react, etc.) |
| `unregister` | Release claims |
| `ping` | Keep-alive |

**Daemon to Plugin:**

| Message | Purpose |
|---|---|
| `register_ack` | Registration result + bot username |
| `tool_result` | Tool call response |
| `pong` | Keep-alive response |
| `inbound` | Routed Discord message |
| `shutdown` | Daemon shutting down |
