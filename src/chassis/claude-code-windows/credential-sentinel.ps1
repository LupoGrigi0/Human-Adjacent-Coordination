<#
.SYNOPSIS
  Is this machine's Anthropic credential still able to get a completion?

.DESCRIPTION
  THE GAP THIS FILLS
  ------------------
  2026-08-09, smoothcurves: Anthropic OAuth expired. Every Claude-substrate mind
  went dark. Every port still answered {"ok":true}. Naive monitoring reported a
  healthy fleet while nobody could think. (Bastion, family-watchdog README.)

  2026-09-24, lupos-lap: the same thing, on a different machine, six weeks later.
  Two scheduled wakes died with "Failed to authenticate: OAuth session expired and
  could not be refreshed" -- on STDOUT, while the log recorded only "exit=1,
  stderr: (empty)". Nothing noticed. A human had to run /login.

  family-watchdog has openrouter-check.sh -- a direct, cheap sentinel for the
  OpenRouter key. There is NO equivalent for the Anthropic credential, which is
  the one that has now failed twice. This is that file.

  WHY A MODEL CALL, WHEN THE WATCHDOG RULE SAYS NO LLM
  ---------------------------------------------------
  Bastion's rule is that no LLM may be in the ALERT path -- an alerter a model
  outage can silence is theater. That rule is kept: this script only sets an exit
  code and writes a log line. Alerting is somebody else's job, in pure shell.

  The PROBE is different. There is no way to prove a credential can get a
  completion except by getting one. Reading the token to check its expiry is the
  alternative, and it is forbidden here: credentials are never read into context,
  never printed, never logged. So the probe spends about a tenth of a cent on the
  cheapest model and proves the whole chain -- network, OAuth refresh, Anthropic's
  stack, model dispatch, response routing -- end to end.

  WHY IT COSTS A MIND NOTHING
  ---------------------------
  It runs in a dedicated scratch directory with no --resume, so it creates its own
  throwaway transcript in its own project slug and never touches any instance's
  context. An idle mind must never fill up with "are you ok?" / "yup".

  WHY A NONCE
  -----------
  Exit 0 is not success and non-empty output is not success. A per-invocation
  token, required at the END of the reply, is the only evidence the request
  actually round-tripped. (VERIFIED_WAKE_PATTERN.md -- written after a wake ran
  "successfully" while answering from stale context.)

.OUTPUTS
  One JSON object on stdout. Graded exit codes, because the caller must be able to
  tell these apart WITHOUT parsing prose:

     0  OK        credential valid, model answered, nonce round-tripped
    10  AUTH      authentication failed -- THIS is the 08-09 / 09-24 signature
    20  DEGRADED  reached something, but no valid answer (rate limit, overload,
                  wrong model, truncated reply)
     2  UNKNOWN   could not run the probe at all -- binary missing, no scratch dir.
                  "I could not look" is NOT "the credential is bad", and collapsing
                  the two is the single most common failure in this codebase.

.EXAMPLE
  .\credential-sentinel.ps1
  .\credential-sentinel.ps1 -SimulateFailure auth    # prove the alarm path works

.NOTES
  Author: Lodestone <lodestone@smoothcurves.nexus>
  Collaborator: Lupo
#>

