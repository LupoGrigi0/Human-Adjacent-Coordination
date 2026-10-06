#!/usr/bin/env python3
"""
mock_telegram.py — fake Telegram Bot API for Event Hub tests.

Stands in for https://api.telegram.org so the telegram driver's full round-trip
(getUpdates polling in, sendMessage out) can be tested hermetically. Point the
driver at it via TELEGRAM_API_BASE=http://127.0.0.1:22098 (EVENT-HUB-CONTRACT.md §8).

Dual use:
  1. Automated suite: the runner seeds the queue file with Telegram update
     objects, waits for the driver to poll them in, then asserts on the sent
     JSONL file that outbound replies reached "Telegram" — including the
     never-falsely-report-sent rule (H-02), exercised via chat_id 999999.
  2. Manual live checks: run it, drop updates into the queue file by hand, and
     watch a locally-running driver pick them up:
         python3 mock_telegram.py --port 22098 --queue /tmp/q.json --sent /tmp/sent.jsonl

Endpoints (POST or GET, any <TOKEN>):
  /bot<TOKEN>/getUpdates  -> {"ok": true, "result": [updates with update_id >= offset]}.
                             Acknowledge-by-offset like the real Bot API: updates with
                             update_id < offset are deleted from the queue file; the
                             rest REMAIN queued (so a driver that crashes before
                             advancing its offset can replay them). Honors long-poll
                             `timeout` by re-checking the queue for up to 2s max
                             (tests stay fast) when nothing is pending.
  /bot<TOKEN>/sendMessage -> appends {"recv_ts": ..., "token": "<TOKEN>", "body": {...}}
                             to the sent file. chat_id 999999 -> 400
                             {"ok": false, "error_code": 400, "description": "Bad
                             Request: chat not found"}; anything else -> 200
                             {"ok": true, "result": {"message_id": 1}}.
  GET /health             -> {"ok": true}

Queue file format: a JSON array of Telegram update objects (each with update_id).
Stdlib only. Binds 127.0.0.1 only. Sent file is append-only, flushed per line.
Fails fast if the port is busy. SIGTERM exits cleanly.
"""
import argparse
import json
import re
import signal
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit, parse_qs

ROUTE = re.compile(r"^/bot([^/]+)/(getUpdates|sendMessage)$")
LOCK = threading.Lock()   # serializes queue reads/truncates and sent-file appends
ARGS = None               # parsed CLI args, set in main()
SENT = None               # append-mode handle for the sent JSONL file


def read_queue():
    """Load the queue file; missing/empty/corrupt reads as no updates."""
    try:
        with open(ARGS.queue, encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, list) else []
    except (OSError, json.JSONDecodeError):
        return []


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):  # keep test output quiet
        pass

    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _params(self):
        """Merge query-string and body params (Telegram accepts GET, form, or JSON)."""
        split = urlsplit(self.path)
        params = {k: v[0] for k, v in parse_qs(split.query).items()}
        n = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(n) if n else b""
        if raw:
            try:
                body = json.loads(raw)
                if isinstance(body, dict):
                    params.update(body)
            except json.JSONDecodeError:  # form-encoded fallback
                params.update({k: v[0] for k, v in parse_qs(raw.decode("utf-8", "replace")).items()})
        return split.path, params

    def _handle(self):
        path, params = self._params()
        if path == "/health":
            return self._json(200, {"ok": True})
        m = ROUTE.match(path)
        if not m:
            return self._json(404, {"ok": False, "error_code": 404, "description": "Not Found"})
        token, method = m.group(1), m.group(2)

        if method == "getUpdates":
            offset = int(params.get("offset") or 0)
            # Long-poll: re-check the queue for up to min(timeout, 2)s so a driver
            # using Telegram-style long polling still sees fresh seeds quickly.
            deadline = time.time() + min(float(params.get("timeout") or 0), 2.0)
            while True:
                with LOCK:
                    queued = read_queue()
                    # Acknowledge-by-offset (real Bot API recovery model):
                    # update_id < offset is confirmed -> drop it from the queue;
                    # update_id >= offset is returned AND stays queued so a
                    # driver that fails before advancing its offset can replay.
                    keep = [u for u in queued if int(u.get("update_id", 0)) >= offset]
                    if len(keep) != len(queued):
                        with open(ARGS.queue, "w", encoding="utf-8") as f:
                            json.dump(keep, f)
                    updates = keep
                if updates or time.time() >= deadline:
                    return self._json(200, {"ok": True, "result": updates})
                time.sleep(0.1)

        # sendMessage — record everything the driver sent, then verdict by chat_id.
        with LOCK:
            SENT.write(json.dumps({"recv_ts": time.time(), "token": token, "body": params}) + "\n")
            SENT.flush()
        if str(params.get("chat_id")) == "999999":  # magic id: simulate expired/unknown chat
            return self._json(400, {"ok": False, "error_code": 400,
                                    "description": "Bad Request: chat not found"})
        return self._json(200, {"ok": True, "result": {"message_id": 1}})

    do_GET = _handle
    do_POST = _handle


def main():
    global ARGS, SENT
    ap = argparse.ArgumentParser(description="Mock Telegram Bot API for Event Hub tests")
    ap.add_argument("--port", type=int, required=True)
    ap.add_argument("--queue", required=True, help="JSON array file of pending Telegram updates")
    ap.add_argument("--sent", required=True, help="JSONL file to append sendMessage calls to")
    ARGS = ap.parse_args()

    SENT = open(ARGS.sent, "a", encoding="utf-8")
    try:
        srv = ThreadingHTTPServer(("127.0.0.1", ARGS.port), Handler)
    except OSError as e:
        print(f"mock_telegram: cannot bind 127.0.0.1:{ARGS.port} ({e}) — port busy?", file=sys.stderr)
        sys.exit(1)

    def _stop(signum, frame):  # SIGTERM -> clean unwind of serve_forever()
        raise SystemExit(0)
    signal.signal(signal.SIGTERM, _stop)

    print(f"mock_telegram listening on 127.0.0.1:{ARGS.port} "
          f"(queue={ARGS.queue}, sent={ARGS.sent})", flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        srv.server_close()
        SENT.close()


if __name__ == "__main__":
    main()
