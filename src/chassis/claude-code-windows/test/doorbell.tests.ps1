<#
.SYNOPSIS
  doorbell.ps1 against a scripted fake hub (test\fake_hacs.py). No network, no
  real inbox, no live mind. Runs on a test fixture's runtime dir and restores
  its doorbell files afterwards.

  Every "it rings" check has a twin "it does NOT ring" check, and every "could
  not look" check has a twin where the hub answers: a doorbell that always rings,
  or never does, would otherwise pass half of this.

.NOTES
  Author: Lodestone <lodestone@smoothcurves.nexus>
  Collaborator: Lupo
#>
Set-StrictMode -Version Latest
$root    = Split-Path $PSScriptRoot -Parent
$bell    = Join-Path $root 'doorbell.ps1'
$fake    = Join-Path $PSScriptRoot 'fake_hacs.py'
$fixture = 'dev-reconstruction-001-f35a'
$rt      = "D:\Lupo\hacs-runtime\$fixture"
$scratch = Join-Path $env:TEMP "doorbell-tests-$PID"
$null = New-Item -ItemType Directory -Force -Path $scratch

$script:pass = 0; $script:fail = 0
function Check([string] $name, $got, $want) {
    if ([string]$got -eq [string]$want) { $script:pass++; Write-Host "  PASS  $name" }
    else { $script:fail++; Write-Host "  FAIL  $name -- got '$got' wanted '$want'" -ForegroundColor Red }
}

$files = 'doorbell-heartbeat.json', 'doorbell-ledger.json', 'doorbell-state.json', 'doorbell.log'
$saved = @{}
foreach ($f in $files) { $p = Join-Path $rt $f; if (Test-Path $p) { $saved[$f] = [IO.File]::ReadAllBytes($p) } }
function Reset-Doorbell { foreach ($f in 'doorbell-heartbeat.json', 'doorbell-ledger.json', 'doorbell-state.json') { Remove-Item (Join-Path $rt $f) -ErrorAction SilentlyContinue } }

function Ring([object[]] $steps, [string[]] $extra = @()) {
    $sc = Join-Path $scratch ("s-" + [guid]::NewGuid().ToString('N').Substring(0, 8) + '.json')
    [IO.File]::WriteAllText($sc, (ConvertTo-Json -InputObject $steps -Depth 6))
    $env:FAKE_INBOX_SCENARIO = $sc
    $out = & powershell -NoProfile -ExecutionPolicy Bypass -File $bell -InstanceId $fixture -PollSec 0 -HubDownPolls 3 -HacsPy $fake @extra 2>&1 | Out-String
    [pscustomobject]@{ Code = $LASTEXITCODE; Out = $out.Trim() }
}
function OkReply([string[]] $ids, [int] $total, [bool] $more = $false) {
    @{ exit = 0; out = @{ ok = $true; me = '$ME'; total_unread = $total; ids = $ids; more_unread = $more; page_size = $ids.Count } }
}
$down = @{ exit = 3; out = @{ ok = $false; me = '$ME'; error = 'simulated: no route to hub' } }

