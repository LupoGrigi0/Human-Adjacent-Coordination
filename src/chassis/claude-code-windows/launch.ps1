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
    [int]    $RegistryTimeoutSec = 30
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
        -Extra @{ wouldRun = "$claudeExe $($argv -join ' ')"; cwd = $inst.HomeDir; mode = $effMode
                  sessionConfidence = $sid.Confidence; credential = $credState }
    $r | Write-HacsResult
    exit 1
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
$mm = [regex]::Match($out, '\b([0-9a-f]{8})\b')
if ($mm.Success) { $bgId = $mm.Groups[1].Value }

if ($n.ExitCode -ne 0) {
    Fail "claude --bg exited $($n.ExitCode). stdout: '$out' stderr: '$e'" @{ exitCode = $n.ExitCode }
}

# --------------------------------------------------------------------------
# 7. Is it actually registered? 'started' is not 'running'.
# --------------------------------------------------------------------------
$registered = @()
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
} while ($registered.Count -eq 0 -and (Get-Date) -lt $deadline)

if ($registered.Count -eq 0) {
    Write-HacsLog -Instance $inst -Log 'launch.log' -Message "DEGRADED: started (id=$bgId) but never appeared in 'claude agents --json'"
    $r = New-HacsResult -Status 'degraded' -InstanceId $InstanceId -Hearing $null `
        -Message "claude --bg returned 0 (id '$bgId') but the session never appeared in the agent registry within ${RegistryTimeoutSec}s. Started is not running." `
        -Extra @{ bgId = $bgId; mode = $effMode; credential = $credState; sessionConfidence = $sid.Confidence }
    $r | Write-HacsResult
    exit 1
}

# On a resume, prefer the row that IS the resumed session, if there is one.
$agent = $registered[0]
if ($isResume) {
    $same = @($registered | Where-Object { $_.sessionId -eq $sid.SessionId })
    if ($same.Count -gt 0) { $agent = $same[0] }
}
# Two witnesses: the id --bg printed, and the session the registry shows under this
# home. They must agree, or we may be describing somebody else's session.
$idAgrees = [bool]($bgId -and $agent.sessionId -and $agent.sessionId.StartsWith($bgId))
if (-not $idAgrees) {
    Write-HacsLog -Instance $inst -Log 'launch.log' -Message "WARNING: bg id '$bgId' does not prefix registry sessionId '$($agent.sessionId)'"
}
# A resume must CONTINUE the mind, not copy it. If the running session is not the
# one we resumed, it forked -- and a fork cannot be quietly undone, so say so.
$forked = [bool]($isResume -and $agent.sessionId -and $agent.sessionId -ne $sid.SessionId)
if ($forked) {
    Write-HacsLog -Instance $inst -Log 'launch.log' -Message "FORKED: resumed $($sid.SessionId) but the running session is $($agent.sessionId). claude said: $e"
    Set-Content -Path (Join-Path $inst.RuntimeDir '.forked-from') -Value $sid.SessionId -Encoding ascii
}
if (-not $isResume) {
    Set-Content -Path $birthFile -Value $Mode -Encoding ascii        # mode is fixed from here on
}
if ($agent.sessionId) {
    Set-Content -Path (Join-Path $inst.RuntimeDir '.claude-session-id') -Value $agent.sessionId -Encoding ascii
}
Write-HacsLog -Instance $inst -Log 'launch.log' -Message "registered: kind=$($agent.kind) pid=$($agent.pid) session=$($agent.sessionId)"

# --------------------------------------------------------------------------
# 8. Can it HEAR? This is the question the contract is about.
# --------------------------------------------------------------------------
#    NOT MEASURED HERE, and saying so. The first version called canary.ps1 with
#    no -Nonce -- written before the canary was redesigned to judge rather than
#    send -- so it returned "could not measure" every time and nobody would have
#    known why. The canary needs a SENDER, and launch does not hold a supported
#    one (the inbox socket's payload frame is undocumented; see
#    docs/INBOX-SOCKET-FINDINGS.md). So hearing is honestly unknown at launch,
#    New-HacsResult caps the status at 'degraded', and the caller proves hearing
#    with: canary.ps1 -Mark  ->  deliver the nonce  ->  canary.ps1 -Nonce -FromOffset
$hearing = $null
$hearingDetail = 'hearing NOT measured at launch (no supported sender is wired in). Prove it with canary.ps1 -Mark / deliver / -Nonce -FromOffset.'
Write-HacsLog -Instance $inst -Log 'launch.log' -Message $hearingDetail

# New-HacsResult will downgrade this to 'degraded' if hearing is false or unknown.
# That is the point: I am allowed to ask for success and not allowed to get it.
# Anything claude said on stderr beyond its startup chatter is worth surfacing:
# the fork warning above arrived ONLY there.
$claudeSaid = ($e -replace '^Starting background service\S*\s*', '').Trim()
$ask = if ($forked) { 'degraded' } else { 'success' }
$msg = if ($forked) { "FORKED: resumed $($sid.SessionId) but a COPY is running as $($agent.sessionId). The original transcript is untouched. $hearingDetail" }
       else { "chassis running. $hearingDetail" }
$r = New-HacsResult -Status $ask -InstanceId $InstanceId -Hearing $hearing `
    -Message $msg `
    -Extra @{
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
