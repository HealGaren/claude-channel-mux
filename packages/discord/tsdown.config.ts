import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    daemon: 'src/daemon.ts',
    plugin: 'src/plugin.ts',
  },
  format: 'esm',
  dts: true,
  outDir: 'dist',
  clean: true,
})
