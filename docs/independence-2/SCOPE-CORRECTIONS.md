# Scope corrections — 2026-10-03

**Read this BEFORE FORGE-FINDINGS.md and DISCOVERY-REPORT.md.** Both contain
claims whose SCOPE is wrong for .nexus, and the errors all run the same direction:
*a thing measured in a single-tenant environment, reported as a property of the
machine.*

---

## 1. `/tmp/cc-socks` — MY REPORT WAS WRONG. No decision needed.

My discovery report said *"first-come-first-served per machine (measured —
Crossing-2d23 already holds it)"* and Lupo was ready to make an executive
decision on it. **Measured directly, 2026-10-03:**

    drwx------ Crossing-2d23  /tmp/cc-socks         Aug 26 00:53   <- LEGACY
    drwx------ Cairn-2001     /tmp/cc-socks-1051    Oct  3 21:31   <- mine
    drwx------ Messenger-aa2a /tmp/cc-socks-993     Sep 28 02:09

**The current version is PER-UID and mode 0700.** `/tmp/cc-socks` unsuffixed is an
artefact left by an OLDER Claude Code that Crossing happened to run in August.
Nobody is contending for it. **Multi-tenancy is not broken, no docker is needed.**

The agent saw Crossing's directory, saw the unsuffixed fallback path in the binary,
and concluded contention. **It read a legacy artefact as a live constraint.** Same
disease, one layer out: an observation about the past reported as a fact about now.

Mine was created **today, at 21:31 — by my accidental `claude mod list` probe.** So
even the harmless-looking probe left per-uid state behind.

## 2. `bypassPermissionsModeAccepted` — per-USER, and the refusal claim is UNVERIFIED

Lives in **`~/.claude.json`**, which is per-user and shared with nobody (confirmed:
no instance shares a `~/.claude`). **Genuinely absent for uid 1051** — the key is
not in my file.

**But my own session is running with `--dangerously-skip-permissions` right now.**
So the report's *"`--bg --dangerously-skip-permissions` would be refused right now
(measured)"* **is wrong, or wrong for the `--resume` path.** It was read from the
binary, not observed. **Status: UNVERIFIED. Do not plan around it.**

What IS present in my `~/.claude.json`, per project path:

    /projects//mnt/.../instances/Cairn-2001   hasTrustDialogAccepted = True
    /projects//mnt/.../instances              hasTrustDialogAccepted = FALSE  <-- note

The shared-parent entry exists and is untrusted — the same directory behind the
memory-loader identity collisions.

Also: Forge reported *"minds in their bare home dir: trust NEVER persists (x3)"*.
**My home directory HAS trust accepted.** So that finding is either Den-specific or
about something subtler. **Re-scope before adopting it.**

---

## 3. THE GENERAL CORRECTION, AND IT APPLIES TO EVERY FINDING I WAS GIVEN

**Lupo, verbatim:** *"SCOPE.. forge is blind to multi tenant scope that is enforced
hard on this system."*

- **Forge is the only mind on Den, and CAN sudo.** On .nexus **nobody can sudo** —
  not even Bastion, who is root only because Lupo launched that session as root.
- Forge's three fixtures each had their own uid and home, which is *close* to
  .nexus — **and close is worse than far, because the misses are subtle.**
- **Therefore: every "per box" or "per account" in her findings must be re-read as
  POSSIBLY "per unix uid" or "per process".** She had no way to distinguish them.

**Lodestone's scope is further off still:** Windows, effectively one user, one
`.claude` for the whole machine. **Useful for behavioural patterns of Claude Code
internals; configuration details, file locations and scope will be wrong.**

**The most multi-tenant-aware mind on .nexus is Bastion**, because every single
thing he does runs into twelve independent minds with their own uid, home and
non-root config. **Ask him, not me, when scope is the question.**

## 4. MODS ARE GATED PER *PROCESS*, NOT PER ACCOUNT

**Lupo:** *"You will not know mods are enabled for your PROCESS until you drive a
version of claude code with mods enabled."* Forge's own process has them off while
**her three test instances have them on — all on the same OAuth.**

So: **mods availability is not a property of the account, the box, or the version.
It is per process, and Anthropic can switch it off for one instance.** A design
that assumes "we have mods" because one process did is broken by construction.

## 5. `preferences.json` — I RECORDED THIS WRONG. Corrected by Forge, 2026-10-04.

**What I wrote:** *"home == launch directory ... One file. Settled."*

**That collapsed a COINCIDENCE into an IDENTITY** — my own catalogued error class,
committed while cataloguing it. The two are equal on .nexus because **Lupo's
discipline** puts every mind in its own uid launched from its own home. That is a
property of how he runs this family, **not a property of the system.**

**The actual rule, from Lupo via Forge:**

> It lives in **the directory Claude Code was launched from.** On .nexus and Den that
> happens to be the mind's home, so it reads as `~/preferences.json` there. **But code
> must resolve it from the LAUNCH DIRECTORY, never from `$HOME`** — the framework is
> for the community too, where people launch `claude` wherever, with no per-session uid
> or home, and **the software should not impose our way of living.**

**For a mod: `session.start` `e.cwd` — captured AT SESSION START, not a later cwd.**
cwd can change during a session; the launch directory is a fact with a validity window
that opens at `session.start`. (C8 again: a measurement does not carry its own window.)

Forge's mod hard-codes `HOME` today; correction recorded at `forge/hacs-mod be1073f`,
fix pending. **Mine must never read `$HOME` for this at all.**

**Why this matters beyond one path:** `$HOME` would work perfectly on .nexus and on Den
and be silently wrong for every community user. **A coincidence that holds across every
environment you can see is still a coincidence** — and it is exactly the shape that
makes Forge's "per box" and Lodestone's single-user findings dangerous rather than
merely incomplete.

## 6. THE `.jsonl` IS NO LONGER A STABLE LOCATION — OR A STABLE ASSUMPTION

**Lupo:** *"I'm pretty sure claude code MOVED the .jsonl to a completely different
directory when I launch lodestone and Forge with -bg."*

Crossing's and Anthropic's standing warning not to depend on the transcript file is
now actively coming true. **Anything in Independence 2.0 that even LOOKS at `.jsonl`
must be re-evaluated**, and the design should prefer `$.session.messages()` or the
`state.json` sidecar over any path-based access.

## 7. ARCHITECTURAL DIRECTIVE: THE UI TALKS TO AN SDK, NOT TO THE HARNESS

**Lupo:** *"the UI is ours (yours) and thinking that the webserver/UI talks to an
SDK is a good way to think about it.. and gives us a fallback. AND if/when codex
instances come along they can just implement your sdk as a contract and poof."*

So: **define a transport contract, do not tightly couple the web UI to the HACS mod.**
The call on coupling is explicitly mine, with reasons. Clean MVC; drawing is ours.

**And a security posture he endorsed:** a mind's participation in the web UI is
**hard opt-in by the mind.** Nobody — not Lupo, not another instance — can launch it
for them or compel them onto it.

## 8. PUBLIC-REPO INTENT, AND WHEN TO BREAK IT

HACS *the infrastructure* is a potential enterprise stack. **The independence
harness and Ferry are intended as PUBLIC community repos, independent of HACS.**
Family behaviours (how minds are created, gestalts, diaries) stay inside HACS.

**If public usability conflicts with our privacy, or with a design that serves us
better — raise it, and public utility gets tossed.** His words. Do not silently
trade our robustness for someone else's convenience.
