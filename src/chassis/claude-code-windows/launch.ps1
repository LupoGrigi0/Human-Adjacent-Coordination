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
    [switch] $Relaunch,
    [switch] $WhatIf,
    [string] $ClaudeExe = "$env:USERPROFILE\.local\bin\claude.exe",   # overridable so a test can point at a stub
    [int]    $RegistryTimeoutSec = 30,
    [switch] $SkipHearing,                                           # -> hearing 'not-attempted'
    [int]    $HearingTimeoutSec = 120,
    [string] $SenderModel = 'haiku',
    [string] $SenderDir = 'D:\Lupo\hacs-runtime\_liveness-probe',  # never a repo or a home
    [string] $RingName                                              # default: the registry's name for the mind
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# THE CONTRACT'S ONE PROMISE IS "ONE JSON OBJECT", AND IT IS NOW ENFORCED HERE.
# On 2026-09-27 launch died with NO JSON twice in one hour, from two unrelated
# causes (a native stderr line; a registry row with no 'pid' under StrictMode).
# Each was patched -- and patching the cause each time is exactly the "remember to
# be careful" that fails at 3am. This trap turns ANY unhandled exception into a
# well-formed 'error' result, so the promise no longer depends on every line.
trap {
    $why = "UNHANDLED: $($_.Exception.Message) (launch.ps1 line $($_.InvocationInfo.ScriptLineNumber))"
    try {
        $i = Get-Variable -Name inst -ValueOnly -ErrorAction SilentlyContinue
        if ($i) { Write-HacsLog -Instance $i -Log 'launch.log' -Message $why }
        (New-HacsResult -Status 'error' -InstanceId $InstanceId -Hearing $null -Message $why) | Write-HacsResult
    } catch {
        # The module itself may be what failed. Emit by hand, still valid JSON.
        [pscustomobject]@{ status = 'error'; instanceId = $InstanceId; hearing = 'unknown'; message = $why } | ConvertTo-Json -Compress
    }
    exit 2
}

