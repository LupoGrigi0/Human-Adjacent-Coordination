<#
.SYNOPSIS
  power-notice.ps1 against scripted event sequences (-EventFixture, -Now), plus
  read-only runs against this box's REAL event log at times known to hold a
  reboot, a sleep and an unexpected shutdown. No hub: sends go to a recorder
  stub that writes its argv to a file. Runs on a test fixture's runtime dir and
  restores its power-notices.jsonl afterwards.

  Every classification has a twin that must NOT produce it: a restart is not a
  sign-out, an old 6008 does not taint a later clean boot, a quiet log sends
  nothing.

.NOTES
  Author: Lodestone <lodestone@smoothcurves.nexus>
  Collaborator: Lupo
#>
Set-StrictMode -Version Latest
$root    = Split-Path $PSScriptRoot -Parent
$pn      = Join-Path $root 'power-notice.ps1'
$fixture = 'dev-reconstruction-001-f35a'
$rt      = "D:\Lupo\hacs-runtime\$fixture"
$logFile = Join-Path $rt 'power-notices.jsonl'
$scratch = Join-Path $env:TEMP "power-notice-tests-$PID"
$null = New-Item -ItemType Directory -Force -Path $scratch

$script:pass = 0; $script:fail = 0
function Check([string] $name, $got, $want) {
    if ([string]$got -eq [string]$want) { $script:pass++; Write-Host "  PASS  $name" }
    else { $script:fail++; Write-Host "  FAIL  $name -- got '$got' wanted '$want'" -ForegroundColor Red }
}
$savedLog = if (Test-Path $logFile) { [IO.File]::ReadAllBytes($logFile) } else { $null }

