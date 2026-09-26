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
    [int] $PollSec = 3
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

# --- MARK -----------------------------------------------------------------------
if ($Mark) {
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

$escaped = [regex]::Escape($Nonce)
$deadline = (Get-Date).AddSeconds($TimeoutSec)
$grew = 0

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

        foreach ($line in ($tail -split "`n")) {
            if (-not $line.Trim()) { continue }
            if ($line -notmatch $escaped) { continue }
            try { $e = $line | ConvertFrom-Json } catch { continue }

            # THE TRAP: a caller's own command text lands in the transcript as
            # tool_use / tool_result. Those are the instrument appearing in its own
            # reading and are NOT evidence that a mind received anything.
            $blocks = @()
            if ($e.PSObject.Properties.Name -contains 'message' -and $e.message) {
                $c = $e.message.content
                if ($c -is [array]) { $blocks = @($c | ForEach-Object { if ($_.PSObject.Properties.Name -contains 'type') { $_.type } }) }
                elseif ($c -is [string]) { $blocks = @('string') }
            }
            if ($blocks -contains 'tool_use' -or $blocks -contains 'tool_result') { continue }
            if ($e.PSObject.Properties.Name -contains 'toolUseResult') { continue }

            Write-HacsLog -Instance $inst -Log 'canary.log' -Message "HEARING nonce=$Nonce entryType=$($e.type) blocks=$($blocks -join ',')"
            Emit 'HEARING' 0 "the nonce appeared in the transcript in a '$($e.type)' entry, outside any tool block. The mind received it." `
                @{ nonce = $Nonce; entryType = $e.type; blocks = $blocks; transcriptGrewBytes = $grew }
        }
    }
    Start-Sleep -Seconds $PollSec
}

# DEAF is only reachable from here: we could look, the whole time, and it never came.
Write-HacsLog -Instance $inst -Log 'canary.log' -Message "DEAF nonce=$Nonce after ${TimeoutSec}s (transcript grew $grew bytes)"
Emit 'DEAF' 1 ("the nonce never appeared within ${TimeoutSec}s. The transcript grew $grew bytes in that time, " +
    "so the session was " + $(if ($grew -gt 0) { 'ACTIVE and still did not receive it' } else { 'entirely quiet -- it may be frozen rather than deaf' }) + '.') `
    @{ nonce = $Nonce; transcriptGrewBytes = $grew; timeoutSec = $TimeoutSec }
