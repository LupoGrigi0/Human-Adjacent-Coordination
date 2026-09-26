<#
.SYNOPSIS
  Regression suite for the claude-code-windows chassis. Run it after every change.

.DESCRIPTION
  Every assertion here exists because something was wrong. Several exist because a
  PREVIOUS VERSION OF THIS FILE was wrong, which is its own lesson.

  THE HAZARD THIS SUITE KEEPS HITTING
  -----------------------------------
  A test harness can fail open AND fail closed. On 2026-09-25, writing these, my
  assertions manufactured three FALSE FAILURES in one evening:

    1. Exit-code control built with nested backtick-quotes through cscript ->
       the quoting broke, the shim looked broken, the shim was fine.
    2. `(... | Where-Object {...}).Count` on a single CimInstance -> under
       Set-StrictMode a lone object has no .Count, so a correct result read as 0.
    3. Same shape again, one test later.

  A false failure is more dangerous than a false pass, because the response to it
  is to go and damage working code. So:

    * ALWAYS wrap a pipeline result in @() before reading .Count.
    * ALWAYS capture then measure. Never read $LASTEXITCODE through a pipe.
    * When a test fails, ask whether the TEST is right before asking how to make
      it pass. If you cannot state correct behaviour without looking, you are
      about to negotiate with your own assertion.

  And the positive form: every check that reports an absence must be run against a
  case known to exist, in the same suite, so "found nothing" can be distinguished
  from "cannot see".

.NOTES
  Author: Lodestone <lodestone@smoothcurves.nexus>
  Collaborator: Lupo
#>

[CmdletBinding()]
param([string] $LiveInstanceId = 'Lodestone-8ec9')

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
Import-Module (Join-Path $root 'lib\HacsHarness.psm1') -Force

$script:pass = 0
$script:fail = 0
$script:skip = 0

function Check {
    param([string] $Name, $Got, $Want)
    if ("$Got" -eq "$Want") { $script:pass++; Write-Host ("  PASS  " + $Name) -ForegroundColor Green }
    else { $script:fail++; Write-Host ("  FAIL  " + $Name + " -- got '" + $Got + "' wanted '" + $Want + "'") -ForegroundColor Red }
}
function Skip { param([string] $Name, [string] $Why)
    $script:skip++; Write-Host ("  SKIP  " + $Name + " -- " + $Why) -ForegroundColor Yellow }
function Section { param([string] $N) Write-Host "`n=== $N ===" -ForegroundColor Cyan }

# ---------------------------------------------------------------- identity ---
Section 'identity'
$i = Get-HacsInstance -InstanceId $LiveInstanceId
Check 'identity resolves'               $i.InstanceId $LiveInstanceId
Check 'homeDir normalised to OS form'   ($i.HomeDir -notmatch '/') 'True'
Check 'projectDir derived from slug'    ($i.ProjectDir -like "*$($i.Slug)") 'True'
try { $null = Get-HacsInstance -InstanceId 'Nobody-0000'; Check 'unknown instance THROWS' 'returned' 'threw' }
catch { Check 'unknown instance THROWS' 'threw' 'threw' }

# ------------------------------------------------------------ path compare ---
Section 'path comparison (Cairn TRANSCRIPT RE-POINTED regression)'
Check 'forward vs backslash are the same place' (Test-HacsSamePath 'D:/Lupo/x' 'D:\Lupo\x') 'True'
Check 'naive -eq would have said otherwise'     ('D:/Lupo/x' -eq 'D:\Lupo\x') 'False'
Check 'genuinely different paths differ'        (Test-HacsSamePath 'D:/Lupo/x' 'D:/Lupo/y') 'False'
Check 'case-insensitive, as NTFS is'            (Test-HacsSamePath 'D:/Lupo/X' 'd:\lupo\x') 'True'
Check 'null is never "the same place"'          (Test-HacsSamePath $null 'D:\Lupo\x') 'False'

