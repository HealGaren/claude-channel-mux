#!/usr/bin/env node
import { execSync, spawn } from 'node:child_process'
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { PID_FILE, SOCK_PATH, STATE_DIR } from '@claude-channel-mux/core'

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
  case 'start': {
    const verbose = process.argv.includes('--verbose') || process.argv.includes('-v')

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
    } else {
      console.log('channel-mux daemon: stopped')
      if (pid) console.log(`  stale pid file: ${PID_FILE}`)
      if (sockExists) console.log(`  stale socket: ${SOCK_PATH}`)
    }
    break
  }

  default:
    console.log('Usage: channel-mux <start [--verbose|-v]|stop|status>')
    process.exit(1)
}
