"""
Tests for bin/hacs-prefs-merge.py (criterion 7: atomic, merges only the
"hacs" key, never clobbers other keys, refuses an unparseable file).

    python3 -m unittest discover -s tests/helper -p 'test_*.py'

(from the plugin directory). Runs the helper as the mod does: a child
process, the patch on stdin. Each test works in its own temp directory.
"""
import json
import os
import stat
import subprocess
import sys
import tempfile
import unittest

HELPER = os.path.join(os.path.dirname(__file__), "..", "..", "bin", "hacs-prefs-merge.py")


def run(path, patch):
    return subprocess.run(
        [sys.executable, HELPER, path],
        input=json.dumps(patch) if not isinstance(patch, str) else patch,
        capture_output=True,
        text=True,
        timeout=30,
    )


class PrefsMergeTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.path = os.path.join(self.dir.name, "preferences.json")

    def tearDown(self):
        self.dir.cleanup()

    def write(self, data, mode=0o600):
        with open(self.path, "w") as handle:
            handle.write(data if isinstance(data, str) else json.dumps(data))
        os.chmod(self.path, mode)

    def load(self):
        with open(self.path) as handle:
            return json.load(handle)

    def test_creates_a_missing_file_with_only_the_hacs_key(self):
        done = run(self.path, {"set": {"lastPollOk": True, "unread": 2}, "default": {"doorbell": False}})
        self.assertEqual(done.returncode, 0, done.stderr)
        self.assertEqual(self.load(), {"hacs": {"doorbell": False, "lastPollOk": True, "unread": 2}})

    def test_keeps_every_other_key_exactly(self):
        others = {"theme": "dark", "nested": {"a": [1, 2, {"b": None}]}, "unicode": "Chile ñ"}
        self.write(dict(others, hacs={"instanceId": "Forge-ba0e"}))
        done = run(self.path, {"set": {"unread": None, "lastError": "hub unreachable"}})
        self.assertEqual(done.returncode, 0, done.stderr)
        data = self.load()
        for key, value in others.items():
            self.assertEqual(data[key], value)
        self.assertEqual(data["hacs"], {"instanceId": "Forge-ba0e", "unread": None, "lastError": "hub unreachable"})

    def test_defaults_never_override_what_the_human_set(self):
        self.write({"hacs": {"instanceId": "Forge-ba0e", "doorbell": True, "pollSeconds": 30}})
        done = run(self.path, {"default": {"doorbell": False, "pollSeconds": 60, "hubUrl": "https://h/mcp"}})
        self.assertEqual(done.returncode, 0, done.stderr)
        self.assertEqual(
            self.load()["hacs"],
            {"instanceId": "Forge-ba0e", "doorbell": True, "pollSeconds": 30, "hubUrl": "https://h/mcp"},
        )

    def test_status_replaces_old_status(self):
        self.write({"hacs": {"unread": 3, "lastPollOk": True}})
        run(self.path, {"set": {"unread": None, "lastPollOk": False}})
        self.assertEqual(self.load()["hacs"], {"unread": None, "lastPollOk": False})

    def test_refuses_an_unparseable_file_and_leaves_it_untouched(self):
        self.write("{ not json, but someone's notes")
        done = run(self.path, {"set": {"unread": 1}})
        self.assertEqual(done.returncode, 3)
        with open(self.path) as handle:
            self.assertEqual(handle.read(), "{ not json, but someone's notes")

    def test_refuses_a_non_object_file(self):
        self.write([1, 2, 3])
        self.assertEqual(run(self.path, {"set": {"unread": 1}}).returncode, 3)
        self.assertEqual(self.load(), [1, 2, 3])

    def test_refuses_a_non_object_hacs_key(self):
        self.write({"hacs": "Forge-ba0e"})
        self.assertEqual(run(self.path, {"set": {"unread": 1}}).returncode, 3)
        self.assertEqual(self.load(), {"hacs": "Forge-ba0e"})

    def test_refuses_a_bad_patch(self):
        self.write({"keep": 1})
        self.assertEqual(run(self.path, "not json").returncode, 2)
        self.assertEqual(run(self.path, {"set": [1]}).returncode, 2)
        self.assertEqual(self.load(), {"keep": 1})

    def test_keeps_the_file_mode(self):
        self.write({"keep": 1}, mode=0o640)
        run(self.path, {"set": {"unread": 0}})
        self.assertEqual(stat.S_IMODE(os.stat(self.path).st_mode), 0o640)

    def test_writes_through_a_symlink(self):
        real = os.path.join(self.dir.name, "real.json")
        with open(real, "w") as handle:
            json.dump({"keep": 1}, handle)
        os.symlink(real, self.path)
        self.assertEqual(run(self.path, {"set": {"unread": 1}}).returncode, 0)
        self.assertTrue(os.path.islink(self.path))
        with open(real) as handle:
            self.assertEqual(json.load(handle), {"keep": 1, "hacs": {"unread": 1}})

    def test_leaves_no_temp_files(self):
        self.write({"keep": 1})
        run(self.path, {"set": {"unread": 1}})
        leftovers = [n for n in os.listdir(self.dir.name) if n.endswith(".tmp")]
        self.assertEqual(leftovers, [])

    def test_never_prints_the_file_content(self):
        self.write({"other_tool_token": "CANARY-do-not-print", "hacs": {}})
        done = run(self.path, {"set": {"unread": 1}})
        self.assertNotIn("CANARY", done.stdout + done.stderr)
        bad = run(self.path, "nope")
        self.assertNotIn("CANARY", bad.stdout + bad.stderr)

    def test_concurrent_writers_lose_nothing(self):
        self.write({"keep": 1})
        procs = [
            subprocess.Popen(
                [sys.executable, HELPER, self.path],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
            )
            for _ in range(8)
        ]
        for index, proc in enumerate(procs):
            proc.communicate(json.dumps({"set": {"w%d" % index: index}}), timeout=30)
        data = self.load()
        self.assertEqual(data["keep"], 1)
        self.assertEqual(sorted(data["hacs"]), sorted("w%d" % i for i in range(8)))


if __name__ == "__main__":
    unittest.main()