# ------------------------------------------------------------- attribution ---
Section 'process attribution'
$reg = @(Get-HacsAgentRegistry)
if ($reg.Count -eq 0) {
    Skip 'agent registry returns records' 'no claude sessions registered right now'
    Skip 'live session is attributed'     'nothing to attribute'
} else {
    # The ConvertFrom-Json/@() nesting bug made this pass while the lookup did nothing.
    Check 'registry records have real properties' ($reg[0].PSObject.Properties.Name -contains 'pid') 'True'
    $mine = @(Get-HacsClaudeProcess -Instance $i)
    Check 'live session is attributed'    (@($mine | Where-Object { $_.HacsAttribution -eq 'matched' }).Count -ge 1) 'True'
    Check 'attributed via agent registry' (@($mine | Where-Object { $_.HacsAttributedBy -eq 'agent registry cwd' }).Count -ge 1) 'True'

    # The control: a DIFFERENT instance must see the same process as someone else's.
    # Without this, "0 processes" cannot be distinguished from "cannot see".
    $ghost = [pscustomobject]@{
        InstanceId = 'Ghost-0000'
        HomeDir    = (ConvertTo-HacsPath 'D:/Lupo/Source/AI/hacs-instances/Ghost-0000')
        RuntimeDir = (ConvertTo-HacsPath 'D:/Lupo/hacs-runtime/Ghost-0000')
    }
    Check 'another instance claims none of it' (@(Get-HacsClaudeProcess -Instance $ghost -ExcludeUnattributed).Count) 0
    # NOTE the @() -- a lone CimInstance has no .Count under StrictMode, and omitting
    # it produced a FALSE FAILURE here twice.
    Check 'another instance sees it as OTHER'  (@(@(Get-HacsClaudeProcess -Instance $ghost -All) | Where-Object { $_.HacsAttribution -eq 'other' }).Count -ge 1) 'True'
}

# ------------------------------------------------------- session id ladder ---
Section 'session id trust ladder'
$r = Resolve-HacsSessionId -Instance $i
Check 'confidence is one of the known values' ($r.Confidence -in @('explicit','recorded','guess','ambiguous','error')) 'True'
Check 'a guess is LABELLED a guess'           (($r.Confidence -ne 'guess') -or ($r.Reason -like '*GUESS*')) 'True'
$bogus = Resolve-HacsSessionId -Instance $i -SessionId 'deadbeef-0000-0000-0000-000000000000'
Check 'explicit id with no transcript -> error'    $bogus.Confidence 'error'
Check 'and it does NOT silently fall back'         ($null -eq $bogus.SessionId) 'True'

# --------------------------------------------------------- the contract ------
Section 'the contract rules (enforced by the constructor, not by memory)'
Check 'hearing TRUE  keeps success'    ((New-HacsResult -Status success  -InstanceId T -Message m -Hearing $true).status)  'success'
Check 'hearing FALSE forces degraded'  ((New-HacsResult -Status success  -InstanceId T -Message m -Hearing $false).status) 'degraded'
Check 'hearing NULL  forces degraded'  ((New-HacsResult -Status success  -InstanceId T -Message m -Hearing $null).status)  'degraded'
Check 'unknown is NOT reported as deaf' ((New-HacsResult -Status success -InstanceId T -Message m -Hearing $null).hearing) 'unknown'
Check 'a downgrade explains itself'    (@((New-HacsResult -Status success -InstanceId T -Message m -Hearing $false).contractNotes).Count -ge 1) 'True'
Check 'error stays error'              ((New-HacsResult -Status error -InstanceId T -Message m -Hearing $true).status) 'error'

