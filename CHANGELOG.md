# Changelog

# [0.1.0-alpha.3](https://github.com/HealGaren/claude-channel-mux/compare/v0.1.0-alpha.2...v0.1.0-alpha.3) (2026-03-20)


### Bug Fixes

* add shebang to bin entrypoints for direct execution ([#56](https://github.com/HealGaren/claude-channel-mux/issues/56)) ([ac90a62](https://github.com/HealGaren/claude-channel-mux/commit/ac90a6203ff55d59a595e9152d525a2f6f244e3d))

# [0.1.0-alpha.2](https://github.com/HealGaren/claude-channel-mux/compare/v0.1.0-alpha.1...v0.1.0-alpha.2) (2026-03-20)


### Bug Fixes

* use pnpm publish to resolve workspace:* protocol ([#49](https://github.com/HealGaren/claude-channel-mux/issues/49)) ([ce3d979](https://github.com/HealGaren/claude-channel-mux/commit/ce3d979438f3afa23d665eab71f80aada6452d6b))

# 0.1.0-alpha.1 (2026-03-20)


### Bug Fixes

* clear NODE_AUTH_TOKEN for OIDC trusted publishing ([#45](https://github.com/HealGaren/claude-channel-mux/issues/45)) ([e4ade1b](https://github.com/HealGaren/claude-channel-mux/commit/e4ade1b58da018a371a90b6bfadb6ed2037743bd))
* revert to NPM_TOKEN auth for publish ([#46](https://github.com/HealGaren/claude-channel-mux/issues/46)) ([44de72b](https://github.com/HealGaren/claude-channel-mux/commit/44de72b9779aa8e6bf0e4c10952218e91678cfb1))
* sync workspace package versions during release ([#40](https://github.com/HealGaren/claude-channel-mux/issues/40)) ([9ea0318](https://github.com/HealGaren/claude-channel-mux/commit/9ea0318f568058b1761cd4bb0bee41a1ce53d34e)), closes [#39](https://github.com/HealGaren/claude-channel-mux/issues/39)
* use npm Trusted Publishers instead of NPM_TOKEN ([#43](https://github.com/HealGaren/claude-channel-mux/issues/43)) ([a937a4f](https://github.com/HealGaren/claude-channel-mux/commit/a937a4ff6bb190121c2219715f93bfbfebcfd526))


### Features

* add Biome config and lint/format scripts ([#34](https://github.com/HealGaren/claude-channel-mux/issues/34)) ([311d807](https://github.com/HealGaren/claude-channel-mux/commit/311d80701ebf64103e16473bec8117ad2af3a625)), closes [#31](https://github.com/HealGaren/claude-channel-mux/issues/31)
* add Claude plugin manifest and access management skill ([3179702](https://github.com/HealGaren/claude-channel-mux/commit/3179702ae6a526075ab55f6471c0be1a828abd9b))
* add core types and config module ([d32557c](https://github.com/HealGaren/claude-channel-mux/commit/d32557cd2d6b231d8d6dcfc4d9a51ae36eab6935))
* add daemon, MCP plugin, and CLI ([a8e9019](https://github.com/HealGaren/claude-channel-mux/commit/a8e9019cb77a6e098f08a5aeff25a37405b67e17))
* add Discord adapter with access control and utilities ([8c7d2bc](https://github.com/HealGaren/claude-channel-mux/commit/8c7d2bc7a0859ed9a82411c49eec8a54b8334300))
* add GitHub Actions CI pipeline ([#22](https://github.com/HealGaren/claude-channel-mux/issues/22)) ([09a6943](https://github.com/HealGaren/claude-channel-mux/commit/09a694346f5569e8353bd2373fc920320bd1e930)), closes [#6](https://github.com/HealGaren/claude-channel-mux/issues/6)
* add IPC server and client for daemon↔plugin communication ([3d89cb9](https://github.com/HealGaren/claude-channel-mux/commit/3d89cb9c049e7942caf302f7f60728474192a137))
* add package.json exports map for library imports ([#25](https://github.com/HealGaren/claude-channel-mux/issues/25)) ([b7674f8](https://github.com/HealGaren/claude-channel-mux/commit/b7674f892b02cde3375ad9c5add6a116451eaa0f)), closes [#3](https://github.com/HealGaren/claude-channel-mux/issues/3)
* add tsdown bundle build ([#24](https://github.com/HealGaren/claude-channel-mux/issues/24)) ([bcd255f](https://github.com/HealGaren/claude-channel-mux/commit/bcd255f78684ff915eb478ab06f8c5192aff2ca3)), closes [#2](https://github.com/HealGaren/claude-channel-mux/issues/2)

# 0.1.0-alpha.0 (2026-03-20)


### Bug Fixes

* sync workspace package versions during release ([#40](https://github.com/HealGaren/claude-channel-mux/issues/40)) ([9ea0318](https://github.com/HealGaren/claude-channel-mux/commit/9ea0318f568058b1761cd4bb0bee41a1ce53d34e)), closes [#39](https://github.com/HealGaren/claude-channel-mux/issues/39)
* use npm Trusted Publishers instead of NPM_TOKEN ([#43](https://github.com/HealGaren/claude-channel-mux/issues/43)) ([a937a4f](https://github.com/HealGaren/claude-channel-mux/commit/a937a4ff6bb190121c2219715f93bfbfebcfd526))


### Features

* add Biome config and lint/format scripts ([#34](https://github.com/HealGaren/claude-channel-mux/issues/34)) ([311d807](https://github.com/HealGaren/claude-channel-mux/commit/311d80701ebf64103e16473bec8117ad2af3a625)), closes [#31](https://github.com/HealGaren/claude-channel-mux/issues/31)
* add Claude plugin manifest and access management skill ([3179702](https://github.com/HealGaren/claude-channel-mux/commit/3179702ae6a526075ab55f6471c0be1a828abd9b))
* add core types and config module ([d32557c](https://github.com/HealGaren/claude-channel-mux/commit/d32557cd2d6b231d8d6dcfc4d9a51ae36eab6935))
* add daemon, MCP plugin, and CLI ([a8e9019](https://github.com/HealGaren/claude-channel-mux/commit/a8e9019cb77a6e098f08a5aeff25a37405b67e17))
* add Discord adapter with access control and utilities ([8c7d2bc](https://github.com/HealGaren/claude-channel-mux/commit/8c7d2bc7a0859ed9a82411c49eec8a54b8334300))
* add GitHub Actions CI pipeline ([#22](https://github.com/HealGaren/claude-channel-mux/issues/22)) ([09a6943](https://github.com/HealGaren/claude-channel-mux/commit/09a694346f5569e8353bd2373fc920320bd1e930)), closes [#6](https://github.com/HealGaren/claude-channel-mux/issues/6)
* add IPC server and client for daemon↔plugin communication ([3d89cb9](https://github.com/HealGaren/claude-channel-mux/commit/3d89cb9c049e7942caf302f7f60728474192a137))
* add package.json exports map for library imports ([#25](https://github.com/HealGaren/claude-channel-mux/issues/25)) ([b7674f8](https://github.com/HealGaren/claude-channel-mux/commit/b7674f892b02cde3375ad9c5add6a116451eaa0f)), closes [#3](https://github.com/HealGaren/claude-channel-mux/issues/3)
* add tsdown bundle build ([#24](https://github.com/HealGaren/claude-channel-mux/issues/24)) ([bcd255f](https://github.com/HealGaren/claude-channel-mux/commit/bcd255f78684ff915eb478ab06f8c5192aff2ca3)), closes [#2](https://github.com/HealGaren/claude-channel-mux/issues/2)
