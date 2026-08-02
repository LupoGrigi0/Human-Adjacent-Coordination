#!/usr/bin/env python3
"""
stub_chassis.py — fake chassis intake for Event Hub tests.

Stands in for the claude-code-channel chassis (channel.mjs /broker-event) so the
hub's notification dispatch can be observed without a live instance.

Dual use:
  1. Automated suite: the runner starts this on a scratch port, points the target
     instance's .hacs-identity channelPort at it, then asserts on the JSONL record
     file — each line captures exactly what the hub delivered, so tests can verify
     the thin-notification shape (EVENT-HUB-CONTRACT.md §4: {channel, from, count,
     ts, thread_id?} — never a body) and flip modes to exercise the pending/retry path.
  2. Manual live checks: run it yourself and watch notifications arrive:
         python3 stub_chassis.py --port 21099 --record /tmp/received.jsonl
         tail -f /tmp/received.jsonl

Endpoints:
  GET  /health        -> 200 {"ok": true}
  POST /broker-event  -> appends one JSON line to the record file:
                           {"recv_ts": <float epoch>, "headers": {...}, "body": <parsed json>}
                         then responds per the current mode.
  POST /_control      -> {"mode": "ok" | "error500" | "timeout"} switches response
                         mode at runtime. Default "ok".
                           ok       -> 200 {"ok": true}
                           error500 -> 500 (simulates a broken chassis)
                           timeout  -> sleep 15s then 200 (hub should give up first)

Stdlib only. Binds 127.0.0.1 only. Record file is append-only, flushed per line.
Fails fast with a clear message if the port is busy. SIGTERM exits cleanly.
"""
import argparse
import json
import signal
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

STATE = {"mode": "ok"}      # mutated via POST /_control; read on every /broker-event
LOCK = threading.Lock()     # serializes record-file appends across handler threads
RECORD = None               # append-mode file handle, opened in main()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):  # silence per-request stderr noise in test runs
        pass

    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_body(self):
        n = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(n) if n else b""
        try:
            return json.loads(raw) if raw else None
        except json.JSONDecodeError:
            # Record malformed payloads verbatim rather than dropping them —
            # tests need to see exactly what the hub sent.
            return {"_unparsed": raw.decode("utf-8", "replace")}

    def do_GET(self):
        if self.path == "/health":
            return self._json(200, {"ok": True})
        self._json(404, {"ok": False, "error": "not found"})

    def do_POST(self):
        if self.path == "/_control":
            mode = (self._read_body() or {}).get("mode")
            if mode not in ("ok", "error500", "timeout"):
                return self._json(400, {"ok": False, "error": "mode must be ok|error500|timeout"})
            STATE["mode"] = mode
            return self._json(200, {"ok": True, "mode": mode})

        if self.path == "/broker-event":
            line = json.dumps({
                "recv_ts": time.time(),
                "headers": dict(self.headers.items()),
                "body": self._read_body(),
            })
            with LOCK:  # append-only, one line per delivery, flushed immediately
                RECORD.write(line + "\n")
                RECORD.flush()
            mode = STATE["mode"]
            if mode == "error500":
                return self._json(500, {"ok": False, "error": "stub in error500 mode"})
            if mode == "timeout":
                time.sleep(15)  # longer than any sane hub delivery timeout
            return self._json(200, {"ok": True})

        self._json(404, {"ok": False, "error": "not found"})


def main():
    global RECORD
    ap = argparse.ArgumentParser(description="Stub chassis intake for Event Hub tests")
    ap.add_argument("--port", type=int, required=True)
    ap.add_argument("--record", required=True, help="JSONL file to append received events to")
    args = ap.parse_args()

    RECORD = open(args.record, "a", encoding="utf-8")
    try:
        srv = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    except OSError as e:
        print(f"stub_chassis: cannot bind 127.0.0.1:{args.port} ({e}) — port busy?", file=sys.stderr)
        sys.exit(1)

    # Signal handlers run in the main thread; raising SystemExit unwinds
    # serve_forever() cleanly (handler threads are daemons and die with us).
    def _stop(signum, frame):
        raise SystemExit(0)
    signal.signal(signal.SIGTERM, _stop)

    print(f"stub_chassis listening on 127.0.0.1:{args.port} "
          f"(mode={STATE['mode']}, record={args.record})", flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        srv.server_close()
        RECORD.close()


if __name__ == "__main__":
    main()
