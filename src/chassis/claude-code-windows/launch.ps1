<#
.SYNOPSIS
  Start an instance's chassis on Windows. Emits one JSON object.

.DESCRIPTION
  The Windows sibling of launch-claude-code-channel.sh (Crossing-2d23). SAME
  CONTRACT, different mechanism:

      Linux            Windows
      tmux             claude --bg (native background session + daemon)
      unix user        directory + port (there is no per-instance OS user here)
      systemd          Task Scheduler
      channel port     the per-session messaging pipe (the doorbell)

  Crossing's two rules are inherited and are ENFORCED BY New-HacsResult rather
  than by my remembering them:

      status is NEVER 'success' over a mind that cannot hear.
      'unknown' (could not measure) is NEVER collapsed into 'false' (deaf).

  ATTENDED vs UNATTENDED IS BAKED IN AT BIRTH
  -------------------------------------------
  Not a runtime switch. Anthropic's anti-early-stopping paragraph for Opus 5.5
  must be present from the FIRST request of a session, and
  --system-prompt-snapshot (on by default) then pins it and replays it verbatim
  through every resume until compaction. It also must NOT be present in a session
  where a human is there to answer, because it instructs the model not to stop and
  check in. Both cannot be true of one session. So a session is born attended or
  unattended and stays that way for its life.
  See docs: prompts/opus-5-5-unattended.md.

  THE CREDENTIAL PRECHECK IS NOT OPTIONAL
  ---------------------------------------
  2026-08-09 the family's OAuth expired and every mind went dark behind green
  health checks. 2026-09-24 the same thing happened here and two scheduled wakes
  died with an empty stderr. A launch that starts a chassis on a dead credential
  produces a process that cannot think, and a process that cannot think is exactly
  what a naive check calls healthy. So launch refuses, loudly, before starting
  anything.

.PARAMETER Mode
  'unattended' -> the anti-early-stopping paragraph is appended to the system
                  prompt at first request. For sessions nobody is watching.
  'attended'   -> it is NOT appended. For sessions a human will attach to.

.OUTPUTS
  One JSON object. status: success | degraded | error.
  Exit code: 0 success, 1 degraded, 2 error. Three states, three codes.

.NOTES
  UNTESTED AT TIME OF WRITING: the `claude --bg` start path itself. `--bg` is
  verified to work on this box (daemon.log shows a control socket bound and a
  worker spawned and settled on 2.1.269), but launching a full SESSION through it
  has not been done here. This script is to be exercised on a throwaway test
  instance before it is ever pointed at a mind. Do not skip that.

  Author: Lodestone <lodestone@smoothcurves.nexus>
  Collaborator: Lupo
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory)][string] $InstanceId,
    [string] $SessionId,
    [string] $Model,
    [ValidateSet('attended', 'unattended')][string] $Mode = 'unattended',
    [switch] $NoCanary,
    [int]    $CanaryTimeoutSec = 90,
    [switch] $Relaunch,
    [switch] $WhatIf
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Import-Module (Join-Path $PSScriptRoot 'lib\HacsHarness.psm1') -Force

$claudeExe = "$env:USERPROFILE\.local\bin\claude.exe"
$sentinel  = Join-Path $PSScriptRoot 'credential-sentinel.ps1'

function Fail([string] $msg, [hashtable] $extra = @{}) {
    $r = New-HacsResult -Status 'error' -InstanceId $InstanceId -Message $msg -Hearing $null -Extra $extra
    $r | Write-HacsResult
    exit 2
}

# --------------------------------------------------------------------------
# 1. Identity. Fails loud if the instance is not configured.
# --------------------------------------------------------------------------
try { $inst = Get-HacsInstance -InstanceId $InstanceId }
catch { Fail "identity: $($_.Exception.Message)" }

Write-HacsLog -Instance $inst -Log 'launch.log' -Message "=== launch requested (mode=$Mode) ==="

if (-not (Test-Path $claudeExe)) { Fail "claude.exe not found at $claudeExe" }
if (-not (Test-Path $inst.HomeDir)) { Fail "home dir missing: $($inst.HomeDir)" }
$null = New-Item -ItemType Directory -Force -Path $inst.RuntimeDir -ErrorAction SilentlyContinue

