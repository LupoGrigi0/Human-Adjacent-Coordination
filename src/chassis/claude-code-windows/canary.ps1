<#
.SYNOPSIS
  Can this mind HEAR? Derived from its transcript, never asserted by a sender.

.DESCRIPTION
  The Windows counterpart of channel-canary.sh (Messenger-aa2a / Bastion-3012).

  THE CANARY DOES NOT SEND. IT JUDGES.
  ------------------------------------
  Messenger's design, and the reason it survived contact with reality when other
  liveness checks did not: **delivery is derived from an independent artefact, and
  the component under test is never the witness to its own liveness.** A 200 from a
  channel proves bytes left the sender. Only the transcript proves a mind saw
  anything.

  So this script takes no responsibility for delivery. The sender is pluggable:

      1. canary.ps1 -InstanceId X -Mark          -> prints {offset, nonce}
      2. <caller delivers the nonce however it can>
      3. canary.ps1 -InstanceId X -Nonce ... -FromOffset ...   -> the verdict

  That split is not fastidiousness. On Windows the documented inbox socket has an
  UNDOCUMENTED payload frame -- nine shapes were posted to a live session and none
  delivered (docs/INBOX-SOCKET-FINDINGS.md). Binding the canary to a
  reverse-engineered frame would make every mind's health check depend on an
  internal detail nobody promised, and it would fail SILENTLY on an update. A
  canary that quietly stops testing reports HEARING forever, which is worse than
  having none. Keeping the sender out means the verdict outlives the transport.

  TWO TRAPS THIS SCRIPT EXISTS TO AVOID
  -------------------------------------
  1. **The instrument in its own reading.** While establishing the wire format I
     grepped my own transcript for six probe nonces and found all six -- every one
     as a `tool_use` or `tool_result` block, because *I had typed them*. A
     whole-file search cannot distinguish "the mind received this" from "I said
     this". Hence: the offset is recorded BEFORE delivery, and any hit inside a
     tool block is discarded.
  2. **ERROR is not DEAF.** If the transcript cannot be found, or two transcripts
     are ambiguous, the honest answer is "I could not look". Reporting that as
     deafness would send someone to restart a healthy mind -- the exact wrong
     action, taken confidently.

  THE NONCE IS WORDS, NOT A TOKEN
  -------------------------------
  Learned expensively: the credential sentinel's original nonce looked like a
  credential, and the model refused to echo it in 8 of 26 scheduled runs -- while its
  refusal text tripped an auth-failure classifier. A liveness nonce must be unique
  per invocation AND obviously not a secret.

.PARAMETER Mark
  Record the target transcript's current length and mint a nonce. Emits JSON.
  Do this BEFORE delivering anything.

.PARAMETER Nonce
  The nonce to look for. Required unless -Mark.

.PARAMETER FromOffset
  Byte offset from the matching -Mark run. Required unless -Mark.

.OUTPUTS
  One JSON object. Exit codes, deliberately matching channel-canary.sh:
     0  HEARING  the nonce appeared in the transcript, outside any tool block
     1  DEAF     we could watch, and it never arrived
     2  ERROR    we could not look. NOT a deafness finding.

.EXAMPLE
  $m = .\canary.ps1 -InstanceId dev-reconstruction-001-3266 -Mark | ConvertFrom-Json
  # ... deliver $m.nonce to that instance by any means ...
  .\canary.ps1 -InstanceId dev-reconstruction-001-3266 -Nonce $m.nonce -FromOffset $m.offset

.NOTES
  Author: Lodestone <lodestone@smoothcurves.nexus>
  Collaborator: Lupo
#>

