<#
.SYNOPSIS
  ring-watch.ps1, one tick at a time, with -WhatIf: every END of the state
  machine that can be reached without launching or ringing anything.

  The mail side is a scripted fake hub (test\fake_hacs.py). Presence is REAL:
  a stopped fixture (NOT_HOME) and the running mind (HOME). State files that a
  case needs are put in place and removed afterwards, and the suite asserts
  that -WhatIf itself wrote nothing.

.NOTES
  Author: Lodestone <lodestone@smoothcurves.nexus>
  Collaborator: Lupo
#>
param([string] $LiveInstanceId = 'Lodestone-8ec9')
Set-StrictMode -Version Latest
$root    = Split-Path $PSScriptRoot -Parent
$watch   = Join-Path $root 'ring-watch.ps1'
$fake    = Join-Path $PSScriptRoot 'fake_hacs.py'
$fix     = 'dev-reconstruction-001-f35a'
$rtFix   = "D:\Lupo\hacs-runtime\$fix"
$scratch = Join-Path $env:TEMP "ringwatch-tests-$PID"
$null = New-Item -ItemType Directory -Force -Path $scratch
Import-Module (Join-Path $root 'lib\HacsHarness.psm1') -Force

$script:pass = 0; $script:fail = 0
function Check([string] $name, $got, $want) {
    if ([string]$got -eq [string]$want) { $script:pass++; Write-Host "  PASS  $name" }
    else { $script:fail++; Write-Host "  FAIL  $name -- got '$got' wanted '$want'" -ForegroundColor Red }
}
function Snapshot([string] $dir) {
    @(Get-ChildItem $dir -File -Force -ErrorAction SilentlyContinue | Sort-Object Name |
      ForEach-Object { "$($_.Name)|$($_.Length)|$($_.LastWriteTimeUtc.Ticks)" }) -join "`n"
}
function Tick([string] $id, [object[]] $steps, [string[]] $extra = @()) {
    $sc = Join-Path $scratch ("s-" + [guid]::NewGuid().ToString('N').Substring(0, 8) + '.json')
    [IO.File]::WriteAllText($sc, (ConvertTo-Json -InputObject $steps -Depth 6))
    $env:FAKE_INBOX_SCENARIO = $sc
    $raw = & powershell -NoProfile -ExecutionPolicy Bypass -File $watch -InstanceId $id -WhatIf -HacsPy $fake @extra 2>&1 | Out-String
    $j = $null; try { $j = $raw | ConvertFrom-Json } catch { }
    if (-not $j) { return [pscustomobject]@{ end = "<no JSON: $(($raw -replace '\s+',' ').Substring(0, [Math]::Min(200, ($raw -replace '\s+',' ').Length)))>"; status = $null } }
    $j
}
function Mail([string[]] $ids, [int] $total) { @{ exit = 0; out = @{ ok = $true; me = '$ME'; total_unread = $total; ids = $ids; more_unread = $false; page_size = $ids.Count } } }
$down = @{ exit = 3; out = @{ ok = $false; me = '$ME'; error = 'simulated: no route to hub' } }
$none = Mail @() 0
$new  = Mail @('ringwatch-test-1') 1

# Files a case may put in place. Any that already exist are saved and restored.
$placed = '.relaunch-latch', '.desired-state', 'relaunch-history.jsonl', '.last-launch-at', 'doorbell-heartbeat.json'
$saved = @{}
foreach ($f in $placed) { $p = Join-Path $rtFix $f; if (Test-Path $p) { $saved[$f] = [IO.File]::ReadAllBytes($p) } }
function Clear-Placed { foreach ($f in $placed) { Remove-Item (Join-Path $rtFix $f) -ErrorAction SilentlyContinue } }
function Put([string] $f, $obj) { [IO.File]::WriteAllText((Join-Path $rtFix $f), ($obj | ConvertTo-Json -Compress)) }

