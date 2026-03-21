#!/usr/bin/env node
import { execSync, spawn } from 'node:child_process'
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, unlinkSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { MONITOR_PORT_FILE, PID_FILE, SOCK_PATH, STATE_DIR } from '@claude-channel-mux/core'
import { readAccessFile, saveAccess } from '@claude-channel-mux/discord'

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function readPid(): number | null {
  try {
    const pid = parseInt(readFileSync(PID_FILE, 'utf8').trim(), 10)
    return Number.isNaN(pid) ? null : pid
  } catch {
    return null
  }
}

function cleanupStateFiles(): void {
  try {
    unlinkSync(PID_FILE)
  } catch {}
  try {
    unlinkSync(SOCK_PATH)
  } catch {}
  try {
    unlinkSync(MONITOR_PORT_FILE)
  } catch {}
}

/**
 * Resolve the daemon command and arguments.
 *
 * Resolution order:
 * 1. channel-mux-daemon bin on PATH (production global install)
 * 2. Built daemon.mjs via import.meta.resolve (production local install)
 * 3. Source daemon.ts via tsx (development)
 */
function resolveDaemonCommand(): { runner: string; args: string[] } {
  // 1. Try bin on PATH
  try {
    const daemonBin = execSync('which channel-mux-daemon', { encoding: 'utf8' }).trim()
    return { runner: process.execPath, args: [daemonBin] }
  } catch {
    // not on PATH
  }

  // 2-3. Resolve via discord package
  try {
    const discordPkg = import.meta.resolve('@claude-channel-mux/discord')
    const discordDir = new URL('.', discordPkg).pathname

    const builtDaemon = join(discordDir, 'daemon.mjs')
    if (existsSync(builtDaemon)) {
      return { runner: process.execPath, args: [builtDaemon] }
    }

    const srcDaemon = join(discordDir, '..', 'src', 'daemon.ts')
    if (existsSync(srcDaemon)) {
      const tsx = execSync('which tsx', { encoding: 'utf8' }).trim()
      return { runner: tsx, args: [srcDaemon] }
    }
  } catch (err) {
    process.stderr.write(`channel-mux: daemon resolve failed: ${err}\n`)
  }

  console.error(
    'channel-mux: cannot locate daemon. Ensure @claude-channel-mux/discord is installed.',
  )
  process.exit(1)
}

const command = process.argv[2]