Import-Module (Join-Path $PSScriptRoot 'lib\HacsHarness.psm1') -Force

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
$mustLand = $false
if ($live.Count -gt 0 -and -not $Relaunch) {
    $pids = ($live | ForEach-Object { $_.ProcessId }) -join ','
    Write-HacsLog -Instance $inst -Log 'launch.log' -Message "REFUSED: already running (pid $pids)"
    Fail "an attributable session is already running (pid $pids). Pass -Relaunch to land it first, or attach instead. Refusing to double-start: two sessions on one transcript BRANCH it, and a branched turn is preserved but never visited." `
         @{ livePids = @($live | ForEach-Object { $_.ProcessId }) }
}
# -Relaunch LANDS FIRST -- but only after every other check below has passed.
# Found by Forge on Linux, 2026-09-27, and worse here: this switch used to do NOTHING
# but skip the guard above, so following the refusal's own advice ("pass -Relaunch to
# land it first") would have started a second process on a live mind's transcript --
# the branch the guard exists to prevent. And a relaunch that is then REFUSED (a model
# on resume, a dead credential) must not already have landed the mind. So the land is
# deferred to the last moment before the start, after every refusal.
if ($live.Count -gt 0 -and $Relaunch) {
    $mustLand = $true
    Write-HacsLog -Instance $inst -Log 'launch.log' -Message "RELAUNCH requested over pid $(($live | ForEach-Object { $_.ProcessId }) -join ','): will land it after all checks pass"
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
# -SessionId must be the FULL lowercase UUID. Measured 2026-09-27: `--bg --resume
# <session name>` does not continue the session -- "started a copy of that
# conversation as 7d2e3aa3. To continue a session under its own id, pass its full
# session id (lowercase...)". A name here would fork the mind. Callers say the
# instance's NAME (-InstanceId) and the harness supplies the id from its records.
if ($SessionId) {
    if ($SessionId -notmatch '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$') {
        Fail "-SessionId '$SessionId' is not a full session UUID. Resuming by name or short id STARTS A COPY (Claude Code forks it). Omit -SessionId and launch will use the recorded id, or pass the full id from 'claude agents --json'." @{ wouldFork = $true }
    }
    $SessionId = $SessionId.ToLower()
}
$sid = Resolve-HacsSessionId -Instance $inst -SessionId $SessionId
Write-HacsLog -Instance $inst -Log 'launch.log' -Message "session: confidence=$($sid.Confidence) id=$($sid.SessionId) -- $($sid.Reason)"
if ($sid.Confidence -eq 'ambiguous') {
    Fail "cannot determine which transcript belongs to this instance: $($sid.Reason). Refusing to guess -- resuming the wrong mind is not an error that announces itself." `
         @{ sessionConfidence = 'ambiguous' }
}
if ($sid.Confidence -eq 'error' -and $SessionId) {
    Fail "session: $($sid.Reason)" @{ sessionConfidence = 'error' }
}
# A GUESS IS NEVER RESUMED (Forge, Linux, 2026-09-27: with nothing recorded, launch
# guessed the newest transcript -- a human's login session -- and planned to resume
# it AS the mind). A guess is fine for a canary to be told about; it is never fine to
# BECOME. Only an explicit or recorded id resumes.
if ($sid.Confidence -eq 'guess') {
    Fail "this home has transcripts, but none is RECORDED as this instance's session. Refusing to resume a guess ($($sid.Reason)) -- becoming the wrong mind is not an error that announces itself. Pass -SessionId <full uuid> once; launch records it from then on." `
         @{ sessionConfidence = 'guess'; guessedSession = $sid.SessionId }
}
# Confidence 'error' with no -SessionId means there is simply no transcript yet.
# That is a legitimate first launch, not a failure.
$isFirstLaunch = ($sid.Confidence -eq 'error' -and -not $SessionId)

# --------------------------------------------------------------------------
# 5. System prompt: the mode decision, made once, permanently.
# --------------------------------------------------------------------------
#
#    RESUME TAKES NO FLAGS. Measured 2026-09-27, and Claude Code said so itself, on
#    stderr: "background session 90fa2961 keeps its own saved options, so the flags
#    you passed started a copy as 5bc16afe. Without flags, the same command
#    continues 90fa2961 itself." A background session SAVES the options it was born
#    with. Relaunching it WITH any flag -- the prompt file, --model, --name --
#    FORKS it: a new session id carrying a copy of the whole conversation. Every
#    relaunch would have branched the mind, silently, and the recorded id would
#    have followed the copy. Mode really is baked in at birth: Claude Code enforces
#    it too. So flags are for birth only, and a resume that asks for a different
#    mode or a model is REFUSED rather than quietly forking.
$isResume  = [bool](-not $isFirstLaunch -and $sid.SessionId)
$birthFile = Join-Path $inst.RuntimeDir '.birth-mode'
$birthMode = if (Test-Path $birthFile) { (Get-Content $birthFile -Raw).Trim() } else { $null }

$sysPromptArgs = @()
$effMode = $Mode          # what this session actually IS; differs from $Mode on a resume
if ($isResume) {
    if ($Model) {
        Fail "-Model on a RESUME would fork the session (a background session keeps its birth options; flags start a copy). Nothing was started. Switch model inside the session, or launch a new session deliberately." @{ wouldFork = $true }
    }
    if ($PSBoundParameters.ContainsKey('Mode') -and $birthMode -and $Mode -ne $birthMode) {
        Fail "this session was born '$birthMode'; -Mode $Mode on a resume would fork it. Mode is baked in at birth. Nothing was started." @{ wouldFork = $true; birthMode = $birthMode }
    }
    # NOT assigned back to $Mode: its [ValidateSet] stays attached to the VARIABLE
    # for the whole script, so $Mode = 'unrecorded' throws. Found by the trap above,
    # on its first real outing, as a clean error JSON instead of a stack trace.
    $effMode = if ($birthMode) { $birthMode } else { 'unrecorded' }
    Write-HacsLog -Instance $inst -Log 'launch.log' -Message "RESUME: no flags (they would fork it). Birth mode: $effMode -- carried by the session's own saved options."
} elseif ($Mode -eq 'unattended') {
    $p = Join-Path $PSScriptRoot 'prompts\unattended-system-prompt.txt'
    if (-not (Test-Path $p)) {
        Fail "mode=unattended but the anti-early-stopping paragraph is missing at $p. It must be VERBATIM from Anthropic's docs -- a mitigation reworded is a mitigation untested. See prompts/opus-5-5-unattended.md."
    }
    $sysPromptArgs = @('--append-system-prompt-file', $p)
    Write-HacsLog -Instance $inst -Log 'launch.log' -Message "BIRTH mode=unattended: appending $p (pinned for this session's life)"
} else {
    Write-HacsLog -Instance $inst -Log 'launch.log' -Message "BIRTH mode=attended: NO anti-early-stopping paragraph. A human is expected to answer."
}

# --------------------------------------------------------------------------
# 6. Start it.
# --------------------------------------------------------------------------
$prompt = 'You have been launched by the claude-code-windows harness. Acknowledge in one short line and stop.'
if ($isResume) {
    $argv = @('--bg', '--resume', $sid.SessionId, $prompt)
} else {
    # --name: the display name is how other minds ADDRESS it (SendMessage,
    # ListAgents). Unset, it auto-titles from the first prompt, and every
    # harness-launched mind converged on "claude-code-windows harness launch" --
    # two fixtures, one address. The instance id is unique by construction.
    $argv = @('--bg', '--name', $InstanceId)
    if ($Model) { $argv += @('--model', $Model) }
    $argv += $sysPromptArgs
    $argv += $prompt
}

if ($WhatIf) {
    $r = New-HacsResult -Status 'degraded' -InstanceId $InstanceId -Hearing $null `
        -Message 'WhatIf: nothing was started.' `
        -Extra @{ wouldRun = "$claudeExe $($argv -join ' ')"; cwd = $inst.HomeDir; mode = $effMode; wouldLandFirst = $mustLand
                  sessionConfidence = $sid.Confidence; credential = $credState }
    $r | Write-HacsResult
    exit 1
}

# The -Relaunch land, deferred to here: every refusal is behind us. land snapshots
# first, stops cleanly, and never kills without -Force. Anything short of a clean
# 'success' aborts the relaunch -- nothing is started over a mind that may still run.
if ($mustLand) {
    $landRaw = & (Join-Path $PSScriptRoot 'land.ps1') -InstanceId $InstanceId 2>$null | Out-String
    $landed = $null; try { $landed = $landRaw | ConvertFrom-Json } catch { }
    $ls = if ($landed -and @($landed.PSObject.Properties.Name) -contains 'status') { $landed.status } else { '<no result>' }
    Write-HacsLog -Instance $inst -Log 'launch.log' -Message "relaunch: land returned '$ls'"
    $still = @(Get-HacsClaudeProcess -Instance $inst)
    if ($ls -ne 'success' -or $still.Count -gt 0) {
        Fail "relaunch ABORTED: land returned '$ls' and $($still.Count) attributable process(es) remain. Nothing was started -- the mind may still be running. See land.log." `
             @{ landResult = $landed; stillRunning = @($still | ForEach-Object { $_.ProcessId }) }
    }
}

Write-HacsLog -Instance $inst -Log 'launch.log' -Message "starting: claude $($argv -join ' ')"
# NOT `& $ClaudeExe @argv 2>$file`. That was the first version, and on its first
# real run (2026-09-27) `--bg` wrote "Starting background service..." to stderr,
# PS 5.1 under ErrorActionPreference=Stop turned that line into a thrown
# NativeCommandError, and launch died with NO JSON. See Invoke-HacsNative.
$n = Invoke-HacsNative -FilePath $ClaudeExe -Arguments $argv -WorkingDirectory $inst.HomeDir -TimeoutSec 120
$out = $n.StdOut
$e   = ($n.StdErr -replace '\s+', ' ').Trim()
Set-Content -Path (Join-Path $inst.RuntimeDir 'launch-stderr.txt') -Value $n.StdErr -Encoding utf8
Write-HacsLog -Instance $inst -Log 'launch.log' -Message "claude --bg returned: exit=$($n.ExitCode) timedOut=$($n.TimedOut) stdout='$(($out -replace '\s+',' ').Trim())' stderr='$e'"

if ($n.TimedOut) {
    Fail "claude --bg did not return within 120s. It is documented to 'return immediately'. Something is holding it -- check launch.log and ~/.claude/daemon.log." @{ timedOut = $true }
}

# The real stdout (2.1.283) is a banner, not a bare id:
#   "backgrounded · 90fa2961 / claude agents list sessions / claude attach 90fa2961 ..."
# The first version took the first line whole and produced `claude attach
# backgrounded · 90fa2961`. My stub printed a clean id, so the test passed against
# the case I imagined. Take the first 8-hex token instead; step 7 cross-checks it
# against the registry's sessionId, which is a second, independent source.
$bgId = $null
# Strip ANSI colour codes first. Measured 2026-09-27: the banner sometimes arrives as
# "backgrounded · ESC[36m241b4264ESC[39m" -- the 'm' glued to the id kills the word
# boundary, and the first occurrence is missed. It only still worked because the id
# appears again later in the banner. Working by luck is not working.
$plain = $out -replace "$([char]27)\[[0-9;]*m", ''
$mm = [regex]::Match($plain, '\b([0-9a-f]{8})\b')
if ($mm.Success) { $bgId = $mm.Groups[1].Value }

if ($n.ExitCode -ne 0) {
    # Measured 2026-09-27 (Forge on Linux, then here): --bg REFUSES an untrusted
    # workspace, exit 1, nothing started. The fixtures only ever worked because their
    # parent directory was trusted. Say what to do, not just what happened.
    if ($e -match 'Workspace not trusted') {
        Fail "the home directory is not a TRUSTED workspace, and claude --bg refuses to start in one (nothing was started). Trust it ONCE, at provisioning, never at launch: run 'claude' interactively in $($inst.HomeDir) (or a parent) and accept the prompt. claude said: '$e'" @{ exitCode = $n.ExitCode; untrustedWorkspace = $true }
    }
    Fail "claude --bg exited $($n.ExitCode). stdout: '$out' stderr: '$e'" @{ exitCode = $n.ExitCode }
}

# --------------------------------------------------------------------------
# 7. Is it actually registered? 'started' is not 'running'.
# --------------------------------------------------------------------------
$registered = @()
$matching = @()
$deadline = (Get-Date).AddSeconds($RegistryTimeoutSec)
do {
    Start-Sleep -Milliseconds 1000
    # A row can appear BEFORE it has a pid (shaped like a finished row: id/state,
    # no pid/status). Measured 2026-09-27 under a concurrent launch. Registered is
    # not running: keep polling until there is a process to point at.
    $registered = @(Get-HacsAgentRegistry -ClaudeExe $ClaudeExe | Where-Object {
        $nm = @($_.PSObject.Properties.Name)
        ($nm -contains 'cwd') -and ($nm -contains 'pid') -and $_.pid -and
        ($nm -contains 'kind') -and $_.kind -ne 'interactive' -and (Test-HacsSamePath $_.cwd $inst.HomeDir) })
    # AND keep polling until a row carries the session --bg itself named. Measured
    # 2026-09-27 on a resume of 3266: 2 s after start the registry showed session
    # 5dace46a -- an id with no transcript and no history row -- while --bg printed
    # 5bc16afe, stderr said "woke session 5bc16afe", and 5bc16afe.jsonl kept growing.
    # A freshly woken process shows a TRANSIENT id before it adopts the resumed one.
    # The first version believed the registry over three other witnesses, reported
    # FORKED, and recorded the phantom id. Forge hit the same race at birth on Linux.
    if ($bgId) { $matching = @($registered | Where-Object { $_.sessionId -and ([string]$_.sessionId).StartsWith($bgId) }) }
} while (($registered.Count -eq 0 -or ($bgId -and $matching.Count -eq 0)) -and (Get-Date) -lt $deadline)

if ($registered.Count -eq 0) {
    Write-HacsLog -Instance $inst -Log 'launch.log' -Message "DEGRADED: started (id=$bgId) but never appeared in 'claude agents --json'"
    $r = New-HacsResult -Status 'degraded' -InstanceId $InstanceId -Hearing $null `
        -Message "claude --bg returned 0 (id '$bgId') but the session never appeared in the agent registry within ${RegistryTimeoutSec}s. Started is not running." `
        -Extra @{ bgId = $bgId; mode = $effMode; credential = $credState; sessionConfidence = $sid.Confidence }
    $r | Write-HacsResult
    exit 1
}

# The row that IS the session --bg named; the registry is corroboration, not the judge.
$agent = if ($matching.Count -gt 0) { $matching[0] } else { $registered[0] }
$idAgrees = [bool]($bgId -and $agent.sessionId -and ([string]$agent.sessionId).StartsWith($bgId))
if (-not $idAgrees) {
    Write-HacsLog -Instance $inst -Log 'launch.log' -Message "WARNING: bg id '$bgId' never appeared in the registry within ${RegistryTimeoutSec}s; it shows '$($agent.sessionId)' instead"
}
# A resume must CONTINUE the mind, not copy it. The authoritative witness is --bg
# ITSELF: the job id it printed, and its own words ("started a copy as ..." vs "woke
# session ..."). A registry mismatch alone is a transient, never a fork.
$copyNote = [bool]($e -match 'started a copy')
$forked = [bool]($isResume -and (($bgId -and -not $sid.SessionId.StartsWith($bgId)) -or $copyNote))
if ($forked) {
    Write-HacsLog -Instance $inst -Log 'launch.log' -Message "FORKED: resumed $($sid.SessionId) but --bg started $bgId. claude said: $e"
    Set-Content -Path (Join-Path $inst.RuntimeDir '.forked-from') -Value $sid.SessionId -Encoding ascii
}
if (-not $isResume) {
    Set-Content -Path $birthFile -Value $Mode -Encoding ascii        # mode is fixed from here on
}
# NEVER RECORD AN ID WITHOUT A TRANSCRIPT BEHIND IT. The phantom 5dace46a was recorded
# and poisoned 3266's record. Only an id whose .jsonl exists (waiting briefly -- a
# brand-new birth writes its file within seconds) is allowed to become the record.
$recordId = if ($idAgrees) { [string]$agent.sessionId } else { $null }
if ($recordId) {
    $tFile = Join-Path $inst.ProjectDir "$recordId.jsonl"
    $until = (Get-Date).AddSeconds(15)
    while (-not (Test-Path $tFile) -and (Get-Date) -lt $until) { Start-Sleep -Milliseconds 500 }
    if (Test-Path $tFile) {
        Set-Content -Path (Join-Path $inst.RuntimeDir '.claude-session-id') -Value $recordId -Encoding ascii
    } else {
        Write-HacsLog -Instance $inst -Log 'launch.log' -Message "NOT recording ${recordId} -- no transcript at $tFile. The previous record stands."
    }
} else {
    Write-HacsLog -Instance $inst -Log 'launch.log' -Message "NOT recording a session id: --bg's id and the registry never agreed. The previous record stands."
}
Write-HacsLog -Instance $inst -Log 'launch.log' -Message "registered: kind=$($agent.kind) pid=$($agent.pid) session=$($agent.sessionId)"

# --------------------------------------------------------------------------
# 8. Can it HEAR? This is the question the contract is about.
# --------------------------------------------------------------------------
#    MEASURED BY DEFAULT (Forge's review, 2026-09-27). The previous version never
#    measured, so launch could NEVER return success -- a guard that always fires,
#    which teaches people that "degraded" means "normal", and then the day it means
#    "deaf" nobody looks. Now: mark the transcript, ring the mind's own doorbell
#    through the supported sender, and judge from the transcript.
#
#    The sender is a one-shot `claude -p` that calls SendMessage, addressed to the
#    mind's registry name. That costs a model call, a live credential and ~10-30 s.
#    It is the price until native channels make a doorbell free (Forge's Q1). It runs
#    in the sentinel's scratch dir so it never plants a transcript in a repo or a home.
#
#    -SkipHearing opts out and yields hearing 'not-attempted' -- distinct from
#    'unknown', so "did not try" can never read like "could not tell".
$hearing = $null
$notAttempted = $false
$hearingEvidence = $null
$ringName = if ($RingName) { $RingName }
            elseif ($agent.PSObject.Properties.Name -contains 'name' -and $agent.name) { [string]$agent.name }
            else { $InstanceId }
if ($SkipHearing) {
    $notAttempted = $true
    $hearingDetail = 'hearing NOT ATTEMPTED (-SkipHearing). Prove it with canary.ps1 -Mark / deliver / -Nonce -FromOffset.'
} else {
    $canary = Join-Path $PSScriptRoot 'canary.ps1'
    $markRaw = & $canary -InstanceId $InstanceId -Mark 2>$null | Out-String
    $mark = $null; try { $mark = $markRaw | ConvertFrom-Json } catch { }
    if (-not $mark -or @($mark.PSObject.Properties.Name) -notcontains 'nonce') {
        $why = if ($mark -and @($mark.PSObject.Properties.Name) -contains 'detail') { $mark.detail } else { ($markRaw -replace '\s+', ' ').Trim() }
        $hearingDetail = "hearing COULD NOT BE MEASURED: canary could not mark ($why)"
    } else {
        $null = New-Item -ItemType Directory -Force -Path $SenderDir -ErrorAction SilentlyContinue
        $ask2 = "Use the SendMessage tool to send this exact text to the session named '$ringName': Harness hearing check at launch. Please reply in one short line containing this word exactly: $($mark.nonce)"
        Write-HacsLog -Instance $inst -Log 'launch.log' -Message "ringing '$ringName' via claude -p (model $SenderModel) from $SenderDir; mark offset=$($mark.offset)"
        $snd = Invoke-HacsNative -FilePath $ClaudeExe -Arguments @('--print', '--model', $SenderModel, $ask2) -WorkingDirectory $SenderDir -TimeoutSec 180
        Write-HacsLog -Instance $inst -Log 'launch.log' -Message "sender: exit=$($snd.ExitCode) timedOut=$($snd.TimedOut) said='$(($snd.StdOut -replace '\s+',' ').Trim())'"
        if ($snd.TimedOut -or $snd.ExitCode -ne 0) {
            $hearingDetail = "hearing COULD NOT BE MEASURED: the sender failed (exit $($snd.ExitCode), timedOut $($snd.TimedOut)). That is a fault in the ringer, not evidence about the mind."
        } else {
            $judgeRaw = & $canary -InstanceId $InstanceId -Nonce $mark.nonce -FromOffset $mark.offset -TimeoutSec $HearingTimeoutSec 2>$null | Out-String
            $judge = $null; try { $judge = $judgeRaw | ConvertFrom-Json } catch { }
            $verdict = if ($judge -and @($judge.PSObject.Properties.Name) -contains 'verdict') { $judge.verdict } else { 'ERROR' }
            if ($judge -and @($judge.PSObject.Properties.Name) -contains 'evidence') { $hearingEvidence = $judge.evidence }
            switch ($verdict) {
                'HEARING' { $hearing = $true;  $hearingDetail = "HEARING, proven at launch ($hearingEvidence): its own doorbell was rung and the nonce reached it." }
                'DEAF'    {
                    # A real doorbell ALWAYS leaves an enqueue in the target's own
                    # transcript. No sighting at all means the RINGER never delivered --
                    # declined the nonce as a "tracking probe" (Forge measured haiku doing
                    # this), misaddressed it, or failed. Blaming the mind for the ringer
                    # would be a confident wrong DEAF. Only accepted-but-never-delivered
                    # is evidence of deafness.
                    # @( if ... ) -- NOT `if ... { @() }`: assigning from an if-expression
                    # unrolls its output, so an empty @() arrives as $null and .Count
                    # throws under StrictMode. The empty case is exactly the misaddressed-
                    # ringer case; the first version crashed on the one path it was for.
                    $seen = @(if ($judge -and @($judge.PSObject.Properties.Name) -contains 'nonceSightings') { $judge.nonceSightings })
                    if ($seen.Count -eq 0) {
                        $hearing = $null
                        $hearingDetail = "hearing COULD NOT BE MEASURED: the doorbell never reached the mind's queue (no enqueue in its transcript), so the RINGER did not deliver -- declined, misaddressed ('$ringName'), or failed. That is not evidence the mind is deaf."
                    } else {
                        $hearing = $false
                        $hearingDetail = "DEAF at launch: the doorbell reached the mind's queue ($($seen -join '; ')) but the nonce never reached its context. $($judge.detail)"
                    }
                }
                default   { $hearingDetail = "hearing COULD NOT BE MEASURED: the canary could not judge. $(if ($judge) { $judge.detail })" }
            }
        }
    }
}
Write-HacsLog -Instance $inst -Log 'launch.log' -Message $hearingDetail

# New-HacsResult will downgrade this to 'degraded' if hearing is false or unknown.
# That is the point: I am allowed to ask for success and not allowed to get it.
# Anything claude said on stderr beyond its startup chatter is worth surfacing:
# the fork warning above arrived ONLY there.
$claudeSaid = ($e -replace '^Starting background service\S*\s*', '').Trim()
$ask = if ($forked) { 'degraded' } else { 'success' }
$msg = if ($forked) { "FORKED: resumed $($sid.SessionId) but a COPY is running as $($agent.sessionId). The original transcript is untouched. $hearingDetail" }
       else { "chassis running. $hearingDetail" }
$r = New-HacsResult -Status $ask -InstanceId $InstanceId -Hearing $hearing -HearingNotAttempted:$notAttempted `
    -Message $msg `
    -Extra @{
        hearingEvidence   = $hearingEvidence
        ringName          = $ringName
        resumed           = $isResume
        forked            = $forked
        claudeSaid        = $claudeSaid
        bgId              = $bgId
        bgIdMatchesRegistry = $idAgrees
        pid               = $agent.pid
        sessionId         = $agent.sessionId
        kind              = $agent.kind
        mode              = $effMode
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