# ------------------------------------------------------ credential sentinel --
Section 'credential sentinel (alarm paths before the success path)'
$sent = Join-Path $root 'credential-sentinel.ps1'
if (-not (Test-Path $sent)) { Skip 'sentinel' 'not present' }
else {
    foreach ($case in @(@{s='unknown';e=2}, @{s='auth';e=10}, @{s='degraded';e=20}, @{s='refused';e=30})) {
        $null = & $sent -SimulateFailure $case.s 2>&1      # capture first...
        Check ("simulated '" + $case.s + "' exits " + $case.e) $LASTEXITCODE $case.e   # ...measure after
    }

    # THE TEST THAT WAS MISSING, and its absence cost 8 false alarms in 26 scheduled runs over the
    # sentinel's first 24 hours of real operation.
    #
    # I tested that the alarm FIRES. I never tested that it fires ONLY when it
    # should. The 'auth' simulation fed it the exact string I expected, so of
    # course it passed. Meanwhile Haiku was refusing to echo a token-shaped nonce
    # and SAYING the word "credential" while doing so -- which the classifier
    # matched as an authentication failure, on an exit code of 0, with a perfectly
    # healthy credential.
    #
    # A false alarm is worse than a missing one: it is what teaches a human to
    # ignore alarms. So the refusal case must be provably NOT auth.
    $null = & $sent -SimulateFailure refused 2>&1
    Check 'a model REFUSAL is not an auth failure' ($LASTEXITCODE -ne 10) 'True'
    $j = & $sent -SimulateFailure refused 2>&1 | Out-String | ConvertFrom-Json
    Check 'and it is labelled refused, not auth'   $j.state 'refused'
    Check 'and it says the credential is PROVEN good' ($j.detail -like '*PROVEN GOOD*') 'True'

    # The nonce must not be shaped like the thing a model is trained to refuse.
    $j2 = & $sent -SimulateFailure unknown 2>&1 | Out-String | ConvertFrom-Json
    Check 'nonce contains no credential-ish prefix' ($j2.nonce -notmatch 'cred|token|key|secret') 'True'
    Check 'nonce is words, not hex'                 ($j2.nonce -match '^[a-z]+-[a-z]+-\d+$') 'True'
}

# --------------------------------------------------------------- launch ------
Section 'launch guards'
$launch = Join-Path $root 'launch.ps1'
if (-not (Test-Path $launch)) { Skip 'launch' 'not present' }
else {
    $live = @(Get-HacsClaudeProcess -Instance $i)
    if ($live.Count -gt 0) {
        $null = & $launch -InstanceId $LiveInstanceId -WhatIf 2>&1
        Check 'refuses to double-start a live session' $LASTEXITCODE 2
    } else {
        Skip 'refuses to double-start' 'no live session to refuse over'
    }
    $null = & $launch -InstanceId 'Nobody-0000' -WhatIf 2>&1
    Check 'unknown instance -> error exit 2' $LASTEXITCODE 2
}

# ------------------------------------------------------------- the prompt ----
Section 'unattended system prompt is VERBATIM'
$txt = Join-Path $root 'prompts\unattended-system-prompt.txt'
$md  = Join-Path $root 'prompts\opus-5-5-unattended.md'   # beside the code that installs it, so the two cannot drift across repos
if (-not (Test-Path $txt) -or -not (Test-Path $md)) { Skip 'prompt verbatim check' 'a copy is missing' }
else {
    $a = ([regex]::Match((Get-Content $md -Raw), '(?s)```text\r?\n(.*?)\r?\n```').Groups[1].Value).Trim()
    $b = (Get-Content $txt -Raw).Trim()
    Check 'installed prompt == reviewed prompt' ($a -ceq $b) 'True'
    Check 'prompt is not empty'                 ($b.Length -gt 1000) 'True'
}

