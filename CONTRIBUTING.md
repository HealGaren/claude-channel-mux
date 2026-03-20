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
- **kebab-case** for all file and folder names
- **pnpm** as the package manager

## Useful Commands

```bash
pnpm run typecheck   # Type check without emitting
pnpm run build       # Build to dist/
pnpm run dev         # Start daemon in watch mode
```

## Pull Request Process

1. Create a feature branch from `main`
2. Make your changes
3. Ensure `pnpm run typecheck` passes
4. Submit a PR with a clear description of the change

## Architecture

See [CLAUDE.md](CLAUDE.md) for architecture overview and conventions.

## Reporting Issues

Use [GitHub Issues](https://github.com/HealGaren/claude-channel-mux/issues). Include:
- Steps to reproduce
- Expected vs actual behavior
- Node.js version and OS
