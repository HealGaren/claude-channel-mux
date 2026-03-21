# Changelog

## [0.1.2](https://github.com/HealGaren/claude-channel-mux/compare/v0.1.1-alpha.1...v0.1.2) (2026-03-21)

First stable release of claude-channel-mux.

### Features

* **Core architecture**: daemon + plugin model with Unix socket IPC (JSON Lines protocol) ([d32557c](https://github.com/HealGaren/claude-channel-mux/commit/d32557c), [3d89cb9](https://github.com/HealGaren/claude-channel-mux/commit/3d89cb9), [a8e9019](https://github.com/HealGaren/claude-channel-mux/commit/a8e9019))
* **Discord adapter**: reply, react, edit, fetch messages, download attachments ([8c7d2bc](https://github.com/HealGaren/claude-channel-mux/commit/8c7d2bc))
* **Access control**: pure gate logic with allowlist, pairing approval, DM/group policy ([8ef5ad4](https://github.com/HealGaren/claude-channel-mux/commit/8ef5ad4))
* **MCP plugin**: 5 tools (reply, react, edit_message, fetch_messages, download_attachment) exposed via Model Context Protocol ([a8e9019](https://github.com/HealGaren/claude-channel-mux/commit/a8e9019))
* **CLI**: `channel-mux daemon` (start/stop/status/group) and `channel-mux session` (view/channels/dms) commands ([1c214d5](https://github.com/HealGaren/claude-channel-mux/commit/1c214d5), [be59941](https://github.com/HealGaren/claude-channel-mux/commit/be59941))
* **Channel config commands**: CLI and skill for managing session channels/DMs ([#93](https://github.com/HealGaren/claude-channel-mux/issues/93)) ([cc671c9](https://github.com/HealGaren/claude-channel-mux/commit/cc671c9))
* **Plugin marketplace**: .mcp.json support for Claude Code plugin discovery ([#69](https://github.com/HealGaren/claude-channel-mux/issues/69)) ([28956f6](https://github.com/HealGaren/claude-channel-mux/commit/28956f6), [#91](https://github.com/HealGaren/claude-channel-mux/issues/91)) ([4c8e727](https://github.com/HealGaren/claude-channel-mux/commit/4c8e727))
* **Daemon monitoring**: HTTP health-check server ([#80](https://github.com/HealGaren/claude-channel-mux/issues/80)) ([cfd4e56](https://github.com/HealGaren/claude-channel-mux/commit/cfd4e56))
* **Verbose debug logging**: `--verbose` flag for troubleshooting ([#79](https://github.com/HealGaren/claude-channel-mux/issues/79)) ([5eeda9d](https://github.com/HealGaren/claude-channel-mux/commit/5eeda9d))
* **Claude plugin manifest**: access management skill for terminal-only access control ([3179702](https://github.com/HealGaren/claude-channel-mux/commit/3179702))
* **Monorepo**: pnpm workspaces with @claude-channel-mux/core, @claude-channel-mux/discord, @claude-channel-mux/cli ([57683f4](https://github.com/HealGaren/claude-channel-mux/commit/57683f4))
* **Build**: tsdown bundle build with package.json exports map ([#24](https://github.com/HealGaren/claude-channel-mux/issues/24)) ([bcd255f](https://github.com/HealGaren/claude-channel-mux/commit/bcd255f), [#25](https://github.com/HealGaren/claude-channel-mux/issues/25)) ([b7674f8](https://github.com/HealGaren/claude-channel-mux/commit/b7674f8))
* **CI/CD**: GitHub Actions pipeline with lint, build, typecheck, test, smoke tests ([#22](https://github.com/HealGaren/claude-channel-mux/issues/22)) ([09a6943](https://github.com/HealGaren/claude-channel-mux/commit/09a6943))
* **Biome**: lint + format with single quotes, no semicolons, trailing commas ([#34](https://github.com/HealGaren/claude-channel-mux/issues/34)) ([311d807](https://github.com/HealGaren/claude-channel-mux/commit/311d807))

### Bug Fixes

* run biome format after version sync in release hook ([fa2166d](https://github.com/HealGaren/claude-channel-mux/commit/fa2166d))
* exclude settings.local.json from biome checks ([#90](https://github.com/HealGaren/claude-channel-mux/issues/90)) ([03a392f](https://github.com/HealGaren/claude-channel-mux/commit/03a392f))
* add shebang to bin entrypoints for direct execution ([#56](https://github.com/HealGaren/claude-channel-mux/issues/56)) ([ac90a62](https://github.com/HealGaren/claude-channel-mux/commit/ac90a62))
* use pnpm publish to resolve workspace:* protocol ([#49](https://github.com/HealGaren/claude-channel-mux/issues/49)) ([ce3d979](https://github.com/HealGaren/claude-channel-mux/commit/ce3d979))
* sync workspace package versions during release ([#40](https://github.com/HealGaren/claude-channel-mux/issues/40)) ([9ea0318](https://github.com/HealGaren/claude-channel-mux/commit/9ea0318))