try {
    Clear-Placed
    # PRECONDITION: the fixture must be quiet (NOT_HOME). Right after a land it is
    # TRANSITIONING for ~60 s, and every NOT_HOME case would then fail for the right
    # reason. Wait for it; if it never settles, that is a FAILURE, never a skip.
    $fixInst = Get-HacsInstance -InstanceId $fix
    $t0 = Get-Date
    do { $pp = Get-HacsPresence -Instance $fixInst -SampleSeconds 2; if ($pp.State -eq 'NOT_HOME') { break }; Start-Sleep -Seconds 10 }
    while (((Get-Date) - $t0).TotalSeconds -lt 150)
    if ($pp.State -ne 'NOT_HOME') { throw "precondition: fixture $fix is $($pp.State), not NOT_HOME, after 150 s ($($pp.Why))" }
    $before = Snapshot $rtFix

    Write-Host "=== a stopped fixture ($fix) ==="
    $r = Tick $fix @($none)
    Check 'no mail, no doorbell heartbeat -> looks, NOT_HOME_IDLE' $r.end 'NOT_HOME_IDLE'
    Check '  and it did consult presence'                          $r.presence 'NOT_HOME'
    $r = Tick $fix @($new)
    Check 'new mail, not home -> WOULD_RELAUNCH'                   $r.end 'WOULD_RELAUNCH'
    $r = Tick $fix @($down)
    Check 'hub down, not home -> never launch on no evidence'      $r.end 'NOT_HOME_MAIL_UNKNOWN'
    $r = Tick $fix @($down) @('-Reason', 'logon')
    Check 'hub down but LOGON, desired awake -> WOULD_RELAUNCH'    $r.end 'WOULD_RELAUNCH'
    $after = Snapshot $rtFix
    Check '-WhatIf wrote nothing in the runtime dir'               ($before -eq $after) 'True'

    Put 'doorbell-heartbeat.json' @{ at = (Get-Date).ToString('o') }
    $r = Tick $fix @($none)
    Check 'no mail, doorbell alive -> IDLE without a presence look' "$($r.end)/$(@($r.PSObject.Properties.Name) -contains 'presence')" 'IDLE/False'
    Clear-Placed

    Put '.desired-state' @{ state = 'landed'; by = 'test'; at = (Get-Date).ToString('o') }
    $r = Tick $fix @($new)
    Check 'landed by a human + new mail -> HELD, not relaunched'   $r.end 'HELD'
    Check '  and it raised an alert'                               (@($r.PSObject.Properties.Name) -contains 'alert') 'True'
    Clear-Placed

    Put '.relaunch-latch' @{ at = (Get-Date).ToString('o') }
    $r = Tick $fix @($new)
    Check 'fork latch present -> LAUNCH_HELD (error)'              "$($r.end)/$($r.status)" 'LAUNCH_HELD/error'
    Clear-Placed

    $h = Join-Path $rtFix 'relaunch-history.jsonl'
    1..3 | ForEach-Object { [IO.File]::AppendAllText($h, (@{ at = (Get-Date).AddMinutes(-$_).ToString('o') } | ConvertTo-Json -Compress) + "`n") }
    $r = Tick $fix @($new)
    Check '3 relaunches this hour -> circuit breaker LAUNCH_HELD'  $r.end 'LAUNCH_HELD'
    Clear-Placed
    [IO.File]::AppendAllText($h, (@{ at = (Get-Date).AddMinutes(-90).ToString('o') } | ConvertTo-Json -Compress) + "`n")
    $r = Tick $fix @($new)
    Check 'control: an OLD relaunch does not trip the breaker'     $r.end 'WOULD_RELAUNCH'
    Clear-Placed

    Put '.last-launch-at' @{ at = (Get-Date).AddMinutes(-1).ToString('o') }
    $r = Tick $fix @($new)
    Check 'a relaunch 1 min ago -> LAUNCH_PENDING, no second launch' $r.end 'LAUNCH_PENDING'
    Clear-Placed

    $env:HACS_TEST_SIMULATE_REGISTRY_FAILURE = '1'
    try { $r = Tick $fix @($new) } finally { Remove-Item Env:\HACS_TEST_SIMULATE_REGISTRY_FAILURE -ErrorAction SilentlyContinue }
    Check 'registry unreadable -> REFUSED_UNKNOWN: no launch, no ring' $r.end 'REFUSED_UNKNOWN'

    # Another tick holds the ring lock: must be another PROCESS (a mutex is re-entrant on one thread).
    $holder = Start-Job -ArgumentList (Join-Path $root 'lib\HacsHarness.psm1'), $fix {
        param($mod, $id) Import-Module $mod; $i = Get-HacsInstance -InstanceId $id
        $l = Lock-HacsInstance -Instance $i -Kind ring; Start-Sleep -Seconds 30; Unlock-HacsInstance $l }
    $sidecar = Join-Path $rtFix '.lock-ring'
    $t0 = Get-Date; while (-not (Test-Path $sidecar) -and ((Get-Date) - $t0).TotalSeconds -lt 15) { Start-Sleep -Milliseconds 200 }
    $r = Tick $fix @($new)
    Check 'another tick holds the ring lock -> BUSY'               $r.end 'BUSY'
    $null = Wait-Job $holder -Timeout 45; Remove-Job $holder -Force

    Write-Host "=== the running mind ($LiveInstanceId) ==="
    $r = Tick $LiveInstanceId @($new)
    Check 'home + new mail + live doorbell, in grace -> DEFERRED_TO_DOORBELL' $r.end 'DEFERRED_TO_DOORBELL'
    $r = Tick $LiveInstanceId @($new) @('-GraceSec', '0')
    Check 'home + new mail past the grace -> WOULD_RING'           $r.end 'WOULD_RING'
    $r = Tick $LiveInstanceId @($none) @('-Reason', 'logon')
    Check 'home, no mail, logon -> HOME (nothing to do)'           $r.end 'HOME'
    $r = Tick $LiveInstanceId @($down) @('-Reason', 'logon')
    Check 'home, hub down -> HOME_MAIL_UNKNOWN'                    $r.end 'HOME_MAIL_UNKNOWN'
} catch {
    # A suite that dies halfway must never read as green (M10): the first
    # version of this file aborted on its 7th check and printed "6 passed, 0 failed".
    $script:fail++
    Write-Host "  FAIL  SUITE ABORTED: $($_.Exception.Message) (line $($_.InvocationInfo.ScriptLineNumber))" -ForegroundColor Red
} finally {
    Remove-Item Env:\FAKE_INBOX_SCENARIO -ErrorAction SilentlyContinue
    Clear-Placed
    foreach ($f in $saved.Keys) { [IO.File]::WriteAllBytes((Join-Path $rtFix $f), $saved[$f]) }
    Remove-Item $scratch -Recurse -Force -ErrorAction SilentlyContinue
}
Write-Host ""
Write-Host "  $($script:pass) passed, $($script:fail) failed"
exit $(if ($script:fail -eq 0) { 0 } else { 1 })