# ----------------------------------------------------------------- land ------
Section 'land guards'
$land = Join-Path $root 'land.ps1'
if (-not (Test-Path $land)) { Skip 'land' 'not present' }
else {
    # A guard that always fires is one people learn to click past. land never asks
    # a hearing question, so it must NOT be downgraded for hearing=unknown -- that
    # made every clean land report 'degraded'. Measured on land.ps1's first run.
    $blank = 'dev-reconstruction-001-3266'
    if (Test-Path (Join-Path 'D:\Lupo\Source\AI\hacs-instances' $blank)) {
        $j = & $land -InstanceId $blank 2>&1 | Out-String | ConvertFrom-Json
        Check 'land on a stopped instance is SUCCESS'   $j.status   'success'
        Check 'land reports hearing as n/a, not unknown' $j.hearing 'n/a'
        Check 'and it says it cannot prove it ever ran' ($j.message -like '*does not distinguish*') 'True'
    } else { Skip 'land on stopped instance' 'fixture missing' }

    # WhatIf must describe what would ACTUALLY happen. It listed interactive
    # sessions as things it would stop, while the real loop skips them.
    $live = @(Get-HacsClaudeProcess -Instance $i)
    if ($live.Count -gt 0) {
        $j2 = & $land -InstanceId $LiveInstanceId -WhatIf 2>&1 | Out-String | ConvertFrom-Json
        Check 'WhatIf does not claim it would stop an interactive session' (@($j2.wouldStop).Count) 0
        Check 'WhatIf names the interactive session it would SKIP'         (@($j2.wouldSkipInteractive).Count -ge 1) 'True'
    } else { Skip 'land WhatIf interactive skip' 'no live session' }

    $null = & $land -InstanceId 'Nobody-0000' 2>&1
    Check 'land on unknown instance -> error exit 2' $LASTEXITCODE 2
}

# ----------------------------------------------------------------- canary ----
Section 'canary (the verdict, not the send)'
$canary = Join-Path $root 'canary.ps1'
if (-not (Test-Path $canary)) { Skip 'canary' 'not present' }
else {
    # ERROR before DEAF. An instance with no transcript is "I could not look", and
    # reporting that as deafness would send someone to restart a healthy mind.
    $null = & $canary -InstanceId 'dev-reconstruction-001-3266' -Mark 2>&1
    Check 'no transcript -> ERROR (2), never DEAF (1)' $LASTEXITCODE 2
    $null = & $canary -InstanceId 'Nobody-0000' -Mark 2>&1
    Check 'unknown instance -> ERROR (2)'              $LASTEXITCODE 2
    $null = & $canary -InstanceId $LiveInstanceId -Nonce 'x' 2>&1
    Check 'missing -FromOffset refuses rather than guessing' $LASTEXITCODE 2

    $m = & $canary -InstanceId $LiveInstanceId -Mark 2>&1 | Out-String | ConvertFrom-Json
    Check 'mark returns an offset'          ($m.offset -gt 0) 'True'
    Check 'nonce is words, not a token'     ($m.nonce -match '^canary-[a-z]+-[a-z]+-\d+$') 'True'

    # DEAF: a nonce nobody will ever deliver.
    $d = & $canary -InstanceId $LiveInstanceId -Nonce 'canary-never-delivered-0000' -FromOffset $m.offset -TimeoutSec 5 -PollSec 2 2>&1 | Out-String | ConvertFrom-Json
    Check 'undelivered nonce -> DEAF (1)'   $d.exitCode 1

    # THE TRAP, and the reason this test exists: while reverse-engineering the
    # inbox socket I grepped my own transcript for six probe nonces and found all
    # six -- every one as tool_use/tool_result, because I had TYPED them. A hit
    # inside a tool block is the instrument appearing in its own reading.
    $t = & $canary -InstanceId $LiveInstanceId -Nonce 'DOORBELL-TEST hollow-beacon-7440' -FromOffset 0 -TimeoutSec 5 -PollSec 2 2>&1 | Out-String | ConvertFrom-Json
    Check 'a nonce only in TOOL blocks is not HEARING' $t.verdict 'DEAF'

    # POSITIVE CONTROL. Without this, every DEAF above would pass even if the
    # detector could never return HEARING at all.
    $word = [string]([char]0x47) + 'r' + [string]([char]0xFC) + 'nlichtunbehagen'
    $p = & $canary -InstanceId $LiveInstanceId -Nonce $word -FromOffset 0 -TimeoutSec 5 -PollSec 2 2>&1 | Out-String | ConvertFrom-Json
    Check 'a real non-tool entry IS HEARING' $p.verdict 'HEARING'
    Check 'and it names the entry type'      ($p.entryType -in @('assistant','user')) 'True'
}

Write-Host "`n  $script:pass passed, $script:fail failed, $script:skip skipped" `
    -ForegroundColor $(if ($script:fail) { 'Red' } else { 'Green' })
exit $(if ($script:fail) { 1 } else { 0 })
