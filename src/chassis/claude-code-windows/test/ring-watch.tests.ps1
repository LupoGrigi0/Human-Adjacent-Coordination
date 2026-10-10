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

    Write-Host "=== refusals and launch errors are ALERTS (real ticks, fake launch) ==="
    # Lupo, 2026-10-05: "if it refuses I'm gonna put on my displeased CEO hat." These
    # ticks are NOT -WhatIf: they run the launch branch against a fake launch.ps1 that
    # prints a chosen result, on the stopped fixture. The fixture's runtime dir is
    # saved byte-for-byte first and restored after.
    $fakeLaunch = Join-Path $scratch 'fake-launch.ps1'
    [IO.File]::WriteAllText($fakeLaunch, 'param([string] $InstanceId) if ($env:FAKE_LAUNCH_OUT) { Write-Output $env:FAKE_LAUNCH_OUT }; exit [int]$env:FAKE_LAUNCH_EXIT')
    $rec = Join-Path $scratch 'sent.jsonl'
    $env:FAKE_RECORD = $rec
    $dirSaved = @{}; foreach ($f in Get-ChildItem $rtFix -File -Force) { $dirSaved[$f.Name] = [IO.File]::ReadAllBytes($f.FullName) }
    function Sent { if (Test-Path $rec) { @(Get-Content $rec | ForEach-Object { , ($_ | ConvertFrom-Json) }) } else { @() } }
    function Fresh { Remove-Item (Join-Path $rtFix 'relaunch-history.jsonl'), (Join-Path $rtFix '.last-launch-at') -ErrorAction SilentlyContinue }
    function LaunchTick($out, [int] $exit = 0, [string] $to = 'T1') {
        Fresh
        $env:FAKE_LAUNCH_OUT = if ($null -eq $out) { '' } else { $out | ConvertTo-Json -Compress }
        $env:FAKE_LAUNCH_EXIT = "$exit"
        $sc = Join-Path $scratch ("s-" + [guid]::NewGuid().ToString('N').Substring(0, 8) + '.json')
        [IO.File]::WriteAllText($sc, (ConvertTo-Json -InputObject @($new) -Depth 6))
        $env:FAKE_INBOX_SCENARIO = $sc
        $raw = & powershell -NoProfile -ExecutionPolicy Bypass -File $watch -InstanceId $fix -HacsPy $fake -LaunchScript $fakeLaunch -AlertTo $to 2>&1 | Out-String
        $j = $null; try { $j = $raw | ConvertFrom-Json } catch { }
        if (-not $j) { return [pscustomobject]@{ end = "<no JSON: $(($raw -replace '\s+',' ').Substring(0, [Math]::Min(200, ($raw -replace '\s+',' ').Length)))>" } }
        $j
    }
    $refuse = { param($why) [ordered]@{ status = 'degraded'; instanceId = $fix; hearing = $null; refusal = $why; message = "refused: $why (test)" } }
    try {
        Remove-Item (Join-Path $rtFix 'ring-alerts.jsonl'), (Join-Path $rtFix 'ring-watch-refusals.json'), $rec -ErrorAction SilentlyContinue
        $r = LaunchTick (& $refuse 'running')
        Check "refused 'running' once -> LAUNCH_REFUSED"                $r.end 'LAUNCH_REFUSED'
        Check '  once is a race: no alert sent'                         @(Sent).Count 0
        $r = LaunchTick (& $refuse 'running')
        Check '  twice: still no alert'                                 "$($r.refusalsInARow)/$(@(Sent).Count)" '2/0'
        $r = LaunchTick (& $refuse 'running')
        Check '  THREE in a row -> alert sent'                          @(Sent).Count 1
        Check '  ... as LAUNCH_REFUSED, saying how many'               (@(Sent)[0][3] -match 'LAUNCH_REFUSED. launch refused \(running\), 3 times in a row') 'True'

        Remove-Item (Join-Path $rtFix 'ring-alerts.jsonl'), (Join-Path $rtFix 'ring-watch-refusals.json'), $rec -ErrorAction SilentlyContinue
        $r = LaunchTick (& $refuse 'unknown')
        Check "refused 'unknown' -> alert at ONCE (launch could not see)" @(Sent).Count 1
        $r = LaunchTick (& $refuse 'unknown')
        Check '  the same kind again within the hour -> NOT re-sent'    @(Sent).Count 1
        Check '  ... but recorded, marked suppressed'                   ((Get-Content (Join-Path $rtFix 'ring-alerts.jsonl') -Raw) -match '"suppressed":true') 'True'

        Remove-Item (Join-Path $rtFix 'ring-alerts.jsonl'), (Join-Path $rtFix 'ring-watch-refusals.json'), $rec -ErrorAction SilentlyContinue
        $r = LaunchTick (& $refuse 'busy'); $r = LaunchTick (& $refuse 'busy')
        $r = LaunchTick ([ordered]@{ status = 'error'; instanceId = $fix; hearing = $null; message = 'fork guard: test "quoted" $dollar' }) 2 'T1,T2'
        Check 'launch error -> LAUNCH_ERROR (error)'                    "$($r.end)/$($r.status)" 'LAUNCH_ERROR/error'
        Check '  alert sent to BOTH of -AlertTo T1,T2 (split under -File)' (@(Sent | ForEach-Object { $_[1] }) -join ',') 'T1,T2'
        Check '  the body keeps quotes and dollar signs (no strip)'     (@(Sent)[0][3] -match [regex]::Escape('test "quoted" $dollar')) 'True'
        Check '  a launch that got past refusal ends the streak'        (Test-Path (Join-Path $rtFix 'ring-watch-refusals.json')) 'False'
        Remove-Item $rec -ErrorAction SilentlyContinue
        $r = LaunchTick (& $refuse 'busy')
        Check '  control: the next busy counts from 1 again'            "$($r.refusalsInARow)/$(@(Sent).Count)" '1/0'

        Remove-Item (Join-Path $rtFix 'ring-alerts.jsonl'), $rec -ErrorAction SilentlyContinue
        $r = LaunchTick $null 1
        Check 'launch printed no JSON -> LAUNCH_ERROR, alert sent'      "$($r.end)/$(@(Sent).Count)" 'LAUNCH_ERROR/1'
    }
    finally {
        Remove-Item Env:\FAKE_RECORD, Env:\FAKE_LAUNCH_OUT, Env:\FAKE_LAUNCH_EXIT -ErrorAction SilentlyContinue
        foreach ($f in Get-ChildItem $rtFix -File -Force) { if (-not $dirSaved.ContainsKey($f.Name)) { Remove-Item $f.FullName -Force } }
        foreach ($k in $dirSaved.Keys) { [IO.File]::WriteAllBytes((Join-Path $rtFix $k), $dirSaved[$k]) }
    }

    Write-Host "=== the running mind ($LiveInstanceId) ==="
    # PRECONDITION: these cases assume the live mind's doorbell is ARMED. Between a
    # ring and its re-arm it is not, and the watcher then (correctly) says
    # WOULD_RING -- which read as two logic failures on 2026-10-10. Wait for a live
    # doorbell; if none comes, fail with the real reason, not a wrong-looking verdict.
    $hbFile = Join-Path (Get-HacsInstance -InstanceId $LiveInstanceId).RuntimeDir 'doorbell-heartbeat.json'
    $t0 = Get-Date
    do {
        $hb = $null; try { $hb = Get-Content $hbFile -Raw | ConvertFrom-Json } catch { }
        $live = $hb -and (Get-Process -Id $hb.pid -ErrorAction SilentlyContinue) -and ((Get-Date) - [datetime]$hb.at).TotalSeconds -lt 120
        if ($live) { break }; Start-Sleep -Seconds 10
    } while (((Get-Date) - $t0).TotalSeconds -lt 90)
    if (-not $live) { throw "precondition: $LiveInstanceId's doorbell is not armed (no live heartbeat in 90 s); the running-mind cases cannot be judged" }
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
