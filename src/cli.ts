import { readFileSync, existsSync, unlinkSync, openSync, closeSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn, execSync } from 'node:child_process'
import { PID_FILE, SOCK_PATH, STATE_DIR } from './core/config.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

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
    return isNaN(pid) ? null : pid
  } catch {
    return null
  }
}

const command = process.argv[2]

switch (command) {
  case 'start': {
    const pid = readPid()
    if (pid && isProcessAlive(pid)) {
      console.log(`channel-mux daemon already running (pid ${pid})`)
      process.exit(0)
    }

    // Clean up stale files
    if (pid && !isProcessAlive(pid)) {
      try { unlinkSync(PID_FILE) } catch {}
      try { unlinkSync(SOCK_PATH) } catch {}
    }

    const logPath = join(STATE_DIR, 'daemon.log')

    // Find daemon entry point: built (daemon.mjs) or source (daemon.ts)
    const builtDaemon = join(__dirname, 'daemon.mjs')
    const srcDaemon = join(__dirname, 'daemon.ts')
    const useBuilt = existsSync(builtDaemon)
    const daemonPath = useBuilt ? builtDaemon : srcDaemon

    let runner: string
    let runnerArgs: string[]
    if (useBuilt) {
      runner = process.execPath  // node
      runnerArgs = [daemonPath]
    } else {
      try {
        runner = execSync('which tsx', { encoding: 'utf8' }).trim()
      } catch {
        console.error('channel-mux: tsx not found. Install with: pnpm add -g tsx')
        process.exit(1)
      }
      runnerArgs = [daemonPath]
    }

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
      env: { ...process.env },
    })
    child.unref()
    closeSync(logFd)

    // Wait briefly for PID file
    await new Promise((r) => setTimeout(r, 2000))

    const newPid = readPid()
    if (newPid && isProcessAlive(newPid)) {
      console.log(`channel-mux daemon started (pid ${newPid})`)
      console.log(`  log: ${logPath}`)
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
      try { unlinkSync(PID_FILE) } catch {}
      try { unlinkSync(SOCK_PATH) } catch {}
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
      try { process.kill(pid, 'SIGKILL') } catch {}
    }

    try { unlinkSync(PID_FILE) } catch {}
    try { unlinkSync(SOCK_PATH) } catch {}
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
    console.log('Usage: channel-mux <start|stop|status>')
    process.exit(1)
}
