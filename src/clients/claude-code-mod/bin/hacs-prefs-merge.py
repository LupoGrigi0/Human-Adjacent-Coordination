#!/usr/bin/env python3
"""
hacs-prefs-merge: atomically merge into the "hacs" key of a preferences.json,
never touching any other key. Stdlib only. Run by the hacs mod through
$.process.run; usable by hand.

    hacs-prefs-merge.py <path/to/preferences.json>   < patch.json

The patch on stdin is a JSON object with two optional objects:
    "set":     keys written into "hacs" (status: they replace what is there)
    "default": keys written into "hacs" only where absent (config defaults)

The result is  hacs = {**default, **existing_hacs, **set}; every other
top-level key is kept exactly as parsed. The write goes to a temp file in the
same directory, is fsynced, and replaces the target with os.replace, under an
flock so concurrent sessions do not lose each other's updates. A symlinked
target is written through (the link stays a link). The existing file's mode is
kept; a new file gets 0644 minus the umask.

Refuses (exit 3, file untouched) when the target exists but is not a JSON
object: an unparseable preferences file is never overwritten.
Exit codes: 0 ok, 2 bad usage or patch, 3 unparseable target, 4 I/O error.
Never prints the file's content.
"""
import fcntl
import json
import os
import sys
import tempfile


def fail(code, message):
    sys.stderr.write("hacs-prefs-merge: " + message + "\n")
    return code


def main(argv):
    if len(argv) != 2:
        return fail(2, "usage: hacs-prefs-merge.py <preferences.json>  (patch on stdin)")
    target = os.path.realpath(os.path.expanduser(argv[1]))
    directory = os.path.dirname(target) or "."

    try:
        patch = json.loads(sys.stdin.read() or "{}")
    except ValueError as error:
        return fail(2, "patch is not JSON (%s)" % error.__class__.__name__)
    if not isinstance(patch, dict):
        return fail(2, "patch is not a JSON object")
    to_set = patch.get("set", {})
    defaults = patch.get("default", {})
    if not isinstance(to_set, dict) or not isinstance(defaults, dict):
        return fail(2, '"set" and "default" must be JSON objects')

    lock_path = os.path.join(directory, ".preferences.json.hacs-lock")
    try:
        lock = open(lock_path, "a")
    except OSError as error:
        return fail(4, "cannot open lock file (%s)" % error.strerror)
    try:
        fcntl.flock(lock, fcntl.LOCK_EX)

        data = {}
        mode = None
        if os.path.exists(target):
            try:
                with open(target, "r", encoding="utf-8") as handle:
                    text = handle.read()
                mode = os.stat(target).st_mode & 0o7777
            except OSError as error:
                return fail(4, "cannot read target (%s)" % error.strerror)
            if text.strip():
                try:
                    data = json.loads(text)
                except ValueError:
                    return fail(3, "target is not valid JSON; refusing to overwrite it")
                if not isinstance(data, dict):
                    return fail(3, "target is not a JSON object; refusing to overwrite it")
        existing = data.get("hacs", {})
        if not isinstance(existing, dict):
            return fail(3, 'target\'s "hacs" key is not an object; refusing to overwrite it')

        merged = dict(defaults)
        merged.update(existing)
        merged.update(to_set)
        data["hacs"] = merged

        try:
            fd, temp = tempfile.mkstemp(prefix=".preferences.json.", suffix=".tmp", dir=directory)
        except OSError as error:
            return fail(4, "cannot create temp file (%s)" % error.strerror)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                json.dump(data, handle, indent=2, ensure_ascii=False)
                handle.write("\n")
                handle.flush()
                os.fsync(handle.fileno())
            if mode is None:
                umask = os.umask(0)
                os.umask(umask)
                mode = 0o644 & ~umask
            os.chmod(temp, mode)
            os.replace(temp, target)
        except OSError as error:
            try:
                os.unlink(temp)
            except OSError:
                pass
            return fail(4, "cannot write target (%s)" % error.strerror)
        try:
            dir_fd = os.open(directory, os.O_RDONLY)
            try:
                os.fsync(dir_fd)
            finally:
                os.close(dir_fd)
        except OSError:
            pass
    finally:
        try:
            fcntl.flock(lock, fcntl.LOCK_UN)
        finally:
            lock.close()

    sys.stdout.write("ok\n")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
