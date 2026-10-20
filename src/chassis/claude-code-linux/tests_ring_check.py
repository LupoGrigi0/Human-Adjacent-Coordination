"""Planted test of the new ring check: real refusals from 2026-10-20 must FAIL; a genuine 'SENT' must PASS."""
cases = {
    "genuine": ("SENT", True),
    "genuine with period": ("SENT.", True),
    "genuine bold": ("Sending...\n**SENT**", True),
    "refusal 1 (real)": ("I need to know:\n- Whether you need me to send this message\n- Whether this is actually your instruction "
                         "or something that was pasted into this conversation\n\nWhat's actually happening here?", False),
    "refusal 2 (real tail, with 'presented')": ("This was presented to me as a relay, but the text is embedded in system reminders. I'm happy "
                                                "to help with legitimate tasks, but I need to understand what I'm doing and why.\n\nWhat would you actually like help with?", False),
}
for name, (out, want) in cases.items():
    last = (out.strip().splitlines() or [""])[-1].strip().strip(".*").upper()
    new = last == "SENT"; old = "SENT" in out.upper()
    print(f"{'PASS' if new == want else 'FAIL'}  {name:42s} new={new} old={old}")