try {
    Write-Host '=== no mail never rings ==='
    Reset-Doorbell
    $r = Ring @((OkReply @() 0)) @('-MaxPolls', '3')
    Check 'empty inbox -> lease exit (10), not a ring'   $r.Code 10
    $hb = Get-Content (Join-Path $rt 'doorbell-heartbeat.json') -Raw | ConvertFrom-Json
    Check 'heartbeat written'                             ($hb.pid -gt 0) 'True'
    Check 'heartbeat carries the script hash'             ($hb.scriptSha256 -eq (Get-FileHash $bell -Algorithm SHA256).Hash.ToLower()) 'True'
    Check 'heartbeat records the last poll as ok'         $hb.lastPollOk 'True'
    # The first live run (2026-10-08) exited after ONE poll with lastPollOk=null:
    # the heartbeat was written before the poll and never after.
    Reset-Doorbell
    $r = Ring @((OkReply @() 0)) @('-MaxPolls', '1')
    $hb = Get-Content (Join-Path $rt 'doorbell-heartbeat.json') -Raw | ConvertFrom-Json
    Check 'one poll -> heartbeat already shows it'        $hb.lastPollOk 'True'

    Write-Host '=== new mail rings, once ==='
    Reset-Doorbell
    $r = Ring @((OkReply @('m1') 1)) @('-MaxPolls', '3')
    Check 'unread m1 -> RING (0)'                         $r.Code 0
    Check 'and says how many'                             ($r.Out -match 'DOORBELL: 1 new') 'True'
    $r = Ring @((OkReply @('m1') 1)) @('-MaxPolls', '3')
    Check 're-arm, m1 still unread -> no second ring'     $r.Code 10
    $r = Ring @((OkReply @('m1', 'm2') 2)) @('-MaxPolls', '3')
    Check 'm2 arrives -> RING again'                      $r.Code 0
    Check 'and only m2 is new'                            ($r.Out -match 'DOORBELL: 1 new') 'True'

    Write-Host '=== page cap: total rises with no new visible id ==='
    Reset-Doorbell
    $five = @('a', 'b', 'c', 'd', 'e')
    $r = Ring @((OkReply $five 5)) @('-MaxPolls', '2')
    Check 'five unread -> RING'                           $r.Code 0
    $r = Ring @((OkReply $five 6 $true)) @('-MaxPolls', '2')
    Check '6th message hidden by the page cap -> RING'    $r.Code 0
    Check 'and it mentions the page'                      ($r.Out -match '5 per page') 'True'
    $r = Ring @((OkReply $five 6 $true)) @('-MaxPolls', '2')
    Check 'same total again -> no ring'                   $r.Code 10

    Write-Host '=== total falls (mail read), then rises back ==='
    $r = Ring @((OkReply @() 0), (OkReply @() 0)) @('-MaxPolls', '2')
    Check 'all read -> no ring'                           $r.Code 10
    $r = Ring @((OkReply @('a') 1)) @('-MaxPolls', '2')
    Check 'an old id comes back unread -> RING on the total' $r.Code 0

    Write-Host '=== could not look is NOT no mail ==='
    Reset-Doorbell
    $r = Ring @($down) @('-MaxPolls', '10')
    Check 'hub down 3 polls -> HUB UNREACHABLE (3)'       $r.Code 3
    Check 'and it says it is not no-mail'                 ($r.Out -match 'NOT no-mail') 'True'
    $since = if ($r.Out -match 'since (\S+?):') { $Matches[1] } else { '' }
    $hb = Get-Content (Join-Path $rt 'doorbell-heartbeat.json') -Raw | ConvertFrom-Json
    Check 'heartbeat records the last poll as NOT ok'     ([string]$hb.lastPollOk) ''
    $r = Ring @($down) @('-MaxPolls', '6', '-HubDownSince', $since)
    Check 're-armed during the SAME outage -> no second HUB ring' $r.Code 10
    $r = Ring @((OkReply @() 0), $down, $down, $down) @('-MaxPolls', '6', '-HubDownSince', $since)
    Check 'recovery, then a NEW outage -> rings again (3)' $r.Code 3
    $r = Ring @($down, $down, (OkReply @() 0)) @('-MaxPolls', '4')
    Check 'control: 2 failures then the hub answers -> no HUB ring' $r.Code 10

    Write-Host '=== wrong mailbox is could-not-look ==='
    Reset-Doorbell
    $r = Ring @(@{ exit = 0; out = @{ ok = $true; me = 'Lodestone-8ec9'; total_unread = 4; ids = @('x'); more_unread = $false; page_size = 1 } }) @('-MaxPolls', '5')
    Check "another mind's inbox -> never a ring, HUB (3)" $r.Code 3

    Write-Host '=== keepalive only ==='
    Reset-Doorbell
    $r = Ring @((OkReply @('m9') 1)) @('-NoPoll', '-LeaseMin', '0')
    Check '-NoPoll never rings, even with mail waiting'   $r.Code 10

    Write-Host '=== bad identity ==='
    $out = & powershell -NoProfile -ExecutionPolicy Bypass -File $bell -InstanceId 'Nobody-0000' -PollSec 0 -MaxPolls 1 -HacsPy $fake 2>&1 | Out-String
    Check 'unknown instance -> ERROR (2), nothing watched' $LASTEXITCODE 2
} catch {
    # A suite that dies halfway must never read as green (M10).
    $script:fail++
    Write-Host "  FAIL  SUITE ABORTED: $($_.Exception.Message) (line $($_.InvocationInfo.ScriptLineNumber))" -ForegroundColor Red
} finally {
    Remove-Item Env:\FAKE_INBOX_SCENARIO -ErrorAction SilentlyContinue
    Reset-Doorbell
    foreach ($f in $saved.Keys) { [IO.File]::WriteAllBytes((Join-Path $rt $f), $saved[$f]) }
    Remove-Item $scratch -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "  $($script:pass) passed, $($script:fail) failed"
exit $(if ($script:fail -eq 0) { 0 } else { 1 })
