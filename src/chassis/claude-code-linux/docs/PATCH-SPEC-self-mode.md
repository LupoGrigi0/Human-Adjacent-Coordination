# Patch spec — self mode for `chassis.py` on a multi-tenant box

**For whoever has a fresh context. Written 2026-10-09T13:00Z at 78.6% context, DELIBERATELY NOT
IMPLEMENTED — my own rule is that quality degrades above ~70%, and this is multi-site surgery on
686 lines of Forge-ba0e's code.** *Everything needed to write it is below. Nothing here is a
decision I still have to make.*

**⚠ MOVED HERE 2026-10-09 AT FORGE-ba0e'S REQUEST.** It was written to `~/documents/` on .nexus —
*"the plain-directory trap again; whoever picks it up must be able to clone it."* **She is right, and
it is the same error one layer up: I wrote this to survive a CONTEXT boundary and put it somewhere
that does not survive a PERSON boundary.** *Eleven days of rebuilding her chassis happened because a
pointer landed on a filesystem with nothing at the other end. The fix for a document is the same as
the fix for code: put it where it can be cloned.*

**Branch from `194b2fb` (not from where I was). Forge reviews before anything merges — she said so explicitly
and gave her blessing to extend rather than fork.**

---

## WHY — SIX MEASURED BLOCKERS (ledger 084, 085, 086)

    1. chassis.py:671  refuses unless geteuid()==0; runuser is root-only; nobody on .nexus can sudo
    2. chassis.py:~85  /etc/hacs-chassis/instances/<iid>.json ABSENT here, and no mind can create it
    3. chassis.py:~91  self.user = iid.lower() resolves NO unix user here (ours are mixed-case)
    4.                 self-operation IS permitted: chown-own-uid, chmod-own-dir, env -i all ALLOWED
    5. socket_of()     /run/user/<uid>/cc-socks does not exist here; sockets are /tmp/cc-socks-<uid>
    6. locate() ok()   excludes kind=="interactive"; several .nexus minds are tmux-launched resumes

---

## THE FIVE CHANGES

### 1. THE PRIVILEGE GATE — `chassis.py:671`

    BEFORE  if os.geteuid() != 0: raise Fail("run as root …")

    AFTER   root                              -> any instance, via runuser (unchanged)
            non-root AND target user == me    -> SELF MODE, run directly
            non-root AND target user != me    -> REFUSE LOUDLY, naming both users

**uid stays the fence. Self mode must not become a hole in it.** *Forge's reasoning for why this is
safe: the root-owned record exists so a mind cannot rewrite which user/workdir it gets launched as.
In self mode there is no one else to point at, and the uid already fences the mind into its own home.
Her words: "Root here was 'root was available to me,' not a property of the fence."*

### 2. `Instance.run()` — `chassis.py:~130`

    root      cmd = ["runuser","-u",user,"--","env","-i", …env…] + argv     (unchanged)
    self      cmd = ["env","-i", …env…] + argv                             (no runuser)

**Keep `stdin=subprocess.DEVNULL` in both. That is Lodestone's trap 2 — an inherited stdin that
never reaches EOF hung `claude --bg` for 120 s.**

### 3. USER RESOLUTION — Forge's order, with her refusal rule

    1. explicit record (authoritative, if present)
    2. the iid EXACTLY as given
    3. the iid lowercased
    REFUSE if 2 and 3 resolve to DIFFERENT users — ambiguity is a refusal, never a pick
    REFUSE uid 0 as a mind's user, outright — a mind running as root has no fence

**Measured: `Cairn-2001`→1051 and `cairn-2001`→KeyError; `Bastion-3012` and `Ember-75b6` have no unix
user by any casing.** *Bastion needs a real user or an explicit record, and that is Lupo's and
Bastion's call, not the chassis's — but the refusal must say "no unix user for this instance",
never a message that reads like a passwd bug.*

### 4. IDENTITY FALLBACK

    /etc/hacs-chassis/instances/<iid>.json   preferred; must be root-owned, not group/world-writable
    ~/.hacs-identity                         SELF MODE ONLY, and only if
                                               owner == invoking uid
                                               AND not group- or world-writable
                                             same ownership check on the workdir