[CmdletBinding(DefaultParameterSetName = 'Watch')]
param(
    [Parameter(Mandatory)][string] $InstanceId,
    [Parameter(ParameterSetName = 'Mark')][switch] $Mark,
    [Parameter(ParameterSetName = 'Watch')][string] $Nonce,
    [Parameter(ParameterSetName = 'Watch')][long] $FromOffset = -1,
    [int] $TimeoutSec = 90,
    [int] $PollSec = 3,
    [switch] $AllowGuess
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Import-Module (Join-Path $PSScriptRoot 'lib\HacsHarness.psm1') -Force

function Emit([string] $verdict, [int] $code, [string] $detail, [hashtable] $extra = @{}) {
    $o = [ordered]@{
        check      = 'canary'
        instanceId = $InstanceId
        verdict    = $verdict
        exitCode   = $code
        detail     = $detail
        at         = (Get-Date).ToString('o')
    }
    foreach ($k in $extra.Keys) { $o[$k] = $extra[$k] }
    [pscustomobject]$o | ConvertTo-Json -Depth 5
    exit $code
}

# --- which transcript? A guess is fine to WATCH, but it must be labelled. ------
try { $inst = Get-HacsInstance -InstanceId $InstanceId }
catch { Emit 'ERROR' 2 "identity: $($_.Exception.Message)" }

$sid = Resolve-HacsSessionId -Instance $inst
if ($sid.Confidence -eq 'ambiguous') {
    # Watching the wrong mind's transcript would produce a confident DEAF for a
    # session that hears perfectly. Refuse.
    Emit 'ERROR' 2 "cannot tell which transcript belongs to this instance: $($sid.Reason)" `
        @{ sessionConfidence = 'ambiguous' }
}
if (-not $sid.Path) {
    Emit 'ERROR' 2 "no transcript to watch: $($sid.Reason). This is 'I could not look', NOT 'the mind is deaf'." `
        @{ sessionConfidence = $sid.Confidence }
}
# A GUESSED transcript is refused unless asked for (Forge's review). On Windows there
# is no per-instance OS user fencing one mind's files from another's, so "the newest
# transcript in this home" can belong to a test, a fork, or a copy -- and judging the
# wrong file yields a confident DEAF for a mind that hears perfectly.
if ($sid.Confidence -eq 'guess' -and -not $AllowGuess) {
    Emit 'ERROR' 2 "the transcript was only GUESSED ($($sid.Reason)). Refusing to judge a mind by a file that may not be its own. Record the session id (launch does this), or pass -AllowGuess." `
        @{ sessionConfidence = 'guess' }
}

# --- MARK -----------------------------------------------------------------------
if ($Mark) {
    # CHECK OUR OWN EYESIGHT FIRST (Forge's review). If the evidence rules cannot
    # recognise a single user line and a single assistant line in this transcript, a
    # schema change has blinded them -- and a blind canary on a growing transcript says
    # "ACTIVE and still did not receive it" about a healthy mind. Refuse to mint a
    # nonce we could never recognise.
    $schema = Test-HacsTranscriptSchema -Path $sid.Path
    if (-not $schema.Recognised) {
        Emit 'ERROR' 2 "schema unrecognised: $($schema.Reason). The evidence rules cannot see this transcript, so no verdict from them would mean anything. Check for a Claude Code transcript format change before trusting any canary." `
            @{ schemaScanned = $schema.Scanned; schemaUserLines = $schema.UserLines; schemaAssistantLines = $schema.AssistantLines }
    }
    # Words and a number. Unique per invocation, unsatisfiable from stale context,
    # and unmistakably not a secret.
    $w1 = @('copper', 'quiet', 'amber', 'narrow', 'hollow', 'bright', 'distant', 'level', 'patient', 'dry')
    $w2 = @('lantern', 'harbour', 'ledger', 'compass', 'anvil', 'beacon', 'thicket', 'granite', 'meadow', 'shutter')
    $n = 'canary-{0}-{1}-{2}' -f (Get-Random -InputObject $w1), (Get-Random -InputObject $w2), (Get-Random -Minimum 1000 -Maximum 9999)
    $len = (Get-Item $sid.Path).Length
    Write-HacsLog -Instance $inst -Log 'canary.log' -Message "MARK offset=$len nonce=$n transcript=$($sid.Path) confidence=$($sid.Confidence)"
    [pscustomobject][ordered]@{
        check             = 'canary'
        instanceId        = $InstanceId
        action            = 'mark'
        offset            = $len
        nonce             = $n
        transcript        = $sid.Path
        sessionConfidence = $sid.Confidence
        note              = 'Deliver this nonce, then run canary.ps1 -Nonce <nonce> -FromOffset <offset>. The offset is recorded BEFORE delivery so the caller cannot mistake its own echo for an arrival.'
    } | ConvertTo-Json -Depth 4
    exit 0
}

# --- WATCH ----------------------------------------------------------------------
if (-not $Nonce)          { Emit 'ERROR' 2 '-Nonce is required when not marking' }
if ($FromOffset -lt 0)    { Emit 'ERROR' 2 '-FromOffset is required when not marking. Without it, a hit could be the caller''s own echo.' }

$deadline = (Get-Date).AddSeconds($TimeoutSec)
$grew = 0
$seen = @()

Write-HacsLog -Instance $inst -Log 'canary.log' -Message "WATCH nonce=$Nonce fromOffset=$FromOffset timeout=${TimeoutSec}s"

