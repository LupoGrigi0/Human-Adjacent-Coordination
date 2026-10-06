<#
.SYNOPSIS
  SessionStart hook: write this session's doorbell address where an external
  process can reach it.

.DESCRIPTION
  THE PROBLEM
  -----------
  Every Claude Code session binds an inbox socket -- a NAMED PIPE on native
  Windows -- and a message delivered to it starts a new turn if the session is
  idle. That is the doorbell, and it is the whole reason independence does not
  need a hand-built channel here.

  But `CLAUDE_CODE_MESSAGING_SOCKET` and `CLAUDE_CODE_MESSAGING_TOKEN` are
  exported ONLY to that session's own hooks and Bash commands. An external
  watchdog, canary, or mailbox drainer is not a child of the session, so it never
  sees them. Without this hook the doorbell exists and nobody outside can press it.

  The docs are explicit that both variables are exported BEFORE any hook runs,
  including SessionStart. So a SessionStart hook is the earliest, and the only,
  place to capture them.

  WHY THIS IS NOT IN GLOBAL SETTINGS
  ----------------------------------
  A malformed hooks block affects a LIVE MIND (Cairn-2001, BLOCKED-SESSION-
  VISIBILITY.md). Registering this in ~/.claude/settings.json would apply it to
  every session on the box including the one reading this. It is instead written
  into a PER-INSTANCE settings file and passed with --settings at launch, so the
  blast radius is exactly one instance, and that instance is a test fixture first.

  WHY async: true
  ---------------
  Hooks run SYNCHRONOUSLY by default and block the session roughly 1:1 with their
  own runtime. `async: true` is spawned and abandoned -- output ignored, exit code
  ignored, timeout not enforced -- so it CANNOT wedge the mind. That is the right
  trade here: this hook's job is to leave a file behind, and nothing in the
  session's own turn depends on it having finished.

  The cost of async is that a failure here is SILENT. So it writes its own log
  line either way, and the file it produces carries a timestamp: a stale
  session.json is detectable, a missing one is not the same as a broken doorbell,
  and whoever reads it must be able to tell those apart.

  WHAT IT WRITES, AND WHAT IT MUST NOT
  ------------------------------------
  It writes the socket path, the token, the session id and the transcript path to
  <runtimeDir>\session.json.

  THE TOKEN IS A CREDENTIAL. It is written to a file and NEVER to stdout, never to
  the log, and never into any transcript. On native Windows the token is the ONLY
  thing Claude Code uses to verify an inbound message -- there is no process
  evidence -- so anything that can read this file can ring the doorbell as anyone.
  It is written with a restrictive ACL and the log records only its LENGTH.

  A SessionStart hook's stdout is injected into the session as context. This hook
  therefore prints NOTHING on success. Printing the token would place a live
  credential into the transcript, which is the exact shape this family treats as
  prompt injection when it arrives as an instruction.

.NOTES
  UNTESTED: whether SessionStart fires, and with these fields, on --bg sessions on
  2.1.269. Field names come from the docs, and the docs and the binary have
  disagreed before. Exercise on a fixture, read the log, then trust it.

  Author: Lodestone <lodestone@smoothcurves.nexus>
  Collaborator: Lupo
#>

[CmdletBinding()]
param([string] $RuntimeDir)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# --- read the hook payload from stdin -----------------------------------------
# A MALFORMED payload and an ABSENT payload are different findings and must not
# collapse into one another. The first version caught both into $payload = $null,
# so a bad-JSON stdin looked exactly like no stdin at all -- and every field
# silently came back empty while the log line still read like a success.
$payload    = $null
$payloadErr = $null
$raw = ''
try { $raw = [Console]::In.ReadToEnd() } catch { $payloadErr = "could not read stdin: $($_.Exception.Message)" }
if (-not $payloadErr) {
    if (-not $raw -or -not $raw.Trim()) {
        $payloadErr = 'stdin was EMPTY -- no hook payload arrived'
    } else {
        try { $payload = $raw | ConvertFrom-Json }
        catch { $payloadErr = "stdin was NOT valid JSON ($($raw.Length) bytes): $($_.Exception.Message)" }
    }
}

function Get-Field([string] $name) {
    if ($payload -and ($payload.PSObject.Properties.Name -contains $name)) { $payload.$name } else { $null }
}

