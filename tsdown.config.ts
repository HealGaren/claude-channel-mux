import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    daemon: 'src/daemon.ts',
    plugin: 'src/plugin.ts',
    cli: 'src/cli.ts',
  },
  format: 'esm',
  dts: true,
  outDir: 'dist',
  clean: true,
})
