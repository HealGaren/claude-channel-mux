# @claude-channel-mux/cli

CLI for [claude-channel-mux](https://github.com/HealGaren/claude-channel-mux) daemon lifecycle management.

> **Note**: This is a community project and is not affiliated with or endorsed by Anthropic.

## Install

```bash
npm install -g @claude-channel-mux/cli
```

## Usage

```bash
channel-mux daemon start    # Start daemon in background
channel-mux daemon stop     # Stop daemon (SIGTERM, then SIGKILL)
channel-mux daemon status   # Check if daemon is running
channel-mux session         # View session routing config
```

## Note

`@claude-channel-mux/discord` is included as a dependency and installed automatically (provides the daemon binary).

## License

[MIT](https://github.com/HealGaren/claude-channel-mux/blob/main/LICENSE)
