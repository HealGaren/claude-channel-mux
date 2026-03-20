# Contributing to claude-channel-mux

Thanks for your interest in contributing!

## Development Setup

```bash
git clone https://github.com/HealGaren/claude-channel-mux.git
cd claude-channel-mux
pnpm install
```

## Code Style

- **TypeScript** strict mode, ESM (`"type": "module"`)
- **Biome** for linting and formatting (`pnpm run lint:fix`)
- **kebab-case** for all file and folder names
- **pnpm** workspaces

## Useful Commands

```bash
pnpm run check       # Run all checks (lint, build, typecheck, test, smoke)
pnpm run lint        # Lint only
pnpm run lint:fix    # Auto-fix lint issues
pnpm run build       # Build all packages
pnpm run typecheck   # Type check all packages
pnpm run test        # Unit tests
pnpm run test:smoke  # Integration smoke tests
pnpm run dev         # Start daemon in watch mode
```

## Pull Request Process

1. Create a feature branch from `main`
2. Make your changes
3. Run `pnpm run check` before pushing
4. Submit a PR with a clear description

## Architecture

See [CLAUDE.md](CLAUDE.md) for architecture overview and conventions.

## Reporting Issues

Use [GitHub Issues](https://github.com/HealGaren/claude-channel-mux/issues). Include:
- Steps to reproduce
- Expected vs actual behavior
- Node.js version and OS