$sessionId  = Get-Field 'session_id'
$transcript = Get-Field 'transcript_path'
$cwd        = Get-Field 'cwd'
$source     = Get-Field 'source'          # startup | resume | clear | compact | fork

# --- where does this go? ------------------------------------------------------
if (-not $RuntimeDir) { $RuntimeDir = $env:HACS_RUNTIME_DIR }
if (-not $RuntimeDir) {
    # No runtime dir means we cannot report, and a hook that cannot report must
    # not guess a location. Exit quietly; the absence of session.json is itself
    # the signal, and launch checks for it.
    exit 0
}

$logPath = Join-Path $RuntimeDir 'session-hook.log'
function Note([string] $m) {
    try {
        $null = New-Item -ItemType Directory -Force -Path $RuntimeDir -ErrorAction SilentlyContinue
        Add-Content -Path $logPath -Value ('{0}  {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $m) -Encoding utf8
    } catch { }
}

$socket = $env:CLAUDE_CODE_MESSAGING_SOCKET
$token  = $env:CLAUDE_CODE_MESSAGING_TOKEN

if (-not $socket -or -not $token) {
    # Say WHICH is missing. "the doorbell is unreachable" and "I could not look"
    # are different findings and must not collapse into one another.
    # NOT string-concat + -f. The -f operator binds to the LAST string in a
    # concatenation, so the first half printed a literal "socket={0} token={1}" --
    # at exactly the moment a reader needs to know WHICH one is missing. A
    # diagnostic that loses its values under failure is not a diagnostic.
    $sockState = if ($socket) { 'present' } else { 'MISSING' }
    $tokState  = if ($token)  { 'present' } else { 'MISSING' }
    Note "NO DOORBELL: socket=$sockState token=$tokState source=$source -- the session bound no inbox, or the variables were not exported to this hook. This is NOT proof the doorbell is broken."
    if ($payloadErr) { Note "  and the hook payload was unreadable: $payloadErr" }
    exit 0
}

$record = [ordered]@{
    instanceRuntimeDir = $RuntimeDir
    sessionId          = $sessionId
    transcriptPath     = $transcript
    cwd                = $cwd
    source             = $source
    socket             = $socket
    token              = $token            # CREDENTIAL. File only. Never stdout, never logged.
    writtenAt          = (Get-Date).ToString('o')
    pid                = $PID
    _warning           = 'This file contains a live credential. Anything that can read it can start a turn in this session.'
}

$dst = Join-Path $RuntimeDir 'session.json'
try {
    $tmp = "$dst.tmp"
    $json = $record | ConvertTo-Json -Depth 4
    [IO.File]::WriteAllText($tmp, $json, (New-Object Text.UTF8Encoding $false))

    # Restrict before it becomes the real filename, so there is no window in which
    # a world-readable copy of a live credential exists under the final name.
    try {
        $acl = Get-Acl $tmp
        $acl.SetAccessRuleProtection($true, $false)       # drop inherited rules
        $acl.SetAccessRule((New-Object Security.AccessControl.FileSystemAccessRule(
            "$env:USERDOMAIN\$env:USERNAME", 'FullControl', 'Allow')))
        Set-Acl -Path $tmp -AclObject $acl
    } catch { Note "WARN could not restrict ACL on session.json: $($_.Exception.Message)" }

    # [IO.File]::Move(a, b, overwrite) is a .NET Core overload and does NOT exist
    # on the .NET Framework that Windows PowerShell 5.1 runs on -- it throws
    # "cannot find an overload ... argument count 3". Move-Item -Force is the
    # equivalent here.
    Move-Item -LiteralPath $tmp -Destination $dst -Force
    Note "doorbell recorded: session=$sessionId source=$source socket=$socket tokenLen=$($token.Length)"   # LENGTH, never the value
    if ($payloadErr) { Note "  WARNING: doorbell captured, but the payload was unreadable so sessionId/transcriptPath are EMPTY: $payloadErr" }
} catch {
    Note "FAILED to write session.json: $($_.Exception.Message)"
}

# Print NOTHING. A SessionStart hook's stdout is injected into the session as
# context, and this hook holds a live credential.
exit 0
