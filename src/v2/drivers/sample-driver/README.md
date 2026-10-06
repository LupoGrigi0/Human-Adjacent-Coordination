# Sample HACS Input Driver

The smallest possible event-hub driver, heavily commented. Copy it, rename the
channel, point it at your source, and you have a new input channel for any HACS
instance — **without touching the hub or the chassis**.

Authoritative interface contract: [`docs/EVENT-HUB-CONTRACT.md`](../../../../docs/EVENT-HUB-CONTRACT.md)

## The driver interface, in plain words

A driver is **any process** that can make an HTTP POST. There is no SDK, no
registration ceremony, no base class. When your source produces something new,
POST a small JSON payload to the hub:

```
POST <HUB_URL>/hub/publish
X-Hub-Secret: <contents of the secret file>
Content-Type: application/json

{
  "target":  "<instanceId>",     // who this event is for
  "channel": "<your-channel>",   // e.g. "sample", "stock", "disk"
  "from":    "<sender label>",   // e.g. "fs-watcher", "NASDAQ", "paula@x.com"
  "ref":     "<opaque string>"   // how the instance fetches the body later
}
```

The hub answers `{ok: true, counter: N}`. Rules that matter:

- **Never send the body.** Only the `ref`. The target instance decides when
  (and whether) to fetch content. That is the whole point of the hub — a 700MB
  attachment must never auto-inject into someone's context.
- **Publish every event; don't batch.** The hub coalesces per `{channel, from}`
  into one active notification with a count. You add zero latency, it adds
  zero spam.
- **Bidirectional channels** additionally set `bidirectional: true` and a
  `thread_id`, register a callback URL via `POST /hub/register-driver`, and
  accept outbound replies on it — see contract §2 and §7. This sample is
  one-way and needs none of that.
- The hub's HTTP surface is **loopback-only** and requires the shared secret
  (a 0600 file the hub creates at startup, default
  `/mnt/coordinaton_mcp_data/.hub-secret`). Your driver must run on the same
  host and be able to read that file.

## Running it

```bash
mkdir -p /tmp/sample-watch
DRIVER_WATCH_DIR=/tmp/sample-watch \
DRIVER_TARGET_INSTANCE=YourInstance-xxxx \
HACS_HUB_URL=http://127.0.0.1:3444 \
node driver.js

# in another terminal:
echo "hello" > /tmp/sample-watch/demo.txt
```

The target instance receives a thin notification —
`[notification] 1 new on sample from fs-watcher — drain_events when ready` —
and can read the counter/refs with the `drain_events` tool whenever it likes.

| Env var | Default | Meaning |
|---|---|---|
| `DRIVER_WATCH_DIR` (or argv[2]) | (required) | directory to observe |
| `DRIVER_TARGET_INSTANCE` | (required, no default) | instance the events are for |
| `HUB_URL` | `http://127.0.0.1:3444` | hub HTTP surface |
| `HUB_SECRET_FILE` | `/mnt/coordinaton_mcp_data/.hub-secret` | shared secret file |

Run it under systemd, cron, tmux, whatever — the hub does not care. If your
driver dies, nothing breaks: events simply resume when it comes back (design
your driver so its startup rescans/replays what it missed, like the bundled
email and telegram drivers do).
