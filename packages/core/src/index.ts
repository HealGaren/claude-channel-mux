export {
  ACCESS_FILE,
  APPROVED_DIR,
  ENV_FILE,
  INBOX_DIR,
  loadEnvFile,
  PID_FILE,
  SOCK_PATH,
  STATE_DIR,
} from './config.js'
export { evaluateGate, type GateInput } from './gate.js'
export { DEFAULT_REQUEST_TIMEOUT_MS, IpcClient } from './ipc-client.js'

export { IpcServer } from './ipc-server.js'
export type {
  Access,
  DaemonMessage,
  GateResult,
  GroupPolicy,
  InboundMsg,
  PendingEntry,
  PingMsg,
  PlatformAdapter,
  PluginMessage,
  PongMsg,
  RawPlatformMessage,
  RegisterAckMsg,
  RegisterMsg,
  Session,
  ShutdownMsg,
  ToolCallHandler,
  ToolCallMsg,
  ToolResultMsg,
  UnregisterMsg,
} from './types.js'
export { DEFAULT_ACCESS } from './types.js'
