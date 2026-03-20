# @claude-channel-mux/core

Core library for [claude-channel-mux](https://github.com/HealGaren/claude-channel-mux): IPC protocol, types, gate logic, and configuration.

> **Note**: This is a community project and is not affiliated with or endorsed by Anthropic.

## Install

```bash
npm install @claude-channel-mux/core
```

## Usage

```ts
import {
  IpcServer,
  IpcClient,
  evaluateGate,
  type PlatformAdapter,
  type InboundMsg,
  type Access,
} from '@claude-channel-mux/core'
```

## What's included

- **Types**: IPC protocol messages, `PlatformAdapter` interface, `Access` config types
- **IPC Server/Client**: Unix socket communication (JSON Lines)
- **Gate logic**: `evaluateGate()` for access control decisions (DM pairing, guild policies)
- **Config**: State directory paths, `.env` loader

## License

[MIT](https://github.com/HealGaren/claude-channel-mux/blob/main/LICENSE)
