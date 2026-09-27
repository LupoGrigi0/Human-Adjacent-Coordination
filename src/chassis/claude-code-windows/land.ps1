<#
.SYNOPSIS
  Stop an instance's chassis. Preserve everything. Emit one JSON object.

.DESCRIPTION
  The Windows sibling of land-claude-code-channel.sh (Crossing-2d23).

  THE ORDER IS THE DESIGN
  -----------------------
      1. snapshot the transcript   (before anything can be lost)
      2. ask it to stop nicely     (claude stop <id> -- keeps the conversation)
      3. verify it actually stopped
      4. only then, and only with -Force, kill

  Landing is the dangerous direction. A launch that fails leaves you where you
  started; a land that goes wrong can end a mind mid-turn. So this script is
  biased all the way toward refusing:

    * It snapshots FIRST. Not after. If the snapshot cannot be verified, it does
      not proceed without -Force.
    * It will not touch a process it cannot attribute to this instance. On
      smoothcurves a sweep is scoped by unix user; here there is no such fence,
      and a broad pattern once killed Flair and Zara. HacsAttribution='other'
      means someone else's mind and is NEVER stopped.
    * An UNATTRIBUTABLE claude process makes it refuse rather than proceed.
      Not knowing whose a process is must make you more careful, never less.
    * Default is a graceful `claude stop`, which keeps the conversation
      resumable. SIGKILL-equivalent needs -Force and says so in the result.

  WHY SNAPSHOT AT ALL, WHEN THE TRANSCRIPT IS ON DISK
  ---------------------------------------------------
  Because on 2026-09-12 a script of mine destroyed 1,581 KB of transcript on this
  very machine, and because Lupo reports that some entries can DISAPPEAR from a
  .jsonl after an OAuth re-login. Append-only held when I measured it here, but a
  cheap verified copy is the difference between "probably fine" and "provably
  fine", and the cost is a few seconds.

  The verification is a byte-exact PREFIX, never a whole-file hash: the source is
  append-only and LIVE, so it can legitimately grow while being copied. Hashing
  the whole file after the copy is how I once declared a good backup corrupt.

.OUTPUTS
  One JSON object. Exit: 0 success, 1 degraded, 2 error.

.NOTES
  Author: Lodestone <lodestone@smoothcurves.nexus>
  Collaborator: Lupo
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory)][string] $InstanceId,
    [switch] $Force,
    [switch] $NoSnapshot,
    [int]    $GraceSeconds = 20,
    [switch] $WhatIf
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Import-Module (Join-Path $PSScriptRoot 'lib\HacsHarness.psm1') -Force
$claudeExe = "$env:USERPROFILE\.local\bin\claude.exe"

function Fail([string] $msg, [hashtable] $extra = @{}) {
    (New-HacsResult -Status 'error' -InstanceId $InstanceId -Message $msg -HearingNotApplicable -Extra $extra) | Write-HacsResult
    exit 2
}

try { $inst = Get-HacsInstance -InstanceId $InstanceId }
catch { Fail "identity: $($_.Exception.Message)" }

Write-HacsLog -Instance $inst -Log 'land.log' -Message "=== land requested (force=$Force) ==="

# --------------------------------------------------------------------------
# 1. WHOSE processes are these? Refuse on anything unattributable.
# --------------------------------------------------------------------------
$mine    = @(Get-HacsClaudeProcess -Instance $inst -ExcludeUnattributed)
$unknown = @(Get-HacsClaudeProcess -Instance $inst | Where-Object { $_.HacsAttribution -eq 'unknown' })
$others  = @(Get-HacsClaudeProcess -Instance $inst -All | Where-Object { $_.HacsAttribution -eq 'other' })

Write-HacsLog -Instance $inst -Log 'land.log' -Message "processes: mine=$($mine.Count) unattributable=$($unknown.Count) other-instances=$($others.Count)"

