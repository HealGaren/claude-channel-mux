# Monitor API (Experimental)

> **Status**: Experimental. API spec is subject to change.

Optional HTTP server for observing daemon state. Disabled by default.

## Enable

Set `MONITOR_PORT` in `~/.claude/channels/channel-mux/.env`:

```
MONITOR_PORT=9100
```

Then restart the daemon. The server binds to `127.0.0.1` only.

## Endpoints

### `GET /status`

Daemon summary.

```json
{
  "uptime": 123,
  "sessionCount": 2,
  "botUsername": "my-bot",
  "requestBufferSize": 15
}
```

### `GET /sessions`

Connected Claude Code sessions.

```json
[
  {
    "sessionId": "abc-123",
    "channels": ["1234567890"],
    "handleDMs": false,
    "connectedAt": 1711000000000
  }
]
```

### `GET /requests`

Recent request log (last 200 entries, ring buffer).

```json
[
  {
    "timestamp": "2026-03-21T12:00:00.000Z",
    "direction": "inbound",
    "type": "message",
    "channelId": "1234567890",
    "summary": "alice: hello"
  },
  {
    "timestamp": "2026-03-21T12:00:01.000Z",
    "direction": "outbound",
    "type": "reply",
    "channelId": "1234567890",
    "summary": "reply({...}) -> ok"
  }
]
```

### `GET /events`

SSE (Server-Sent Events) stream. Events: `inbound`, `tool_call`, `session_connect`, `session_disconnect`.

```
curl -N http://127.0.0.1:9100/events
```

```
data: {"event":"inbound","data":{...},"timestamp":"2026-03-21T12:00:00.000Z"}

data: {"event":"tool_call","data":{...},"timestamp":"2026-03-21T12:00:01.000Z"}
```