# A stand-in for hacs.py: records its argv (one JSON line per call), exits as told.
$stub = Join-Path $scratch 'stub_hacs.py'
[IO.File]::WriteAllText($stub, @'
import json, os, sys
with open(os.environ["STUB_RECORD"], "a", encoding="utf-8") as f:
    f.write(json.dumps(sys.argv[1:]) + "\n")
sys.exit(int(os.environ.get("STUB_EXIT", "0")))
'@)
$record = Join-Path $scratch 'record.jsonl'
$env:STUB_RECORD = $record

$T0 = [datetime]'2026-06-01T12:00:00'
function Ev([int] $id, [int] $secAgo, [string] $detail = '') {
    $p = @{ 1074 = 'User32'; 7002 = 'Microsoft-Windows-Winlogon'; 7001 = 'Microsoft-Windows-Winlogon'; 42 = 'Microsoft-Windows-Kernel-Power'
            1 = 'Microsoft-Windows-Power-Troubleshooter'; 13 = 'Microsoft-Windows-Kernel-General'; 12 = 'Microsoft-Windows-Kernel-General'; 6008 = 'EventLog' }[$id]
    @{ id = $id; provider = $p; time = $T0.AddSeconds(-$secAgo).ToString('s'); detail = $detail }
}
function Run([string] $event, [object[]] $evs, [string[]] $extra = @(), [string] $now = $T0.ToString('s')) {
    $fx = Join-Path $scratch ("fx-" + [guid]::NewGuid().ToString('N').Substring(0, 8) + '.json')
    [IO.File]::WriteAllText($fx, (ConvertTo-Json -InputObject @($evs) -Depth 4))
    $out = & powershell -NoProfile -ExecutionPolicy Bypass -File $pn -InstanceId $fixture -Event $event -EventFixture $fx -Now $now -HacsPy $stub @extra 2>&1 | Out-String
    $code = $LASTEXITCODE
    $o = $null; try { $o = $out | ConvertFrom-Json } catch { }
    [pscustomobject]@{ Code = $code; O = $o; Out = $out }
}
function Real([string] $event, [string] $now) {
    $out = & powershell -NoProfile -ExecutionPolicy Bypass -File $pn -InstanceId $fixture -Event $event -WhatIf -Now $now 2>&1 | Out-String
    $o = $null; try { $o = $out | ConvertFrom-Json } catch { }
    [pscustomobject]@{ Code = $LASTEXITCODE; O = $o; Out = $out }
}

try {
    Write-Host '=== going: names the announced thing ==='
    $r = Run going @((Ev 1074 5 'restart'), (Ev 7002 2)) @('-WhatIf')
    Check 'restart + its sign-out -> restart (not signout)'      $r.O.kind 'restart'
    $r = Run going @((Ev 1074 5 'power off')) @('-WhatIf')
    Check 'power off -> shutdown'                                $r.O.kind 'shutdown'
    $r = Run going @((Ev 7002 3)) @('-WhatIf')
    Check 'sign-out alone -> signout'                            $r.O.kind 'signout'
    $r = Run going @((Ev 42 3), (Ev 7002 1)) @('-WhatIf')
    Check 'sleep outranks a sign-out'                            $r.O.kind 'sleep'
    $r = Run going @((Ev 1074 600 'restart')) @('-WhatIf')
    Check 'a 10-minute-old restart is not this trigger'          $r.O.kind 'unidentified'
    Check '... and it still exits 0 (a notice, not a failure)'   $r.Code 0

    Write-Host '=== back: pairs the return with what preceded it ==='
    $announced = @((Ev 1074 120 'restart'), (Ev 7002 117), (Ev 13 113), (Ev 12 88), (Ev 7001 70))
    $r = Run back $announced @('-WhatIf')
    Check 'announced restart -> announced'                       $r.O.kind 'announced'
    Check '... dark from the clean kernel shutdown to the boot'  $r.O.darkSec 25
    Check '... the restart word is carried'                      ($r.O.text -match 'announced restart') 'True'
    Check '... and it disclaims the mind'                        ($r.O.text -match 'NOT that the mind can think') 'True'
    $r = Run back @((Ev 12 60), (Ev 6008 55), (Ev 7001 30)) @('-WhatIf')
    Check '6008 during this boot -> unannounced'                 $r.O.kind 'unannounced'
    Check '... start of the dark is unknown, not guessed'        $r.O.from 'unknown'
    $r = Run back @((Ev 12 90000), (Ev 6008 89990), (Ev 1074 400 'restart'), (Ev 13 390), (Ev 12 360), (Ev 7001 340)) @('-WhatIf')
    Check 'an OLD 6008 does not taint a later clean boot'        $r.O.kind 'announced'
    $r = Run back @((Ev 12 60), (Ev 7001 30)) @('-WhatIf')
    Check 'a boot with no shutdown record -> unknown'            $r.O.kind 'unknown'
    $r = Run back @((Ev 42 4000), (Ev 1 40)) @('-WhatIf')
    Check 'sleep then resume -> sleep'                           $r.O.kind 'sleep'
    Check '... dark interval from sleep to resume'               $r.O.darkSec 3960
    $r = Run back @((Ev 7002 300), (Ev 7001 30)) @('-WhatIf')
    Check 'sign-out then logon, no boot -> signout'              $r.O.kind 'signout'
    $r = Run back @((Ev 12 90000), (Ev 7001 89000)) @('-WhatIf')
    Check 'nothing in the last 30 min -> none'                   $r.O.kind 'none'

    Write-Host '=== the send path, through a recorder stub ==='
    Remove-Item $record, $logFile -ErrorAction SilentlyContinue
    $r = Run back $announced @('-AlertTo', 'AxiomTest,BastionTest')
    Check 'two recipients -> exit 0'                             $r.Code 0
    $calls = @(Get-Content $record | ForEach-Object { , ($_ | ConvertFrom-Json) })
    Check '... one send per recipient'                           $calls.Count 2
    # argv after the script path: send, to, subject, body
    Check '... first call is a send to the first recipient'      "$($calls[0][0]) $($calls[0][1])" 'send AxiomTest'
    Check '... second call goes to the second (A,B was split)'   $calls[1][1] 'BastionTest'
    Check '... the body names the instance and the kind'         ($calls[0][3] -match "$fixture is back after an announced restart") 'True'
    Check '... the body carries no user name'                    ($calls[0][3] -match [regex]::Escape($env:USERNAME)) 'False'
    Check '... one line in power-notices.jsonl'                  @(Get-Content $logFile).Count 1
    Remove-Item $record -ErrorAction SilentlyContinue
    $r = Run back @((Ev 12 90000)) @('-AlertTo', 'AxiomTest')
    Check 'nothing to report -> nothing sent'                    (Test-Path $record) 'False'
    $r = Run back $announced @('-AlertTo', 'AxiomTest', '-WhatIf')
    Check '-WhatIf -> nothing sent'                              (Test-Path $record) 'False'
    Check '-WhatIf -> nothing logged'                            @(Get-Content $logFile).Count 1
    Write-Host '=== once per transition ==='
    Remove-Item $record, $logFile -ErrorAction SilentlyContinue
    $r = Run back $announced @('-AlertTo', 'AxiomTest')
    $r = Run back $announced @('-AlertTo', 'AxiomTest')
    Check 'the same return twice -> sent once'                   @(Get-Content $record).Count 1
    Check '... the second says duplicate'                        $r.O.kind 'duplicate'
    $r = Run back @((Ev 42 4000), (Ev 1 40)) @('-AlertTo', 'AxiomTest')
    Check 'control: a DIFFERENT return is still sent'            @(Get-Content $record).Count 2
    Remove-Item $record, $logFile -ErrorAction SilentlyContinue
    $restart = @((Ev 1074 5 'restart'), (Ev 7002 2))
    $r = Run going $restart @('-AlertTo', 'AxiomTest')
    $r = Run going $restart @('-AlertTo', 'AxiomTest') -now $T0.AddSeconds(3).ToString('s')
    Check '1074 and 7002 both trigger -> one going notice'       @(Get-Content $record).Count 1
    $r = Run going @((Ev 42 -598)) @('-AlertTo', 'AxiomTest') -now $T0.AddMinutes(10).ToString('s')   # 2 s before that clock
    Check 'control: a going notice 10 min later is new'          $r.O.kind 'sleep'
    Check '... and is sent'                                      @(Get-Content $record).Count 2
    $r = Run going $restart @('-AlertTo', 'AxiomTest') -now $T0.AddMinutes(30).ToString('s')
    Check 'a LATE going (no event in window) -> unidentified'    $r.O.kind 'unidentified'
    Check '... is NOT sent (going-offline after the fact misleads)' @(Get-Content $record).Count 2
    Check '... but IS logged, so the late run is visible'        ((Get-Content $logFile -Raw) -match 'unidentified') 'True'
    Remove-Item $record, $logFile -ErrorAction SilentlyContinue

    $env:STUB_EXIT = '1'
    $r = Run back $announced @('-AlertTo', 'AxiomTest')
    Check 'a failed send -> degraded, exit 1'                    "$($r.O.status) $($r.Code)" 'degraded 1'
    Check '... and the failure is logged'                        ((Get-Content $logFile -Raw) -match 'SEND-FAILED') 'True'
    Remove-Item Env:\STUB_EXIT

    Write-Host '=== this box''s REAL event log, read-only (-WhatIf) ==='
    $r = Real back '2026-10-04T22:28:30'
    Check '2026-10-04 reboot -> announced'                       $r.O.kind 'announced'
    Check '... dark 25 s (13 at 22:27:06, 12 at 22:27:31)'      $r.O.darkSec 25
    $r = Real going '2026-10-04T22:27:03'
    Check '2026-10-04 going, after its 7002 -> restart'          $r.O.kind 'restart'
    $r = Real back '2026-09-26T19:30:00'
    Check '2026-09-26 resume -> sleep'                           $r.O.kind 'sleep'
}
catch {
    # An abort is a failure, never a short green run (M10).
    $script:fail++; Write-Host "  FAIL  suite aborted: $($_.Exception.Message)" -ForegroundColor Red
}
finally {
    if ($null -ne $savedLog) { [IO.File]::WriteAllBytes($logFile, $savedLog) } else { Remove-Item $logFile -ErrorAction SilentlyContinue }
    Remove-Item Env:\STUB_RECORD, Env:\STUB_EXIT -ErrorAction SilentlyContinue
    Remove-Item $scratch -Recurse -Force -ErrorAction SilentlyContinue
}
Write-Host ""
Write-Host "  $($script:pass) passed, $($script:fail) failed"
exit $(if ($script:fail) { 1 } else { 0 })
