# @claude-channel-mux/cli

CLI for [claude-channel-mux](https://github.com/HealGaren/claude-channel-mux) daemon lifecycle management.

> **Note**: This is a community project and is not affiliated with or endorsed by Anthropic.

## Install

```bash
npm install -g @claude-channel-mux/cli
```

## Usage

```bash
channel-mux start    # Start daemon in background
channel-mux stop     # Stop daemon (SIGTERM, then SIGKILL)
channel-mux status   # Check if daemon is running
```

## Prerequisites

Requires `@claude-channel-mux/discord` to be installed (provides the daemon binary).

## License

[MIT](https://github.com/HealGaren/claude-channel-mux/blob/main/LICENSE)
