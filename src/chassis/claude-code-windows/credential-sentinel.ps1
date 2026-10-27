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
    [string] $Claude,      # default: the first that exists of the candidates below
    [string] $Model        = 'haiku',
    # NOT '_credential-probe'. The model cited that directory name as evidence it
    # was being security-tested, and refused. A probe's own name should not be an
    # input to the thing it measures.
    [string] $ScratchDir   = 'D:\Lupo\hacs-runtime\_liveness-probe',
    [string] $LogPath      = 'D:\Lupo\hacs-runtime\credential-sentinel.log',
    [int]    $TimeoutSec   = 90,
    # Test affordances, after battery-watch.ps1: a monitor whose alarm path has
    # never executed is decoration.
    [ValidateSet('none', 'auth', 'degraded', 'unknown', 'refused')][string] $SimulateFailure = 'none',

    # WHO HEARS ABOUT IT. Added 2026-10-26, after this sentinel logged "a human must
    # run /login" ELEVEN times over three days (10-23..10-26) into a file nobody
    # reads, while the box sat in Modern Standby with an expired OAuth token. It was
    # right every time and told no one. Lupo chose Axiom and Bastion-3012.
    # The scheduled task passes no arguments, so the recipients are a default here
    # and a redeploy is the whole rollout. A credential is per BOX, not per mind.
    [string[]] $AlertTo       = @('Axiom', 'Bastion-3012'),
    [string]   $HacsPy        = 'D:\Lupo\Source\AI\instance-archaeology\src\hacs\hacs.py',
    [string]   $Python        = 'python',
    [string]   $StatePath,                 # default: beside -LogPath, so a test that redirects the log redirects this too
    [int]      $StreakToAlert = 3,         # degraded / unknown must repeat this many runs; auth alerts at once
    [int]      $RepeatHours   = 12,        # re-alert while it persists: a long absence must not go quiet
    [switch]   $NoAlert
)
# powershell -File binds `-AlertTo A,B` as ONE string (measured 2026-10-10). Split after binding.
$AlertTo = @($AlertTo | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim() } | Where-Object { $_ })
if (-not $StatePath) { $StatePath = [IO.Path]::ChangeExtension($LogPath, '.alert-state.json') }
# Captured HERE: inside a function, $PSBoundParameters is the function's own, not the script's.
$PSBoundParameters_HacsPy = $PSBoundParameters.ContainsKey('HacsPy')

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

function Send-SentinelAlert([string] $subject, [string] $body) {
    # Returns a short outcome string for the log. Never throws: an alert that fails
    # must not change the sentinel's verdict or its exit code.
    $outcomes = foreach ($to in $AlertTo) {
        try {
            $saved = $env:PYTHONIOENCODING; $env:PYTHONIOENCODING = 'utf-8'
            # Body as an ARGUMENT, not stdin: the scheduled task's stdin is not ours.
            $null = & $Python $HacsPy send $to $subject $body 2>$null
            $rc = $LASTEXITCODE
            $env:PYTHONIOENCODING = $saved
            if ($rc -eq 0) { "$to=sent" } else { "$to=FAILED(exit $rc)" }
        } catch { "$to=FAILED($($_.Exception.Message))" }
    }
    return ($outcomes -join ', ')
}

