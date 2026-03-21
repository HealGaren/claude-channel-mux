#!/usr/bin/env tsx
/**
 * Sync the root package.json version to all workspace packages.
 * Called by release-it after:bump hook.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const rootPkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
const version = rootPkg.version

if (!version) {
  process.stderr.write('sync-versions: no version found in root package.json\n')
  process.exit(1)
}

const packages = ['core', 'discord', 'cli']

for (const pkg of packages) {
  const pkgPath = join(ROOT, 'packages', pkg, 'package.json')
  const pkgJson = JSON.parse(readFileSync(pkgPath, 'utf8'))
  pkgJson.version = version
  writeFileSync(pkgPath, `${JSON.stringify(pkgJson, null, 2)}\n`)
  process.stderr.write(`sync-versions: ${pkgJson.name} -> ${version}\n`)
}

// Sync plugin.json version (used by Claude Code for update detection)
const pluginJsonPath = join(ROOT, 'packages', 'discord', '.claude-plugin', 'plugin.json')
const pluginJson = JSON.parse(readFileSync(pluginJsonPath, 'utf8'))
pluginJson.version = version
writeFileSync(pluginJsonPath, `${JSON.stringify(pluginJson, null, 2)}\n`)
process.stderr.write(`sync-versions: plugin.json -> ${version}\n`)

// Sync marketplace.json plugin version
const marketplacePath = join(ROOT, '.claude-plugin', 'marketplace.json')
const marketplace = JSON.parse(readFileSync(marketplacePath, 'utf8'))
for (const plugin of marketplace.plugins) {
  if (plugin.source?.source === 'npm') {
    plugin.source.version = version
  }
}
writeFileSync(marketplacePath, `${JSON.stringify(marketplace, null, 2)}\n`)
process.stderr.write(`sync-versions: marketplace.json -> ${version}\n`)
