<#
.SYNOPSIS
  Register (or preview) the two power-event tasks for ONE instance. Shows exactly
  what it would register and changes NOTHING unless -Apply.

.DESCRIPTION
  Lupo's request, 2026-10-05: when the laptop goes away on purpose, tell the alert
  recipients to ignore the gap; when it comes back, say so and how long it was dark.
  power-notice.ps1 does the work; this only wires it to Windows events.

    hacs-power-going-<InstanceId>   on any of (System log):
                                      User32 1074                    restart / power off announced
                                      Microsoft-Windows-Winlogon 7002   sign-out
                                      Microsoft-Windows-Kernel-Power 42 entering sleep
                                    runs: power-notice.ps1 -Event going
                                    BEST EFFORT: a restart leaves ~7 s (measured 2026-10-04)
    hacs-power-back-<InstanceId>    at logon of this user (+1 min, so the network
                                    and D: are up), and on resume
                                    (Microsoft-Windows-Power-Troubleshooter 1, +1 min)
                                    runs: power-notice.ps1 -Event back

  Both: as the logged-on user, Interactive, NO stored password, Limited; hidden via
  run-hidden.vbs; the DEPLOYED copy in -BinDir; run on battery. power-notice.ps1
  sends at most one notice per transition, so overlapping triggers are harmless.

  Limits, by design: nothing runs while nobody is logged on, so a "going" for a
  sign-out may be cut short by the sign-out itself, and an unannounced loss
  (power cut, crash) is never announced. That half is a check on smoothcurves.

  With -Apply: registers, then VERIFIES from outside that both tasks exist with
  their triggers. It cannot prove a notice is sent in time at a real restart; only
  a real restart can, and that test is planned with Lupo.

  Undo:  Unregister-ScheduledTask -TaskName hacs-power-going-<InstanceId> -Confirm:$false
         Unregister-ScheduledTask -TaskName hacs-power-back-<InstanceId> -Confirm:$false

.NOTES
  Author: Lodestone <lodestone@smoothcurves.nexus>
  Collaborator: Lupo
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string] $InstanceId,
    [string[]] $AlertTo = @(),
    [string]   $BinDir = 'D:\Lupo\hacs-runtime\bin',
    [switch]   $Apply
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$AlertTo = @($AlertTo | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim() } | Where-Object { $_ })

$vbs    = Join-Path $BinDir 'run-hidden.vbs'
$script = Join-Path $BinDir 'power-notice.ps1'
foreach ($f in $vbs, $script, (Join-Path $BinDir 'lib\HacsHarness.psm1')) {
    if (-not (Test-Path $f)) { throw "not deployed: $f (run deploy.ps1 first)" }
}
$alertArg = if ($AlertTo.Count) { " -AlertTo $($AlertTo -join ',')" } else { '' }   # power-notice.ps1 splits it back

$evClass = Get-CimClass -Namespace 'Root/Microsoft/Windows/TaskScheduler' -ClassName 'MSFT_TaskEventTrigger'
function New-EventTrigger([string] $provider, [int] $id, [string] $delay = $null) {
    $xml = "<QueryList><Query Id=`"0`" Path=`"System`"><Select Path=`"System`">*[System[Provider[@Name='$provider'] and EventID=$id]]</Select></Query></QueryList>"
    $t = New-CimInstance -CimClass $evClass -ClientOnly
    $t.Enabled = $true
    $t.Subscription = $xml
    if ($delay) { $t.Delay = $delay }
    $t
}

$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
$plan = @(
    [pscustomobject]@{
        Name = "hacs-power-going-$InstanceId"; Event = 'going'
        Triggers = @((New-EventTrigger 'User32' 1074), (New-EventTrigger 'Microsoft-Windows-Winlogon' 7002), (New-EventTrigger 'Microsoft-Windows-Kernel-Power' 42))
        When = 'System events User32 1074 (restart/power off), Winlogon 7002 (sign-out), Kernel-Power 42 (sleep)'
        Limit = (New-TimeSpan -Minutes 2)
        # NOT StartWhenAvailable: a missed "going" run late (e.g. at the next boot)
        # would announce an absence that is already over.
        Late = $false
    }
    [pscustomobject]@{
        Name = "hacs-power-back-$InstanceId"; Event = 'back'
        Triggers = @($(
            $l = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME; $l.Delay = 'PT1M'; $l
            New-EventTrigger 'Microsoft-Windows-Power-Troubleshooter' 1 'PT1M'))
        When = "logon of $env:USERNAME (+1 min); resume, Power-Troubleshooter 1 (+1 min)"
        Limit = (New-TimeSpan -Minutes 5)
        Late = $true    # a late "back" is still true
    }
)

foreach ($p in $plan) {
    $argLine = "//B //Nologo `"$vbs`" `"$script`" -InstanceId $InstanceId -Event $($p.Event)$alertArg"
    Write-Output "TASK      $($p.Name)"
    Write-Output "RUNS      wscript.exe $argLine"
    Write-Output "WHEN      $($p.When)"
    Write-Output "AS        $env:USERNAME, Interactive (no stored password), Limited"
    Write-Output "SETTINGS  IgnoreNew; $([int]$p.Limit.TotalMinutes) min limit; runs on battery; $(if ($p.Late) { 'StartWhenAvailable' } else { 'never run late' })"
    Write-Output "ALERTS    $(if ($AlertTo.Count) { $AlertTo -join ', ' } else { 'none (local power-notices.jsonl only)' })"
    Write-Output "UNDO      Unregister-ScheduledTask -TaskName $($p.Name) -Confirm:`$false"
    Write-Output ''
}
if (-not $Apply) { Write-Output 'PREVIEW ONLY: nothing was registered. Re-run with -Apply.'; exit 0 }

foreach ($p in $plan) {
    if (Get-ScheduledTask -TaskName $p.Name -ErrorAction SilentlyContinue) { throw "$($p.Name) already exists; unregister it first, or leave it" }
}
foreach ($p in $plan) {
    $argLine = "//B //Nologo `"$vbs`" `"$script`" -InstanceId $InstanceId -Event $($p.Event)$alertArg"
    $action   = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument $argLine
    $settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit $p.Limit `
                    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable:$p.Late
    $null = Register-ScheduledTask -TaskName $p.Name -Action $action -Trigger $p.Triggers -Principal $principal -Settings $settings `
                -Description "HACS power notice ($($p.Event)) for $InstanceId (Lodestone). Undo: Unregister-ScheduledTask $($p.Name)"
}

# VERIFY FROM OUTSIDE: registered is not the same as wired.
$bad = 0
foreach ($p in $plan) {
    $t = Get-ScheduledTask -TaskName $p.Name -ErrorAction SilentlyContinue
    if (-not $t) { Write-Output "NOT REGISTERED  $($p.Name)"; $bad++; continue }
    $n = @($t.Triggers).Count
    $ok = $n -eq @($p.Triggers).Count -and $t.Actions[0].Arguments -match "-Event $($p.Event)"
    Write-Output ("{0,-14} {1}  state={2} triggers={3}" -f $(if ($ok) { 'REGISTERED' } else { 'MISMATCH' }), $p.Name, $t.State, $n)
    if (-not $ok) { $bad++ }
}
Write-Output 'NOT YET PROVEN: that a notice reaches the hub before a real restart completes. Only a real restart proves that.'
exit $(if ($bad) { 1 } else { 0 })