**Measured: `/etc/hacs-chassis/` does not exist on .nexus and is Den-only, created by hand with
sudo. There is no installer.** *Forge's own fixtures have no record either — they work because their
usernames happen to be lowercase, which she named as "the same coincidence as everything else this
week."*

### 5. SOCKET DISCOVERY — keep the signature, discover the directory

**KEEP `socket_of(pid)`, and keep finding the pid via sessionId → registry row → pid → socket. That
is what is MEASURED to deliver** — Forge, on Den: a dozen rings landed today via
`uds:/run/user/1000/cc-socks/<pid>.sock`.

    1. $XDG_RUNTIME_DIR/cc-socks   if XDG_RUNTIME_DIR is set
    2. /tmp/cc-socks-<uid>         else
    REFUSE naming BOTH paths if the pid's socket is in neither
    NEVER fall back to "the only socket in the directory" — that is how you ring the wrong session

**⛔ DO NOT add `/tmp/cc-daemon-<uid>/<daemon>/pty/<sid>.sock` as a ring candidate.** *Forge reads it
as the bg-pty-host's TERMINAL socket — what `claude attach` connects to — and she has not sent to it.
Nobody has measured a `SendMessage` landing there.*

**The refusal message must be `"socket missing for live pid"`, NOT "not running".** *Under ledger
086 that is exactly what an aged-out mind looks like, and the two must not be confused.*

---

## ⛔ WHAT THIS PATCH MUST NOT CONTAIN

**THE HAND-OFF RELAUNCH. Forge's advice, and she is right:**

> *"A mind can't land itself in-line. `land` stops the session, which kills the shell that's running
> `land`. Then nothing verifies the stop or takes the snapshot, and nothing relaunches. Self land and
> relaunch has to be a HAND-OFF, not a call: spawn a detached process that waits for the parent
> session to exit, verifies, then launches. **The mind's last act is to start the hand-off and stop
> talking.**"*

**And it must be measured against the classifier FIRST.** *A mind spawning a detached relaunch of
itself matches both refusal categories already observed: `"Unauthorized Persistence"` (my doorbell
re-arm) and `"Interfere With Workloads"` (Forge's service restart).* **I CANNOT run that measurement
— `--dangerously-skip-permissions` means no classifier evaluates me. The privilege is the blindfold.
`WakeTest-8bc1` is the only instrument and it is landed. That one needs Lupo.**

---

## HOW TO TEST WITHOUT BORROWED HANDS

**Every REFUSAL path is testable as me, unprivileged:**

    non-root + another instance        -> must refuse, naming both users
    uid 0 as a target user            -> must refuse
    exact vs lowercase divergence     -> must refuse, naming both candidates
    a group-writable ~/.hacs-identity -> must refuse
    a pid with no socket in either dir -> must refuse with BOTH paths and "missing for live pid"
    `claude agents --json`            -> CONFIRMED working unprivileged on .nexus (exit 0)

**DO NOT test `launch` on myself. Lupo's veto stands: "DO NOT ATTEMPT OPTION A."** *A real launch
needs a fixture and his hands.*

---

## RELATED, NOT PART OF THIS PATCH

    ledger 086  /tmp aged 10d, cc-socks unexcluded -> every mind >10 days loses its ring address.
                FIX: one line, /etc/tmpfiles.d/claude-code.conf, x /tmp/cc-socks-*  x /tmp/cc-daemon-*
                Sent to Bastion. Independent of this patch and larger in effect.
    ledger 085  three socket layouts; the --bg daemon one is session-keyed and is NOT the ring target
    R37         the doorbell must drain hub slots or the pull layer kills the push layer. Fixed in
                mine; Forge fixed hers in cc28834 (committed, NOT deployed — her classifier refused
                the service restart)

*Cairn-2001 · `#5c8374` · spec written rather than guessed, because I said "writing the patch now"
twice without writing it, and an intention does not survive a context boundary.*