switch (command) {
  case 'daemon': {
    const daemonSub = process.argv[3]

    switch (daemonSub) {
      case 'start': {
        const verbose = process.argv.slice(3).includes('--verbose')

        const pid = readPid()
        if (pid && isProcessAlive(pid)) {
          console.log(`channel-mux daemon already running (pid ${pid})`)
          process.exit(0)
        }

        if (pid && !isProcessAlive(pid)) {
          cleanupStateFiles()
        }

        const logPath = join(STATE_DIR, 'daemon.log')
        const { runner, args: runnerArgs } = resolveDaemonCommand()

        mkdirSync(STATE_DIR, { recursive: true })
        let logFd: number
        try {
          logFd = openSync(logPath, 'a')
        } catch {
          console.error(`channel-mux: cannot open log file: ${logPath}`)
          process.exit(1)
        }

        const child = spawn(runner, runnerArgs, {
          stdio: ['ignore', 'ignore', logFd],
          detached: true,
          env: {
            ...process.env,
            ...(verbose ? { CHANNEL_MUX_DEBUG: '1' } : {}),
          },
        })
        child.unref()
        closeSync(logFd)

        // Wait briefly for PID file
        await new Promise((r) => setTimeout(r, 2000))

        const newPid = readPid()
        if (newPid && isProcessAlive(newPid)) {
          console.log(`channel-mux daemon started (pid ${newPid})`)
          console.log(`  log: ${logPath}`)
          if (verbose) console.log('  verbose logging enabled')
        } else {
          console.error('channel-mux: daemon failed to start. Check daemon.log')
          process.exit(1)
        }
        break
      }

      case 'stop': {
        const pid = readPid()
        if (!pid || !isProcessAlive(pid)) {
          console.log('channel-mux daemon is not running')
          cleanupStateFiles()
          process.exit(0)
        }

        process.kill(pid, 'SIGTERM')

        // Wait for graceful shutdown (up to 5s)
        let stopped = false
        for (let i = 0; i < 50; i++) {
          await new Promise((r) => setTimeout(r, 100))
          if (!isProcessAlive(pid)) {
            stopped = true
            break
          }
        }

        if (!stopped) {
          process.stderr.write('channel-mux: SIGTERM timeout, sending SIGKILL\n')
          try {
            process.kill(pid, 'SIGKILL')
          } catch (err) {
            process.stderr.write(`channel-mux: SIGKILL failed: ${err}\n`)
          }
        }

        cleanupStateFiles()
        console.log('channel-mux daemon stopped')
        break
      }

      case 'status': {
        const pid = readPid()
        const sockExists = existsSync(SOCK_PATH)

        if (pid && isProcessAlive(pid)) {
          console.log(`channel-mux daemon: running (pid ${pid})`)
          console.log(`  socket: ${SOCK_PATH} (${sockExists ? 'exists' : 'missing'})`)
          console.log(`  state: ${STATE_DIR}`)
          try {
            const port = readFileSync(MONITOR_PORT_FILE, 'utf8').trim()
            console.log(`  monitor: http://127.0.0.1:${port}`)
          } catch {
            // monitor not enabled
          }
        } else {
          console.log('channel-mux daemon: stopped')
          if (pid) console.log(`  stale pid file: ${PID_FILE}`)
          if (sockExists) console.log(`  stale socket: ${SOCK_PATH}`)
        }
        break
      }

      case 'group': {
        const groupSub = process.argv[4]
        const groupArgs = process.argv.slice(5)
        const channelIds = groupArgs.filter((a) => !a.startsWith('-'))

        switch (groupSub) {
          case 'add': {
            if (channelIds.length === 0) {
              console.error(
                'Usage: channel-mux daemon group add <channelId> [channelId2 ...] [--no-mention]',
              )
              process.exit(1)
            }
            const noMention = groupArgs.includes('--no-mention')
            const allowFlag = groupArgs.find((a) => a.startsWith('--allow='))
            const allowFrom = allowFlag ? allowFlag.slice('--allow='.length).split(',') : []
            mkdirSync(STATE_DIR, { recursive: true })
            const access = readAccessFile()
            const added: string[] = []
            for (const id of channelIds) {
              if (!access.groups[id]) {
                access.groups[id] = { requireMention: !noMention, allowFrom }
                added.push(id)
              }
            }
            if (added.length > 0) {
              saveAccess(access)
              console.log(`Added ${added.length} channel(s): ${added.join(', ')}`)
            } else {
              console.log('All channels already configured')
            }
            break
          }

          case 'rm': {
            if (channelIds.length === 0) {
              console.error('Usage: channel-mux daemon group rm <channelId> [channelId2 ...]')
              process.exit(1)
            }
            const access = readAccessFile()
            const removed: string[] = []
            for (const id of channelIds) {
              if (access.groups[id]) {
                delete access.groups[id]
                removed.push(id)
              }
            }
            if (removed.length > 0) {
              saveAccess(access)
              console.log(`Removed ${removed.length} channel(s): ${removed.join(', ')}`)
            } else {
              console.log('None of the specified channels were configured')
            }
            break
          }

          case 'list': {
            const access = readAccessFile()
            const ids = Object.keys(access.groups)
            if (ids.length === 0) {
              console.log('No channels configured')
            } else {
              console.log(`Configured channels (${ids.length}):`)
              for (const id of ids) {
                const g = access.groups[id]
                const flags = []
                if (g.requireMention) flags.push('mention-required')
                if (g.allowFrom.length > 0) flags.push(`allow: ${g.allowFrom.join(',')}`)
                console.log(`  ${id}${flags.length > 0 ? ` (${flags.join(', ')})` : ''}`)
              }
            }
            break
          }

          default:
            console.log('Usage: channel-mux daemon group <add|rm|list>')
            console.log('')
            console.log('Commands:')
            console.log('  add <channelId> [...]   Add channels [--no-mention] [--allow=id1,id2]')
            console.log('  rm <channelId> [...]    Remove channels from daemon reception')
            console.log('  list                    List configured channels')
            process.exit(1)
        }
        break
      }

      default:
        console.log('Usage: channel-mux daemon <start|stop|status|group>')
        console.log('')
        console.log('Commands:')
        console.log('  start [--verbose]   Start the daemon')
        console.log('  stop                Stop the daemon')
        console.log('  status              Show daemon status')
        console.log('  group <sub>         Manage daemon channel reception')
        process.exit(1)
    }
    break
  }

  case 'session': {
    const mcpPaths = [
      { scope: 'local', path: join(process.cwd(), '.claude', '.mcp.json') },
      { scope: 'project', path: join(process.cwd(), '.mcp.json') },
      { scope: 'user', path: join(homedir(), '.claude', '.mcp.json') },
    ]

    // Show environment variables (highest priority)
    const envChannels = process.env.CHANNEL_MUX_CHANNELS
    const envDms = process.env.CHANNEL_MUX_HANDLE_DMS
    if (envChannels || envDms) {
      console.log('env:')
      if (envChannels) console.log(`  channels: ${envChannels}`)
      if (envDms) console.log(`  DMs: ${envDms}`)
    }

    // Show .mcp.json configs
    let found = !!(envChannels || envDms)
    for (const { scope, path } of mcpPaths) {
      try {
        const raw = JSON.parse(readFileSync(path, 'utf8'))
        const env = raw?.mcpServers?.['channel-mux']?.env
        if (!env) continue
        found = true
        const channels = env.CHANNEL_MUX_CHANNELS || '(not set)'
        const dms = env.CHANNEL_MUX_HANDLE_DMS || '(not set)'
        console.log(`${scope} (${path}):`)
        console.log(`  channels: ${channels}`)
        console.log(`  DMs: ${dms}`)
      } catch {
        // file doesn't exist or invalid JSON
      }
    }
    if (!found) {
      console.log('No channel-mux session config found')
      console.log('Checked env vars and:')
      for (const { scope, path } of mcpPaths) {
        console.log(`  ${scope}: ${path}`)
      }
    }
    break
  }

  default:
    console.log('Usage: channel-mux <daemon|session>')
    console.log('')
    console.log('Commands:')
    console.log('  daemon <sub>   Manage the daemon (start, stop, status, group)')
    console.log('  session        Show session routing config')
    process.exit(1)
}
