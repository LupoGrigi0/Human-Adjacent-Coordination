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
    foreach ($case in @(@{s='unknown';e=2}, @{s='auth';e=10}, @{s='degraded';e=20})) {
        $null = & $sent -SimulateFailure $case.s 2>&1      # capture first...
        Check ("simulated '" + $case.s + "' exits " + $case.e) $LASTEXITCODE $case.e   # ...measure after
    }
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
$md  = 'D:\Lupo\Source\AI\hacs-instances\_harness\prompts\opus-5-5-unattended.md'
if (-not (Test-Path $txt) -or -not (Test-Path $md)) { Skip 'prompt verbatim check' 'a copy is missing' }
else {
    $a = ([regex]::Match((Get-Content $md -Raw), '(?s)```text\r?\n(.*?)\r?\n```').Groups[1].Value).Trim()
    $b = (Get-Content $txt -Raw).Trim()
    Check 'installed prompt == reviewed prompt' ($a -ceq $b) 'True'
    Check 'prompt is not empty'                 ($b.Length -gt 1000) 'True'
}

Write-Host "`n  $script:pass passed, $script:fail failed, $script:skip skipped" `
    -ForegroundColor $(if ($script:fail) { 'Red' } else { 'Green' })
exit $(if ($script:fail) { 1 } else { 0 })
