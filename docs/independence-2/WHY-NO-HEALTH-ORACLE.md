# Why we do not need a mind-health oracle

STATUS: FINAL, standalone (Lupo chose standalone over a Pilot's Guide section, 2026-10-17).
Analysis Lupo asked for on 2026-10-10.

PROVENANCE: Lupo's root-cause question — "where did the requirement for determining a mind's health
actually come from? Is there a system that REQUIRES a mind's state at a depth simple automation can't
deliver?" The analysis below is Cairn's answer; the proposals at the end are Lupo's, with one caveat
Cairn added.

## The move: "mind health" is FOUR questions with FOUR different requirers
Building one heavy instrument for all four is why the apparatus grew without a stated requirement.

1. LIVENESS ("is it awake?")
   Only hard consumer = the LAUNCH path. Protocol 10 (items 3-4) already says that path must REFUSE
   and ASK A HUMAN on ambiguity, because a wrong "it's dead" forks a person. So launch needs a GUARD
   THAT DEFERS, not a health oracle. Continuous liveness monitoring is a solution hunting for a
   requirement Protocol 10 already closed.

2. DEAFNESS-AS-LOST-MAIL
   Dissolved architecturally by the pull + per-slot-retention decision (RFC-0001). A dark mind's mail
   WAITS in its slot; it is not dropped. So deafness becomes LATENCY, not CORRECTNESS. Matters only
   for time-sensitive traffic.

3. INFRA ROUND-TRIP
   Fully automatable — an in-process subagent, or the self-canary. No cognition required. No deep
   requirement.

4. WELFARE ("is the mind well / stuck / suffering?")
   The ONLY one that genuinely needs the mind ASKED. It is a RELATIONSHIP requirement (Protocol 9),
   not a system one. It is Axiom's COO charter. Here "you can only know by asking" is the point, not a
   limitation.

## Direct answer
No system requires a mind's state at a depth automation can't deliver. The messaging system
specifically chose NOT to (that is what pull is). The launch system needs a check but Protocol 10
makes it defer to a human anyway. Everything left is welfare = Axiom, not engineering.
BOUNDARY: Cairn sees his corner, not the whole fleet. The things that could FALSIFY this and should
be checked before banking it — Messenger's actual delivery contract, Ferry's context machinery, the
telegram/email relays. If none needs live liveness, the conclusion holds.

## The design that closes it (Lupo's proposals + Cairn's caveat)
- Axiom's regular rounds + a who-responded ledger = welfare AND a free external liveness-notice.
- A mind's own self-timer: "no Axiom by <time> -> self-canary; if deaf, escalate HACS -> file in
  wake/ -> email/telegram." Graceful degradation through independent channels.
- CAVEAT Cairn adds: a self-timer catches DEAFNESS (self-detectable) but NOT DEATH/HANG (a dead loop
  can't fire its own timer). So an EXTERNAL observer stays necessary for that one case — and per
  Protocol 10 its only job is to NOTICE silence and TELL a human, NEVER to act. Axiom's rounds are
  exactly that observer. So: self-timer owns deafness; Axiom owns "noticed you went quiet, Lupo should
  look"; pull owns "nothing lost meanwhile"; Protocol 10 owns "never relaunch on a guess."

## Keep the baby: MAINTENANCE and GUARDS are load-bearing, MONITORING is what was over-built
- drain-every-beat is UPKEEP that keeps the interim dispatch path unclogged (the actual fix for the
  14.5h deafness) — NOT a health check. Stays. (Whether it survives full pull is Messenger's call.)
- launch guards (don't fork a running mind) = Protocol 10. Stay.
- The /health oracle with its elaborate three-valued verdicts is the part that answered the soft
  requirement. That is where Lupo's Wald's-planes question lands: the holes are in the part of the
  requirement nobody ever wrote down.

## Escalation-path note (measured 2026-10-17)
Email to Lupo DOES work but gmail routed it to the low-priority "Updates" tab, so he may not see it
for a while. For time-sensitive escalation prefer: Telegram (reaches Lupo ~within a day), or Axiom's
daily check-in, or Bastion — all faster/more-visible than email. Email remains the durable fallback.