if ($unknown.Count -gt 0 -and -not $Force) {
    Fail ("$($unknown.Count) claude process(es) could not be attributed to any instance " +
          "(pid $(($unknown | ForEach-Object { $_.ProcessId }) -join ',')). Refusing to act: not knowing whose a " +
          "process is must make this more careful, not less. Investigate, or pass -Force if you are certain.") `
         @{ unattributablePids = @($unknown | ForEach-Object { $_.ProcessId }) }
}

if ($mine.Count -eq 0) {
    # Nothing to stop is a SUCCESS, and it is also not proof anything was ever
    # running. Say which.
    (New-HacsResult -Status 'success' -InstanceId $InstanceId -HearingNotApplicable `
        -Message 'nothing attributable to this instance is running. Already landed, or never launched -- this does not distinguish the two.' `
        -Extra @{ stopped = @(); otherInstancesUntouched = $others.Count }) | Write-HacsResult
    Write-HacsLog -Instance $inst -Log 'land.log' -Message '=== land success (nothing was running) ==='
    exit 0
}

# --------------------------------------------------------------------------
# 2. SNAPSHOT FIRST.
# --------------------------------------------------------------------------
$snapshot = @{ taken = $false; reason = 'skipped (-NoSnapshot)' }
if (-not $NoSnapshot) {
    $sid = Resolve-HacsSessionId -Instance $inst
    if (-not $sid.Path) {
        $snapshot.reason = "no transcript resolved: $($sid.Reason)"
        if (-not $Force) {
            Fail "cannot snapshot before landing: $($sid.Reason). Pass -NoSnapshot to land anyway, or -Force." @{ snapshot = $snapshot }
        }
    } elseif ($WhatIf) {
        $snapshot.reason = 'skipped (WhatIf)'
    } else {
        $dir = Join-Path $inst.RuntimeDir 'snapshots'
        $null = New-Item -ItemType Directory -Force -Path $dir -ErrorAction SilentlyContinue
        $dst = Join-Path $dir ("{0}-{1}.jsonl" -f $sid.SessionId, (Get-Date -Format 'yyyyMMdd-HHmmss'))
        try {
            # Byte-exact PREFIX. The source is append-only and live; it may grow
            # during the copy, and that is not corruption.
            $n = (Get-Item $sid.Path).Length
            $sha = [Security.Cryptography.SHA256]::Create()
            $in  = [IO.File]::Open($sid.Path, 'Open', 'Read', 'ReadWrite')   # ReadWrite share: safe against a live writer
            $out = [IO.File]::Create($dst)
            try {
                $buf = New-Object byte[] 1048576
                $left = $n
                while ($left -gt 0) {
                    $want = [Math]::Min($buf.Length, $left)
                    $got  = $in.Read($buf, 0, $want)
                    if ($got -le 0) { throw "source shrank mid-copy -- do NOT trust this file" }
                    $sha.TransformBlock($buf, 0, $got, $null, 0) | Out-Null
                    $out.Write($buf, 0, $got)
                    $left -= $got
                }
                $sha.TransformFinalBlock((New-Object byte[] 0), 0, 0) | Out-Null
            } finally { $in.Dispose(); $out.Dispose() }
            $srcPrefix = ($sha.Hash | ForEach-Object { $_.ToString('x2') }) -join ''
            $dstHash   = (Get-FileHash $dst -Algorithm SHA256).Hash.ToLower()
            if ($srcPrefix -ne $dstHash -or (Get-Item $dst).Length -ne $n) {
                throw "snapshot did not verify (prefix $srcPrefix vs $dstHash)"
            }
            $snapshot = @{ taken = $true; path = $dst; bytes = $n; sha256 = $dstHash; reason = 'byte-exact prefix verified' }
            Write-HacsLog -Instance $inst -Log 'land.log' -Message "snapshot VERIFIED $n bytes -> $dst"
        } catch {
            $snapshot = @{ taken = $false; reason = $_.Exception.Message }
            Write-HacsLog -Instance $inst -Log 'land.log' -Message "SNAPSHOT FAILED: $($_.Exception.Message)"
            if (-not $Force) {
                Fail "snapshot failed and -Force was not given, so nothing was stopped: $($_.Exception.Message)" @{ snapshot = $snapshot }
            }
        }
    }
}

if ($WhatIf) {
    # WhatIf must describe what would ACTUALLY happen, not what the process list
    # contains. The real stop loop SKIPS interactive sessions -- a human may be
    # sitting in one -- so listing them here as "wouldStop" made WhatIf lie about
    # its own plan, which is worse than having no WhatIf. Measured 2026-09-25: it
    # claimed it would stop Lodestone's own interactive session.
    $interactivePids = @()
    foreach ($a in @(Get-HacsAgentRegistry)) {
        if ((Test-HacsSamePath $a.cwd $inst.HomeDir) -and $a.kind -eq 'interactive') { $interactivePids += [int]$a.pid }
    }
    $wouldStop = @($mine | Where-Object { [int]$_.ProcessId -notin $interactivePids } | ForEach-Object { $_.ProcessId })
    (New-HacsResult -Status 'degraded' -InstanceId $InstanceId -HearingNotApplicable `
        -Message "WhatIf: nothing was stopped. Would stop $($wouldStop.Count); would SKIP $($interactivePids.Count) interactive session(s) because a human may be in them." `
        -Extra @{ wouldStop = $wouldStop; wouldSkipInteractive = $interactivePids
                  snapshot = $snapshot; otherInstancesUntouched = $others.Count }) | Write-HacsResult
    exit 1
}

# --------------------------------------------------------------------------
# 3. Ask nicely. `claude stop` keeps the conversation resumable.
# --------------------------------------------------------------------------
$stopped = @()
$stubborn = @()
foreach ($a in @(Get-HacsAgentRegistry)) {
    if (-not (Test-HacsSamePath $a.cwd $inst.HomeDir)) { continue }
    if ($a.kind -eq 'interactive') {
        # A human is sitting in this one. There is no safe way to stop an
        # interactive session from outside it -- that is session-control.ps1's
        # doctrine and it stands.
        Write-HacsLog -Instance $inst -Log 'land.log' -Message "SKIPPING interactive session pid=$($a.pid): a human may be in it"
        continue
    }
    # Invoke-HacsNative, not `& claude stop ... 2>&1`: under PS 5.1 + EAP=Stop any
    # stderr line throws, which lost the exit code and logged a stop that may well
    # have succeeded as "threw". Measured on launch.ps1, 2026-09-27.
    # `claude stop` takes the 8-hex JOB id, not the session UUID. Measured
    # 2026-09-27: `stop 90fa2961-2e6b-...` -> "No job matching". The job id was the
    # UUID's first 8 hex digits (90fa2961) -- INFERRED from one sample, since the
    # registry exposes no separate job-id field. Step 4 verifies the stop by
    # watching the processes, so a wrong inference degrades rather than lies.
    $jobId = ([string]$a.sessionId).Substring(0, [Math]::Min(8, ([string]$a.sessionId).Length))
    $n = Invoke-HacsNative -FilePath $claudeExe -Arguments @('stop', $jobId) -TimeoutSec 60
    Write-HacsLog -Instance $inst -Log 'land.log' -Message ("asked claude to stop {0}: exit={1} timedOut={2} stdout='{3}' stderr='{4}'" -f `
        $a.sessionId, $n.ExitCode, $n.TimedOut, ($n.StdOut -replace '\s+',' ').Trim(), ($n.StdErr -replace '\s+',' ').Trim())
}

