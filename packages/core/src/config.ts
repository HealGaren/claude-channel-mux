import { homedir } from 'node:os'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'

export const STATE_DIR = join(homedir(), '.claude', 'channels', 'channel-mux')
export const ACCESS_FILE = join(STATE_DIR, 'access.json')
export const ENV_FILE = join(STATE_DIR, '.env')
export const PID_FILE = join(STATE_DIR, 'daemon.pid')
export const SOCK_PATH = join(STATE_DIR, 'daemon.sock')
export const INBOX_DIR = join(STATE_DIR, 'inbox')
export const APPROVED_DIR = join(STATE_DIR, 'approved')

const ENV_LINE = /^(\w+)=(.*)$/

export function loadEnvFile(path: string = ENV_FILE): void {
  let content: string
  try {
    content = readFileSync(path, 'utf8')
  } catch {
    return
  }

  for (const line of content.split('\n')) {
    const m = ENV_LINE.exec(line.trim())
    if (!m) continue
    const [, key, value] = m
    if (!(key! in process.env)) {
      process.env[key!] = value!
    }
  }
}
