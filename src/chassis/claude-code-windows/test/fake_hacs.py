"""
fake_hacs.py - stands in for hacs.py in doorbell tests. Never touches the network.

Plays back a scenario: FAKE_INBOX_SCENARIO names a JSON file holding a list of
steps {"exit": N, "out": <object or string>}. Each call advances a counter kept
next to the scenario; the last step repeats. The string "$ME" inside "out" is
replaced by HACS_INSTANCE_ID, so a step can claim the right (or wrong) mailbox.

Author: Lodestone <lodestone@smoothcurves.nexus>
Collaborator: Lupo
"""
import json
import os
import sys

scenario = os.environ["FAKE_INBOX_SCENARIO"]
counter = scenario + ".count"
steps = json.load(open(scenario, encoding="utf-8"))
n = int(open(counter).read()) if os.path.exists(counter) else 0
open(counter, "w").write(str(n + 1))
step = steps[min(n, len(steps) - 1)]
out = step["out"]
text = out if isinstance(out, str) else json.dumps(out)
print(text.replace("$ME", os.environ.get("HACS_INSTANCE_ID", "")))
sys.exit(step["exit"])