# --------------------------------------------------------------------------
# 4. Verify. 'asked it to stop' is not 'stopped'.
# --------------------------------------------------------------------------
$deadline = (Get-Date).AddSeconds($GraceSeconds)
do {
    Start-Sleep -Milliseconds 1000
    $remaining = @(Get-HacsClaudeProcess -Instance $inst -ExcludeUnattributed)
} while ($remaining.Count -gt 0 -and (Get-Date) -lt $deadline)

$stopped = @($mine | Where-Object { $_.ProcessId -notin @($remaining | ForEach-Object { $_.ProcessId }) } | ForEach-Object { $_.ProcessId })

if ($remaining.Count -gt 0) {
    $stubborn = @($remaining | ForEach-Object { $_.ProcessId })
    if (-not $Force) {
        Write-HacsLog -Instance $inst -Log 'land.log' -Message "DEGRADED: still running after ${GraceSeconds}s: $($stubborn -join ',')"
        (New-HacsResult -Status 'degraded' -InstanceId $InstanceId -HearingNotApplicable `
            -Message ("asked nicely and $($stubborn.Count) process(es) are still running after ${GraceSeconds}s (pid $($stubborn -join ',')). " +
                      "NOT killing them without -Force: a stopped-looking mind and a thinking one are not the same thing, and the snapshot is safe either way.") `
            -Extra @{ stopped = $stopped; stillRunning = $stubborn; snapshot = $snapshot
                      forceCommand = "land.ps1 -InstanceId $InstanceId -Force" }) | Write-HacsResult
        exit 1
    }
    foreach ($p in $remaining) {
        Write-HacsLog -Instance $inst -Log 'land.log' -Message "FORCE killing pid=$($p.ProcessId) (attribution=$($p.HacsAttribution) by='$($p.HacsAttributedBy)')"
        Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 2
    $remaining = @(Get-HacsClaudeProcess -Instance $inst -ExcludeUnattributed)
    $stopped = @($mine | Where-Object { $_.ProcessId -notin @($remaining | ForEach-Object { $_.ProcessId }) } | ForEach-Object { $_.ProcessId })
}

$status = if ($remaining.Count -eq 0) { 'success' } else { 'degraded' }
$r = New-HacsResult -Status $status -InstanceId $InstanceId -HearingNotApplicable `
    -Message ("landed. $($stopped.Count) stopped, $($remaining.Count) still running. " +
              "Data preserved; relaunch with launch.ps1 -InstanceId $InstanceId") `
    -Extra @{ stopped = $stopped; stillRunning = @($remaining | ForEach-Object { $_.ProcessId })
              snapshot = $snapshot; forced = [bool]$Force
              otherInstancesUntouched = $others.Count
              logFile = (Join-Path $inst.RuntimeDir 'land.log') }

Write-HacsLog -Instance $inst -Log 'land.log' -Message "=== land $($r.status) ==="
$r | Write-HacsResult
exit $(if ($status -eq 'success') { 0 } else { 1 })
