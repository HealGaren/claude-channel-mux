import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    daemon: 'src/daemon.ts',
    plugin: 'src/plugin.ts',
    cli: 'src/cli.ts',
    types: 'src/exports/types.ts',
    ipc: 'src/exports/ipc.ts',
    'adapters-discord': 'src/exports/adapters-discord.ts',
  },
  format: 'esm',
  dts: true,
  outDir: 'dist',
  clean: true,
})