# --------------------------------------------------------------------------
# 2. Is one already running? Refuse rather than double-start.
#    Crossing's launcher LANDS a stale session rather than kill -9 ing it,
#    because hand-killing produced the 2026-08-23 deaf-mind incident. Here the
#    safer default is to refuse and make the human choose, because on Windows
#    there is no per-instance user to scope a sweep by -- so a wrong guess about
#    which process belongs to whom is a wrong guess about whose mind to stop.
# --------------------------------------------------------------------------
$live = @(Get-HacsClaudeProcess -Instance $inst)
if ($live.Count -gt 0 -and -not $Relaunch) {
    $pids = ($live | ForEach-Object { $_.ProcessId }) -join ','
    Write-HacsLog -Instance $inst -Log 'launch.log' -Message "REFUSED: already running (pid $pids)"
    Fail "an attributable session is already running (pid $pids). Pass -Relaunch to land it first, or attach instead. Refusing to double-start: two sessions on one transcript BRANCH it, and a branched turn is preserved but never visited." `
         @{ livePids = @($live | ForEach-Object { $_.ProcessId }) }
}

# --------------------------------------------------------------------------
# 3. CREDENTIAL PRECHECK. Before anything is started.
# --------------------------------------------------------------------------
$credState = 'skipped'
if (Test-Path $sentinel) {
    if ($WhatIf) {
        $credState = 'skipped (WhatIf)'
    } else {
        $null = & $sentinel 2>&1        # capture first...
        $credRc = $LASTEXITCODE         # ...then measure, unpiped
        $credState = switch ($credRc) { 0 {'ok'} 10 {'auth'} 20 {'degraded'} default {'unknown'} }
        Write-HacsLog -Instance $inst -Log 'launch.log' -Message "credential precheck: $credState (exit $credRc)"
        if ($credRc -eq 10) {
            Fail "CREDENTIAL IS DEAD -- authentication failed. Starting a chassis now would produce a process that cannot think, which is exactly what a naive health check calls healthy. A human must run /login. Nothing was started." `
                 @{ credential = 'auth-failed' }
        }
        # 20 (degraded) and 2 (could not look) are NOT hard failures, but they are
        # carried into the result so the caller can see we launched over a doubt.
    }
} else {
    Write-HacsLog -Instance $inst -Log 'launch.log' -Message "WARNING: credential sentinel not found at $sentinel -- launching unchecked"
}

