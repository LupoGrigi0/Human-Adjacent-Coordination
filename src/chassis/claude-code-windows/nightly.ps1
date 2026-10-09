<#
.SYNOPSIS
  The unattended test run (ship card M10, DOORBELL-DESIGN 3.7). One dated log,
  one PASS or FAIL line at the end, nonzero exit on any failure.

.DESCRIPTION
  A night FAILS if any of these is true -- and "could not run" counts:
    - a suite exits nonzero, or never prints its summary line (it aborted);
    - a suite prints a SKIP that is not on test\nightly-skip-allow.txt
      (Cairn's warning: a skip is could-not-run, and an all-skipped section
      used to read as green);
    - test\must-fail.tests.ps1 PASSES (then this runner cannot see a failure);
    - deploy.ps1 -Verify finds drift (M13: deployed == repo);
    - ring-watch.ps1 -WhatIf for the live mind returns no JSON, or an END the
      watcher's eyes should never produce for it (UNKNOWN / REFUSED_UNKNOWN);
    - a registered hacs-ring-watch-* task has not run in the last 3 minutes.
  Suites run in child processes with stubs and fixtures only: no model call
  and no hub write, apart from the ring-watch tests' real presence look.

  -AlertTo sends the FAIL line as a HACS message (pure script, no model in the
  path); none by default. -ExtraSuite exists for nightly's own controls: it adds
  one more suite, so a forced skip or failure can prove the night goes red.

.NOTES
  Author: Lodestone <lodestone@smoothcurves.nexus>
  Collaborator: Lupo
#>
[CmdletBinding()]
param(
    [string]   $LogDir = 'D:\Lupo\hacs-runtime\nightly',
    [string]   $LiveInstanceId = 'Lodestone-8ec9',
    [string[]] $AlertTo = @(),
    [string[]] $ExtraSuite = @(),
    [string[]] $Suites = @('harness.tests.ps1', 'hook.tests.ps1', 'doorbell.tests.ps1', 'ring-watch.tests.ps1'),
    [string]   $HacsPy = 'D:\Lupo\Source\AI\instance-archaeology\src\hacs\hacs.py'
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$null = New-Item -ItemType Directory -Force -Path $LogDir
$log = Join-Path $LogDir ((Get-Date).ToString('yyyy-MM-dd') + '.log')
$ps = (Get-Process -Id $PID).Path
$fails = New-Object System.Collections.Generic.List[string]
function Log([string] $s) { $line = "$((Get-Date).ToString('HH:mm:ss'))  $s"; Add-Content -Path $log -Value $line -Encoding utf8; Write-Output $line }

trap {
    $m = "NIGHTLY ITSELF CRASHED: $($_.Exception.Message) (nightly.ps1 line $($_.InvocationInfo.ScriptLineNumber))"
    try { Log $m; Log 'FAIL' } catch { Write-Output $m; Write-Output 'FAIL' }
    exit 1
}

Import-Module (Join-Path $PSScriptRoot 'lib\HacsHarness.psm1') -Force
$allow = @(Get-Content (Join-Path $PSScriptRoot 'test\nightly-skip-allow.txt') -ErrorAction Stop |
           Where-Object { $_ -and $_ -notmatch '^\s*#' } | ForEach-Object { ($_ -split '\s*\|\s*', 2)[0].Trim() })
Log "=== nightly on $env:COMPUTERNAME, source $PSScriptRoot ==="

function Invoke-Suite([string] $path, [switch] $MustFail) {
    $name = Split-Path $path -Leaf
    $n = Invoke-HacsNative -FilePath $ps -Arguments @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $path) -TimeoutSec 1800
    $out = "$($n.StdOut)"
    $summary = @($out -split "`r?`n" | Where-Object { $_ -match '\d+ passed, \d+ failed' }) | Select-Object -Last 1
    $skips = @($out -split "`r?`n" | Where-Object { $_ -match '^\s*SKIP\b' } | ForEach-Object { $_.Trim() })
    $fl = @($out -split "`r?`n" | Where-Object { $_ -match '^\s*FAIL\b' } | ForEach-Object { $_.Trim() })
    Log ("{0,-24} exit={1} timedOut={2}  {3}" -f $name, $n.ExitCode, $n.TimedOut, $(if ($summary) { $summary.Trim() } else { '<NO SUMMARY LINE>' }))
    if ($MustFail) {
        if ($n.ExitCode -eq 0) { $fails.Add("$name PASSED: this runner cannot see a failure") }
        return
    }
    foreach ($f in $fl) { Log "    $f" }
    if ($n.TimedOut)        { $fails.Add("$name timed out") }
    elseif (-not $summary)  { $fails.Add("$name aborted (no summary line)") }
    elseif ($n.ExitCode -ne 0) { $fails.Add("$name exit $($n.ExitCode)") }
    foreach ($s in $skips) {
        $ok = @($allow | Where-Object { $s -like "*$_*" }).Count -gt 0
        Log "    $s  [$(if ($ok) { 'allow-listed' } else { 'NOT ALLOWED' })]"
        if (-not $ok) { $fails.Add("${name}: un-allowed skip: $s") }
    }
}