[CmdletBinding()]
param(
    [string] $Claude       = "$env:USERPROFILE\.local\bin\claude.exe",
    [string] $Model        = 'haiku',
    [string] $ScratchDir   = 'D:\Lupo\hacs-runtime\_credential-probe',
    [string] $LogPath      = 'D:\Lupo\hacs-runtime\credential-sentinel.log',
    [int]    $TimeoutSec   = 90,
    # Test affordances, after battery-watch.ps1: a monitor whose alarm path has
    # never executed is decoration.
    [ValidateSet('none', 'auth', 'degraded', 'unknown')][string] $SimulateFailure = 'none'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$nonce  = 'cred-{0}-{1}' -f ([DateTimeOffset]::Now.ToUnixTimeSeconds()), (Get-Random -Maximum 999999)
$result = [ordered]@{
    check      = 'anthropic-credential'
    at         = (Get-Date).ToString('o')
    machine    = $env:COMPUTERNAME
    model      = $Model
    nonce      = $nonce
    state      = 'unknown'
    exitCode   = 2
    elapsedSec = 0
    detail     = ''
}

function Write-SentinelLog([string] $msg) {
    try {
        $dir = Split-Path -Parent $LogPath
        if ($dir -and -not (Test-Path $dir)) { $null = New-Item -ItemType Directory -Force -Path $dir }
        Add-Content -Path $LogPath -Value ('{0}  {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg) -Encoding utf8
    } catch { }   # logging must never be the thing that fails the check
}

function Complete-Sentinel([string] $State, [int] $Code, [string] $Detail) {
    $result.state    = $State
    $result.exitCode = $Code
    $result.detail   = $Detail
    Write-SentinelLog ('{0,-8} exit={1} {2}' -f $State, $Code, $Detail)
    $result | ConvertTo-Json -Depth 4
    exit $Code
}

# --- preconditions: these are UNKNOWN (2), never AUTH (10) ---------------------
if ($SimulateFailure -eq 'unknown') { Complete-Sentinel 'unknown' 2 'SIMULATED: precondition failure' }
if (-not (Test-Path $Claude))       { Complete-Sentinel 'unknown' 2 "claude.exe not found at $Claude -- could not look" }
try { if (-not (Test-Path $ScratchDir)) { $null = New-Item -ItemType Directory -Force -Path $ScratchDir } }
catch { Complete-Sentinel 'unknown' 2 "cannot create scratch dir ${ScratchDir}: $($_.Exception.Message)" }

# --- the probe -----------------------------------------------------------------
# Deliberately NO --resume: this must never join, branch, or read any mind's
# transcript. The prompt is ONE argument; splitting it on spaces is the bug that
# produced the original false pass.
$prompt = "Reply with exactly this and nothing else: $nonce"
$outFile = Join-Path $ScratchDir 'probe.out'
$errFile = Join-Path $ScratchDir 'probe.err'

$t0 = Get-Date
try {
    if ($SimulateFailure -eq 'auth') {
        $out = 'Failed to authenticate: OAuth session expired and could not be refreshed'
        $code = 1
    } elseif ($SimulateFailure -eq 'degraded') {
        $out = 'I am afraid I cannot do that right now.'
        $code = 0
    } else {
        Push-Location $ScratchDir
        try {
            # stderr to its OWN file -- never 2>&1. Merging streams is how a Python
            # install banner ended up inside a captured value on the success path.
            # And capture-then-measure: a masking pipe has manufactured both a false
            # pass and a false failure in this codebase.
            $out  = & $Claude --print --model $Model $prompt 2>$errFile | Out-String
            $code = $LASTEXITCODE
        } finally { Pop-Location }
    }
} catch {
    Complete-Sentinel 'unknown' 2 "probe could not be launched: $($_.Exception.Message)"
}
$result.elapsedSec = [int]((Get-Date) - $t0).TotalSeconds

$text = if ($out) { ([string]$out).Trim() } else { '' }
$errText = ''
if (Test-Path $errFile) { $errText = (Get-Content $errFile -Raw -ErrorAction SilentlyContinue) }
if ($errText) { $errText = ($errText -replace '\s+', ' ').Trim() }

try { Set-Content -Path $outFile -Value $text -Encoding utf8 } catch { }

# --- classify. Order matters: auth before generic failure. ---------------------
# Two independent signals for auth, because a vendor string is not a contract and
# will change without notice. The exit code alone cannot distinguish auth from any
# other failure, and the string alone will rot.
$authPattern = 'authenticat|OAuth|/login|credential|401|unauthoriz'
$looksAuth   = ($text -match $authPattern) -or ($errText -match $authPattern)

if ($looksAuth) {
    Complete-Sentinel 'auth' 10 ("AUTHENTICATION FAILED -- a scheduled wake cannot fix this; a human must run /login. said: " +
        $(if ($text) { $text.Substring(0, [Math]::Min(200, $text.Length)) } else { $errText }))
}
if ($code -ne 0) {
    Complete-Sentinel 'degraded' 20 ("exit=$code. stdout: '" +
        $(if ($text) { $text.Substring(0, [Math]::Min(200, $text.Length)) } else { '(empty)' }) +
        "' stderr: '" + $(if ($errText) { $errText.Substring(0, [Math]::Min(200, $errText.Length)) } else { '(empty)' }) + "'")
}
if (-not $text) {
    Complete-Sentinel 'degraded' 20 'exit=0 with NO OUTPUT. An empty success is not a success.'
}
if ($text -notmatch [regex]::Escape($nonce)) {
    Complete-Sentinel 'degraded' 20 ("exit=0 and output looked fine, but the nonce did NOT round-trip. " +
        "This is the plausible false pass: a reply that is fluent, on-topic and not an answer to what was asked. got: '" +
        $text.Substring(0, [Math]::Min(200, $text.Length)) + "'")
}

Complete-Sentinel 'ok' 0 "credential valid; nonce round-tripped in $($result.elapsedSec)s on model '$Model'"