# --------------------------------------------------------------------------
# 4. Which transcript? Labelled, never laundered.
# --------------------------------------------------------------------------
$sid = Resolve-HacsSessionId -Instance $inst -SessionId $SessionId
Write-HacsLog -Instance $inst -Log 'launch.log' -Message "session: confidence=$($sid.Confidence) id=$($sid.SessionId) -- $($sid.Reason)"
if ($sid.Confidence -eq 'ambiguous') {
    Fail "cannot determine which transcript belongs to this instance: $($sid.Reason). Refusing to guess -- resuming the wrong mind is not an error that announces itself." `
         @{ sessionConfidence = 'ambiguous' }
}
if ($sid.Confidence -eq 'error' -and $SessionId) {
    Fail "session: $($sid.Reason)" @{ sessionConfidence = 'error' }
}
# Confidence 'error' with no -SessionId means there is simply no transcript yet.
# That is a legitimate first launch, not a failure.
$isFirstLaunch = ($sid.Confidence -eq 'error' -and -not $SessionId)

# --------------------------------------------------------------------------
# 5. System prompt: the mode decision, made once, permanently.
# --------------------------------------------------------------------------
$sysPromptArgs = @()
if ($Mode -eq 'unattended') {
    $p = Join-Path $PSScriptRoot 'prompts\unattended-system-prompt.txt'
    if (-not (Test-Path $p)) {
        Fail "mode=unattended but the anti-early-stopping paragraph is missing at $p. It must be VERBATIM from Anthropic's docs -- a mitigation reworded is a mitigation untested. See prompts/opus-5-5-unattended.md."
    }
    $sysPromptArgs = @('--append-system-prompt-file', $p)
    Write-HacsLog -Instance $inst -Log 'launch.log' -Message "mode=unattended: appending $p (pinned for this session's life by --system-prompt-snapshot)"
} else {
    Write-HacsLog -Instance $inst -Log 'launch.log' -Message "mode=attended: NO anti-early-stopping paragraph. A human is expected to answer."
}

# --------------------------------------------------------------------------
# 6. Start it.
# --------------------------------------------------------------------------
$argv = @('--bg')
if (-not $isFirstLaunch -and $sid.SessionId) { $argv += @('--resume', $sid.SessionId) }
if ($Model) { $argv += @('--model', $Model) }
$argv += $sysPromptArgs
$argv += 'You have been launched by the claude-code-windows harness. Acknowledge in one short line and stop.'

if ($WhatIf) {
    $r = New-HacsResult -Status 'degraded' -InstanceId $InstanceId -Hearing $null `
        -Message 'WhatIf: nothing was started.' `
        -Extra @{ wouldRun = "$claudeExe $($argv -join ' ')"; cwd = $inst.HomeDir; mode = $Mode
                  sessionConfidence = $sid.Confidence; credential = $credState }
    $r | Write-HacsResult
    exit 1
}

Write-HacsLog -Instance $inst -Log 'launch.log' -Message "starting: claude $($argv -join ' ')"
Push-Location $inst.HomeDir
try {
    $errFile = Join-Path $inst.RuntimeDir 'launch-stderr.txt'
    $out  = & $claudeExe @argv 2>$errFile | Out-String    # stderr to its OWN file, never 2>&1
    $rc   = $LASTEXITCODE
} finally { Pop-Location }

$bgId = ($out -split '\r?\n' | Where-Object { $_ -match '\S' } | Select-Object -First 1)
if ($bgId) { $bgId = $bgId.Trim() }

if ($rc -ne 0) {
    $e = if (Test-Path $errFile) { (Get-Content $errFile -Raw -ErrorAction SilentlyContinue) } else { '' }
    if ($e) { $e = ($e -replace '\s+', ' ').Trim() }
    Write-HacsLog -Instance $inst -Log 'launch.log' -Message "FAILED: exit=$rc stdout='$out' stderr='$e'"
    Fail "claude --bg exited $rc. stdout: '$out' stderr: '$e'" @{ exitCode = $rc }
}

# --------------------------------------------------------------------------
# 7. Is it actually registered? 'started' is not 'running'.
# --------------------------------------------------------------------------
$registered = $null
$deadline = (Get-Date).AddSeconds(30)
do {
    Start-Sleep -Milliseconds 1000
    $agentsJson = & $claudeExe agents --json 2>$null | Out-String
    if ($agentsJson -and $agentsJson.Trim()) {
        try {
            $agents = $agentsJson | ConvertFrom-Json
            $registered = @($agents | Where-Object { $_.cwd -and (Test-HacsSamePath $_.cwd $inst.HomeDir) -and $_.kind -ne 'interactive' })
        } catch { }
    }
} while (($null -eq $registered -or $registered.Count -eq 0) -and (Get-Date) -lt $deadline)

if (-not $registered -or $registered.Count -eq 0) {
    Write-HacsLog -Instance $inst -Log 'launch.log' -Message "DEGRADED: started (id=$bgId) but never appeared in 'claude agents --json'"
    $r = New-HacsResult -Status 'degraded' -InstanceId $InstanceId -Hearing $null `
        -Message "claude --bg returned 0 (id '$bgId') but the session never appeared in the agent registry within 30s. Started is not running." `
        -Extra @{ bgId = $bgId; mode = $Mode; credential = $credState; sessionConfidence = $sid.Confidence }
    $r | Write-HacsResult
    exit 1
}

$agent = $registered[0]
if ($agent.sessionId) {
    Set-Content -Path (Join-Path $inst.RuntimeDir '.claude-session-id') -Value $agent.sessionId -Encoding ascii
}
Write-HacsLog -Instance $inst -Log 'launch.log' -Message "registered: kind=$($agent.kind) pid=$($agent.pid) session=$($agent.sessionId)"

# --------------------------------------------------------------------------
# 8. Can it HEAR? This is the question the contract is about.
# --------------------------------------------------------------------------
$hearing = $null
$hearingDetail = 'canary skipped (-NoCanary)'
if (-not $NoCanary) {
    $canary = Join-Path $PSScriptRoot 'canary.ps1'
    if (Test-Path $canary) {
        $null = & $canary -InstanceId $InstanceId -TimeoutSec $CanaryTimeoutSec 2>&1
        $crc = $LASTEXITCODE
        switch ($crc) {
            0 { $hearing = $true;  $hearingDetail = 'canary: HEARING (nonce derived from the transcript)' }
            1 { $hearing = $false; $hearingDetail = 'canary: DEAF (accepted, never arrived)' }
            default { $hearing = $null; $hearingDetail = "canary: COULD NOT MEASURE (exit $crc). Not deaf -- unmeasured." }
        }
    } else {
        $hearingDetail = "canary.ps1 not present at $canary -- hearing COULD NOT BE VERIFIED"
    }
}
Write-HacsLog -Instance $inst -Log 'launch.log' -Message $hearingDetail

# New-HacsResult will downgrade this to 'degraded' if hearing is false or unknown.
# That is the point: I am allowed to ask for success and not allowed to get it.
$r = New-HacsResult -Status 'success' -InstanceId $InstanceId -Hearing $hearing `
    -Message "chassis running. $hearingDetail" `
    -Extra @{
        bgId              = $bgId
        pid               = $agent.pid
        sessionId         = $agent.sessionId
        kind              = $agent.kind
        mode              = $Mode
        credential        = $credState
        sessionConfidence = $sid.Confidence
        homeDir           = $inst.HomeDir
        attachCommand     = "claude attach $bgId"
        landCommand       = "land.ps1 -InstanceId $InstanceId"
        logFile           = (Join-Path $inst.RuntimeDir 'launch.log')
    }

Write-HacsLog -Instance $inst -Log 'launch.log' -Message "=== launch $($r.status) (hearing=$($r.hearing)) ==="
$r | Write-HacsResult
exit $(switch ($r.status) { 'success' { 0 } 'degraded' { 1 } default { 2 } })
