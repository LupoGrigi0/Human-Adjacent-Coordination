<#
.SYNOPSIS
  Register (or preview) the outside watcher's scheduled task for ONE instance.
  Shows exactly what it would register and changes NOTHING unless -Apply.

.DESCRIPTION
  DOORBELL-DESIGN.md 3.2. Task hacs-ring-watch-<InstanceId>:
    - every 1 minute, indefinitely, starting one minute after registration
    - as the logged-on user, Interactive logon, NO stored password (Lupo's rule),
      Limited run level
    - hidden: wscript //B run-hidden.vbs (no console window, no focus theft)
    - runs the DEPLOYED copy in D:\Lupo\hacs-runtime\bin, never the repo
    - MultipleInstances IgnoreNew, ExecutionTimeLimit 10 min
    - RUNS ON BATTERY. Unlike the credential sentinel: a watcher that stops when
      the laptop is unplugged is not a watcher.
  Limitation, by design and documented in the ship card: nothing runs while
  nobody is logged on, and nothing wakes the box from sleep (RTCWAKE = 0).

  With -Apply it registers, then VERIFIES from outside rather than trusting the
  registration: the task exists with these settings, it actually ran within
  ~2 minutes (LastRunTime / LastTaskResult), and ring-watch-status.json was
  freshly written by that run.

  Approved by Lupo 2026-10-05 (approval #2), test instances first; Lodestone
  only after a live relaunch test passes. Alerts (-AlertTo) default to none, so
  a test fixture can never message a real mind.

  Undo:  Unregister-ScheduledTask -TaskName hacs-ring-watch-<InstanceId> -Confirm:$false

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

$name   = "hacs-ring-watch-$InstanceId"
$vbs    = Join-Path $BinDir 'run-hidden.vbs'
$script = Join-Path $BinDir 'ring-watch.ps1'
foreach ($f in $vbs, $script, (Join-Path $BinDir 'lib\HacsHarness.psm1')) {
    if (-not (Test-Path $f)) { throw "not deployed: $f (run deploy.ps1 first)" }
}
$argLine = "//B //Nologo `"$vbs`" `"$script`" -InstanceId $InstanceId"
if ($AlertTo.Count -gt 0) { $argLine += " -AlertTo $($AlertTo -join ',')" }

$action    = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument $argLine
$trigger   = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1)
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
$settings  = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 10) `
                 -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

Write-Output "TASK      $name"
Write-Output "RUNS      wscript.exe $argLine"
Write-Output "EVERY     1 minute, from $((Get-Date).AddMinutes(1).ToString('HH:mm')), indefinitely"
Write-Output "AS        $env:USERNAME, Interactive (no stored password), Limited"
Write-Output "SETTINGS  IgnoreNew; 10 min limit; runs on battery; StartWhenAvailable"
Write-Output "ALERTS    $(if ($AlertTo.Count) { $AlertTo -join ', ' } else { 'none (local ring-alerts.jsonl only)' })"
Write-Output "UNDO      Unregister-ScheduledTask -TaskName $name -Confirm:`$false"
if (-not $Apply) { Write-Output 'PREVIEW ONLY: nothing was registered. Re-run with -Apply.'; exit 0 }

if (Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue) { throw "$name already exists; unregister it first, or leave it" }
$null = Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Principal $principal -Settings $settings `
            -Description "HACS outside doorbell watcher for $InstanceId (Lodestone, DOORBELL-DESIGN 3.2). Undo: Unregister-ScheduledTask $name"

# VERIFY FROM OUTSIDE: registered is not running.
$t = Get-ScheduledTask -TaskName $name
$rep = $t.Triggers[0].Repetition
Write-Output "REGISTERED  state=$($t.State) interval=$($rep.Interval) duration='$($rep.Duration)' battery-ok=$(-not $t.Settings.DisallowStartIfOnBatteries)"
$status = Join-Path "D:\Lupo\hacs-runtime\$InstanceId" 'ring-watch-status.json'
$since = Get-Date
$deadline = $since.AddSeconds(150)
do {
    Start-Sleep -Seconds 10
    $info = Get-ScheduledTaskInfo -TaskName $name
    $fresh = (Test-Path $status) -and ((Get-Item $status).LastWriteTime -gt $since)
} while ((Get-Date) -lt $deadline -and -not ($fresh -and $info.LastRunTime -gt $since))
if ($fresh -and $info.LastRunTime -gt $since) {
    $st = Get-Content $status -Raw | ConvertFrom-Json
    Write-Output "VERIFIED  ran at $($info.LastRunTime) (LastTaskResult $($info.LastTaskResult)); status: $($st.end) / $($st.status)"
    exit 0
}
Write-Output "NOT VERIFIED within 150 s: LastRunTime=$($info.LastRunTime) LastTaskResult=$($info.LastTaskResult) statusFresh=$fresh. The task exists but has not been SEEN to run; check it before trusting it."
exit 1