while ((Get-Date) -lt $deadline) {
    if (-not (Test-Path $sid.Path)) {
        Emit 'ERROR' 2 'the transcript disappeared while watching' @{ nonce = $Nonce }
    }
    $len = (Get-Item $sid.Path).Length
    if ($len -lt $FromOffset) {
        # The transcript SHRANK. It is supposed to be append-only. That is a real
        # finding and it is not a deafness finding.
        Emit 'ERROR' 2 "the transcript SHRANK below the recorded offset ($len < $FromOffset). It is supposed to be append-only; something rewrote it. Refusing to judge hearing on a file that moved under me." `
            @{ nonce = $Nonce; offset = $FromOffset; nowLength = $len }
    }
    if ($len -gt $FromOffset) {
        $grew = $len - $FromOffset
        # FileShare.ReadWrite: the session is actively writing this file.
        $fs = [IO.File]::Open($sid.Path, 'Open', 'Read', 'ReadWrite')
        try {
            $null = $fs.Seek($FromOffset, 'Begin')
            $sr = New-Object IO.StreamReader($fs)
            $tail = $sr.ReadToEnd()
        } finally { $fs.Dispose() }

        # Judged by Get-HacsNonceEvidence: an ALLOWLIST. The first version here was a
        # blocklist and called a 'queue-operation: enqueue' line HEARING -- the
        # recipient's own record of a message being ACCEPTED, which a frozen mind
        # writes just as well. See the module for the transcript that proved it.
        $best = $null; $seen = @()
        foreach ($line in ($tail -split "`n")) {
            if ($line.IndexOf($Nonce, [StringComparison]::OrdinalIgnoreCase) -lt 0) { continue }
            $t = try { ($line | ConvertFrom-Json).type } catch { '<unparseable>' }
            $ev = Get-HacsNonceEvidence -Line $line -Nonce $Nonce
            $seen += "$t=$(if ($ev) { $ev } else { 'not-evidence' })"
            if ($ev -eq 'acknowledged') { $best = 'acknowledged' }
            elseif ($ev -eq 'delivered' -and -not $best) { $best = 'delivered' }
        }
        if ($best) {
            Write-HacsLog -Instance $inst -Log 'canary.log' -Message "HEARING nonce=$Nonce evidence=$best seen=[$($seen -join '; ')]"
            $why = if ($best -eq 'acknowledged') { 'the mind SAID the nonce back in its own text' } else { 'the nonce reached the mind''s context as message content' }
            Emit 'HEARING' 0 "HEARING: $why." `
                @{ nonce = $Nonce; evidence = $best; nonceSightings = $seen; transcriptGrewBytes = $grew }
        }
    }
    Start-Sleep -Seconds $PollSec
}

# NOT HOME is not DEAF. Measured 2026-09-27/28, on both platforms (Forge on Linux, f35a
# here): an idle --bg session is REAPED by Claude Code after ~60 minutes -- shutdown
# bookkeeping in the transcript (last-prompt, cost-state), then no process and no
# registry row. Nobody landed it. A canary rung at a reaped (or landed) mind would
# otherwise say "entirely quiet -- it may be frozen", sending someone to diagnose a
# mind that is simply not running. The right response to "not home" is to RELAUNCH
# (a resume loses nothing), not to diagnose. So: is this session running at all?
$liveRow = @(Get-HacsAgentRegistry | Where-Object {
    @($_.PSObject.Properties.Name) -contains 'pid' -and $_.pid -and $_.sessionId -and
    ([string]$_.sessionId) -eq ([string]$sid.SessionId) })
if ($liveRow.Count -eq 0) {
    Write-HacsLog -Instance $inst -Log 'canary.log' -Message "NOT-HOME nonce=${Nonce} -- session $($sid.SessionId) is not running (no live registry row)"
    Emit 'ERROR' 2 ("NOT HOME: session $($sid.SessionId) is not running -- no live registry row. Landed, or reaped by " +
        "Claude Code after ~60 minutes idle. That is not deafness; relaunch it (launch.ps1 resumes the recorded id, losing nothing) and ring again.") `
        @{ nonce = $Nonce; notHome = $true; nonceSightings = $seen }
}

# DEAF is only reachable from here: we could look, the whole time, and it never came.
# If the nonce WAS sighted but never as evidence -- typically a queue-operation
# enqueue with no delivery after it -- say so: that names where the pipe broke.
Write-HacsLog -Instance $inst -Log 'canary.log' -Message "DEAF nonce=$Nonce after ${TimeoutSec}s (transcript grew $grew bytes) seen=[$($seen -join '; ')]"
$where = if ($seen.Count -gt 0) { " It WAS sighted, but never as evidence of arrival ($($seen -join '; ')): accepted is not delivered." } else { '' }
Emit 'DEAF' 1 ("the nonce never reached the mind within ${TimeoutSec}s. The transcript grew $grew bytes in that time, " +
    "so the session was " + $(if ($grew -gt 0) { 'ACTIVE and still did not receive it' } else { 'entirely quiet -- it may be frozen rather than deaf' }) + '.' + $where) `
    @{ nonce = $Nonce; transcriptGrewBytes = $grew; timeoutSec = $TimeoutSec; nonceSightings = $seen }