$suites = @($Suites | ForEach-Object { Join-Path $PSScriptRoot "test\$_" })
foreach ($s in @($suites + $ExtraSuite)) { Invoke-Suite $s }
Invoke-Suite (Join-Path $PSScriptRoot 'test\must-fail.tests.ps1') -MustFail

# M13: deployed == repo
$d = Invoke-HacsNative -FilePath $ps -Arguments @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $PSScriptRoot 'deploy.ps1'), '-Verify') -TimeoutSec 120
Log "deploy -Verify           exit=$($d.ExitCode)  $((("$($d.StdOut)" -split "`r?`n") | Where-Object { $_.Trim() }) -join ' / ')"
if ($d.ExitCode -ne 0) { $fails.Add("deploy -Verify: drift or could not verify (exit $($d.ExitCode))") }

# The watcher's eyes, read-only, on a case known to exist.
$w = Invoke-HacsNative -FilePath $ps -Arguments @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $PSScriptRoot 'ring-watch.ps1'), '-InstanceId', $LiveInstanceId, '-WhatIf', '-HacsPy', $HacsPy) -TimeoutSec 300
$wj = $null; try { $wj = ("$($w.StdOut)").Trim() | ConvertFrom-Json } catch { }
if (-not $wj) { $fails.Add('ring-watch -WhatIf returned no JSON'); Log 'ring-watch -WhatIf      <no JSON>' }
else {
    Log "ring-watch -WhatIf      $LiveInstanceId -> $($wj.end) ($($wj.status))"
    if ($wj.end -in @('ERROR', 'REFUSED_UNKNOWN', 'HOME_MAIL_UNKNOWN', 'NOT_HOME_MAIL_UNKNOWN')) { $fails.Add("ring-watch eyes for $LiveInstanceId say $($wj.end)") }
}

# The outside witness that the watcher task itself is alive.
foreach ($t in @(Get-ScheduledTask -TaskName 'hacs-ring-watch-*' -ErrorAction SilentlyContinue)) {
    $i = Get-ScheduledTaskInfo -TaskName $t.TaskName
    $age = [int]((Get-Date) - $i.LastRunTime).TotalSeconds
    Log ("task {0,-40} last ran {1}s ago, result {2}" -f $t.TaskName, $age, $i.LastTaskResult)
    if ($age -gt 180) { $fails.Add("$($t.TaskName) has not run for $age s") }
    if ($i.LastTaskResult -notin @(0, 1)) { $fails.Add("$($t.TaskName) LastTaskResult $($i.LastTaskResult)") }
}

if ($fails.Count -eq 0) { Log 'PASS'; exit 0 }
foreach ($f in $fails) { Log "  - $f" }
Log "FAIL ($($fails.Count))"
foreach ($to in $AlertTo) {
    $body = ("nightly on $env:COMPUTERNAME FAILED: " + ($fails -join '; ') + ". Log: $log") -replace '["$]', "'"
    $saved = $env:PYTHONIOENCODING
    try { $env:PYTHONIOENCODING = 'utf-8'; $null = Invoke-HacsNative -FilePath 'python' -Arguments @($HacsPy, 'send', $to, 'nightly FAILED', $body) -TimeoutSec 60 }
    catch { Log "alert to $to could not be sent: $($_.Exception.Message)" }
    finally { $env:PYTHONIOENCODING = $saved }
}
exit 1
