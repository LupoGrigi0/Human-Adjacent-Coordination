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
    30  REFUSED   the model answered and DECLINED the probe. This PROVES the
                  credential, the network and model dispatch are all fine -- it is
                  the opposite of an auth failure, and conflating the two is what
                  produced 8 false alarms in 26 scheduled runs over the first 24h.
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
    # NOT '_credential-probe'. The model cited that directory name as evidence it
    # was being security-tested, and refused. A probe's own name should not be an
    # input to the thing it measures.
    [string] $ScratchDir   = 'D:\Lupo\hacs-runtime\_liveness-probe',
    [string] $LogPath      = 'D:\Lupo\hacs-runtime\credential-sentinel.log',
    [int]    $TimeoutSec   = 90,
    # Test affordances, after battery-watch.ps1: a monitor whose alarm path has
    # never executed is decoration.
    [ValidateSet('none', 'auth', 'degraded', 'unknown', 'refused')][string] $SimulateFailure = 'none'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# THE NONCE MUST NOT LOOK LIKE A CREDENTIAL.
# The first version was 'cred-<unixtime>-<random>'. Over 24 hours of real running,
# Haiku REFUSED to echo it in 8 of 26 SCHEDULED runs -- a 31% false-alarm rate,
# non-deterministically, on identical input -- saying it looked like a credential token and that the working
# directory name ('_credential-probe') suggested a security test. Its refusal prose
# contained the word "credential", which the classifier below then matched as an
# AUTHENTICATION FAILURE. So a healthy credential raised a 3am alarm telling a
# human to run /login, eight times overnight.
#
# (I first reported this as SEVENTEEN. That count included my own 13 deliberate
# -SimulateFailure auth runs, which are in the same log. The instrument appearing
# in its own reading -- in the count OF the bug about the instrument appearing in
# its own reading. Corrected by filtering to the :15 scheduled fires.)
#
# VERIFIED_WAKE_PATTERN.md says "unique token per invocation" and it is right, but
# it did not anticipate that a TOKEN-SHAPED token is a request a model is trained
# to refuse. So the nonce is now three ordinary words and a number: still unique
# per invocation, still impossible to satisfy from stale context, and obviously
# not a secret.
$w1 = @('copper','quiet','amber','narrow','hollow','bright','distant','level','patient','dry')
$w2 = @('lantern','harbour','ledger','compass','anvil','beacon','thicket','granite','meadow','shutter')
$nonce = '{0}-{1}-{2}' -f (Get-Random -InputObject $w1), (Get-Random -InputObject $w2), (Get-Random -Minimum 1000 -Maximum 9999)
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
$outFile = Join-Path $ScratchDir 'probe.out'      # last result, best-effort record only
# stderr file is PER INVOCATION. Measured 2026-09-27: two launches ran this sentinel
# at the same instant, both opened the one fixed probe.err, and one lost the lock ->
# "probe could not be launched" -> UNKNOWN. Harmless in direction (unknown is never
# auth), but a fixed scratch path is a single-tenant assumption in a multi-tenant box.
$errFile = Join-Path $ScratchDir ('probe-{0}.err' -f [guid]::NewGuid().ToString('N').Substring(0, 12))

$t0 = Get-Date
try {
    if ($SimulateFailure -eq 'auth') {
        $out = 'Failed to authenticate: OAuth session expired and could not be refreshed'
        $code = 1
    } elseif ($SimulateFailure -eq 'degraded') {
        $out = 'Some unrelated answer with no nonce in it.'
        $code = 0
    } elseif ($SimulateFailure -eq 'refused') {
        # The exact false-positive that ran for 24 hours: a REFUSAL whose prose
        # mentions credentials. This must NOT classify as auth.
        $out = "I can't output that string. It appears to be a credential token, and the request pattern suggests a security test."
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
if (Test-Path $errFile) {
    $errText = (Get-Content $errFile -Raw -ErrorAction SilentlyContinue)
    Remove-Item $errFile -Force -ErrorAction SilentlyContinue      # per-invocation; do not let them accumulate
}
if ($errText) { $errText = ($errText -replace '\s+', ' ').Trim() }

try { Set-Content -Path $outFile -Value $text -Encoding utf8 } catch { }

# --- classify. Order matters: auth before generic failure. ---------------------
# Two independent signals for auth, because a vendor string is not a contract and
# will change without notice. The exit code alone cannot distinguish auth from any
# other failure, and the string alone will rot.
# ORDER MATTERS, and getting it wrong is what produced the false alarms. The old
# code tested the string pattern FIRST and unconditionally, so an exit-0 success
# whose prose happened to mention credentials was reported as an auth failure.
#
# A real auth failure is not subtle: the process EXITS NON-ZERO. So the exit code
# is the gate and the string only refines it. And the pattern is narrowed to
# phrases the CLI itself emits, not words a model might use while declining --
# 'credential' alone was matching the model's own refusal.
$authPattern = 'Failed to authenticate|OAuth session expired|Please run /login|401 Unauthorized|Invalid API key'
$refusalPattern = "I can't|I cannot|I won't|I'm not able to|raises security concerns|prompt injection"

if ($code -ne 0 -and (($text -match $authPattern) -or ($errText -match $authPattern))) {
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
if ($text -notmatch [regex]::Escape($nonce) -and $text -match $refusalPattern) {
    # The model answered and DECLINED. That proves the credential, the network and
    # the whole stack are fine -- it is the opposite of an auth failure. It is its
    # own state, exit 30, so it can never again be mistaken for one.
    Complete-Sentinel 'refused' 30 ("the model REFUSED the probe rather than failing it. Credential, network and " +
        "model dispatch are all PROVEN GOOD by this. The probe itself needs rewording. said: " +
        $text.Substring(0, [Math]::Min(200, $text.Length)))
}
if ($text -notmatch [regex]::Escape($nonce)) {
    Complete-Sentinel 'degraded' 20 ("exit=0 and output looked fine, but the nonce did NOT round-trip. " +
        "This is the plausible false pass: a reply that is fluent, on-topic and not an answer to what was asked. got: '" +
        $text.Substring(0, [Math]::Min(200, $text.Length)) + "'")
}

Complete-Sentinel 'ok' 0 "credential valid; nonce round-tripped in $($result.elapsedSec)s on model '$Model'"