function Update-SentinelAlerting([string] $State, [string] $Detail) {
    # Not tested against the real hub: a SIMULATED failure never touches state or
    # sends, unless the caller supplied its own -HacsPy (a test's fake). That is the
    # SEVENTEEN mistake designed out: test runs must never be counted, or paged, as
    # real ones.
    if ($NoAlert) { return }
    if ($SimulateFailure -ne 'none' -and -not $PSBoundParameters_HacsPy) { return }
    if (-not $AlertTo) { return }

    $st = [ordered]@{ state = 'ok'; streak = 0; alerted = $null; alertedAt = $null }
    try {
        if (Test-Path $StatePath) {
            $j = Get-Content $StatePath -Raw | ConvertFrom-Json
            foreach ($k in @('state','streak','alerted','alertedAt')) { if ($j.PSObject.Properties.Name -contains $k) { $st[$k] = $j.$k } }
        }
    } catch { }    # unreadable state -> start fresh; worst case one duplicate alert

    $st.streak = if ($st.state -eq $State) { [int]$st.streak + 1 } else { 1 }
    $st.state  = $State
    $now = Get-Date
    $msg = $null

    if ($State -eq 'ok') {
        if ($st.alerted) {
            # Each element in its own parentheses: in PowerShell the COMMA binds tighter
            # than +, so `"a", "b" + "c"` is a 3-element array and `"a" + $x, "b"` is one
            # string. Both bit this function on its first test run.
            $msg = @(("credential-sentinel: $env:COMPUTERNAME RECOVERED"),
                     ("The Claude Code credential on $env:COMPUTERNAME works again (probe round-tripped at $($now.ToString('yyyy-MM-dd HH:mm'))). " +
                      "It had been '$($st.alerted)' since the alert at $($st.alertedAt). Nothing further needed."))
            $st.alerted = $null; $st.alertedAt = $null
        }
    } elseif ($State -in @('auth','degraded','unknown')) {
        $due = ($State -eq 'auth') -or ($st.streak -ge $StreakToAlert)
        $repeat = $st.alerted -eq $State -and $st.alertedAt -and (($now - [datetime]$st.alertedAt).TotalHours -ge $RepeatHours)
        if ($due -and ($st.alerted -ne $State -or $repeat)) {
            $what = switch ($State) {
                'auth'     { "the Claude Code LOGIN HAS EXPIRED. Every mind on this box (Lodestone; Claude Code instances on lupos-lap) cannot think until a HUMAN runs /login there. A scheduled wake cannot fix this." }
                'degraded' { "the credential probe has failed $($st.streak) runs in a row without a clean answer (rate limit, overload, or worse). Minds on this box may be unable to respond." }
                'unknown'  { "the credential sentinel itself has been unable to run its probe $($st.streak) times in a row. This is 'could not look', NOT a known-bad credential." }
            }
            $msg = @(("credential-sentinel: $env:COMPUTERNAME $State" + $(if ($repeat) { ' (still)' } else { '' })),
                     ("On ${env:COMPUTERNAME}: $what Detected $($now.ToString('yyyy-MM-dd HH:mm')) by the hourly credential sentinel " +
                      "(log: $LogPath). This repeats every $RepeatHours h while it persists, and a RECOVERED note follows the fix. " +
                      "Observed, not diagnosed. Last probe said: $($Detail.Substring(0, [Math]::Min(160, $Detail.Length)))"))
            $st.alerted = $State; $st.alertedAt = $now.ToString('o')
        }
    }
    # refused (30) never alerts: a refusal PROVES the credential and network are good.

    if ($msg) {
        $subject = [string]$msg[0]; $body = [string]$msg[1]
        $outcome = Send-SentinelAlert $subject $body
        Write-SentinelLog "alert    -> $outcome ($subject)"
    }
    try { $st | ConvertTo-Json | Set-Content -Path $StatePath -Encoding utf8 } catch { Write-SentinelLog "alert    state not saved: $($_.Exception.Message)" }
}

function Complete-Sentinel([string] $State, [int] $Code, [string] $Detail) {
    $result.state    = $State
    $result.exitCode = $Code
    $result.detail   = $Detail
    Write-SentinelLog ('{0,-8} exit={1} {2}' -f $State, $Code, $Detail)
    try { Update-SentinelAlerting $State $Detail } catch { Write-SentinelLog "alert    error (verdict unaffected) at line $($_.InvocationInfo.ScriptLineNumber): $($_.Exception.Message)" }
    $result | ConvertTo-Json -Depth 4
    exit $Code
}

# --- preconditions: these are UNKNOWN (2), never AUTH (10) ---------------------
if ($SimulateFailure -eq 'unknown') { Complete-Sentinel 'unknown' 2 'SIMULATED: precondition failure' }
if (-not $Claude) {
    # The same list as Get-HacsClaudeExeCandidate in lib\HacsHarness.psm1, kept
    # inline on purpose: the sentinel imports nothing, so it still runs when the
    # module is what broke. Native installer, then an npm install's NATIVE exe
    # (measured on greywolf, 2026-10-10). Never the npm .cmd/.ps1 shims.
    $cands = if ($env:HACS_TEST_CLAUDE_CANDIDATES) { @($env:HACS_TEST_CLAUDE_CANDIDATES -split ';' | Where-Object { $_ }) }
             else { @("$env:USERPROFILE\.local\bin\claude.exe", "$env:APPDATA\npm\node_modules\@anthropic-ai\claude-code\bin\claude.exe") }
    foreach ($c in $cands) { if (Test-Path -LiteralPath $c -PathType Leaf) { $Claude = $c; break } }
    if (-not $Claude) { Complete-Sentinel 'unknown' 2 "Claude Code not found (looked at: $($cands -join '; ')) -- could not look" }
}
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
