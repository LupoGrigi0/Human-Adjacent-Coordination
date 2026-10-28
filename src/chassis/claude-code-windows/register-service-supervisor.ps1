<#
.SYNOPSIS
  Register a logon task that runs service-supervisor.ps1 (web bridge + session mirror).
  Shows exactly what it would register and changes NOTHING unless -Apply.

.DESCRIPTION
  Trigger: at logon of the current user, 1 minute delay (network, tailscale and D: up).
  Runs hidden via run-hidden.vbs, no stored password (Interactive logon), no time limit,
  ignores a second start, keeps running on battery. The supervisor itself is idempotent
  and holds a per-instance mutex, so a stray manual run beside the task is harmless.
  Undo: Unregister-ScheduledTask -TaskName hacs-services-<InstanceId> -Confirm:$false

.NOTES
  Author: Lodestone <lodestone@smoothcurves.nexus> / Collaborator: Lupo
#>
param(
    [string] $InstanceId = 'Lodestone-8ec9',
    [string] $BinDir     = 'D:\Lupo\hacs-runtime\bin',
    [switch] $Apply,
    [switch] $StartNow
)
$ErrorActionPreference = 'Stop'
$name    = "hacs-services-$InstanceId"
$vbs     = Join-Path $BinDir 'run-hidden.vbs'
$script  = Join-Path $BinDir 'service-supervisor.ps1'
foreach ($p in @($vbs, $script)) { if (-not (Test-Path $p)) { throw "missing $p -- run deploy.ps1 first" } }

$argLine   = "//B //Nologo `"$vbs`" `"$script`" -InstanceId $InstanceId"
$action    = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument $argLine
$trigger   = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$trigger.Delay = 'PT1M'
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
$settings  = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) `
                 -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)

Write-Output "TASK     $name"
Write-Output "TRIGGER  at logon of $env:USERNAME, delay 1 min"
Write-Output "RUNS     wscript.exe $argLine"
Write-Output "AS       $env:USERNAME, Interactive (no stored password), Limited (not elevated)"
Write-Output "LIMITS   no time limit; ignore a second start; runs on battery; restart x3 on failure"
Write-Output "UNDO     Unregister-ScheduledTask -TaskName $name -Confirm:`$false"
if (-not $Apply) { Write-Output 'PREVIEW ONLY: nothing was registered. Re-run with -Apply.'; exit 0 }

if (Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue) { throw "$name already exists; unregister it first, or leave it" }
$null = Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Principal $principal -Settings $settings `
            -Description "Keeps $InstanceId's web bridge and session mirror running outside its Claude session. Lodestone, approved by Lupo 2026-10-27."
$t = Get-ScheduledTask -TaskName $name      # verify from outside, not from our own return value
Write-Output "REGISTERED  state=$($t.State) trigger=$($t.Triggers[0].CimClass.CimClassName) delay=$($t.Triggers[0].Delay) timelimit=$($t.Settings.ExecutionTimeLimit)"
if ($StartNow) { Start-ScheduledTask -TaskName $name; Write-Output 'STARTED now (supervisor finds both ports up and leaves them alone, or starts what is missing)' }
