<#
.SYNOPSIS
  Keep an instance's web bridge and session mirror running, OUTSIDE its Claude session.

.DESCRIPTION
  Inside a --bg session these are background shells, capped at 2 h by Claude Code, so the
  mind spent a turn (and a slice of context) restarting each one every two hours -- a
  repeating pattern that, as Lupo put it, can push a model into its own kind of loop.
  Out here they are ordinary processes: started at logon by a scheduled task, checked
  every -IntervalSec, restarted only if their port is not listening.

  It never kills anything. A port that is already held (say, by an in-session copy) is
  simply "up" and left alone -- so it can run alongside the old arrangement during the
  switch, and starting it twice is harmless (a named mutex keeps one supervisor per instance).

  The doorbell is NOT here, on purpose: its exit is what wakes the mind, so it must stay
  a child of the session.

.PARAMETER Once
  One check-and-repair pass, then exit (tests, and a manual "fix it now").

.NOTES
  Author: Lodestone <lodestone@smoothcurves.nexus> / Collaborator: Lupo
#>
[CmdletBinding()]
param(
    [string] $InstanceId   = 'Lodestone-8ec9',
    [int]    $IntervalSec  = 60,
    [switch] $Once,
    [string] $RuntimeRoot  = 'D:\Lupo\hacs-runtime',
    [string] $Node         = 'node',
    [string] $BridgeScript = 'D:\Lupo\Source\AI\Human-Adjacent-Coordination\src\chassis\claude-code-windows\web-bridge\bridge.mjs',
    [string] $BridgeDir    = 'D:\Lupo\hacs-runtime\_web-bridge',
    [int]    $BridgePort   = 22091,
    [string] $MirrorStart  = 'D:\Lupo\Source\AI\claude-session-mirror\bin\mirror-start.ps1',
    [string] $MirrorHome   = 'D:\Lupo\Source\AI\claude-session-mirror',
    [string] $IdentityFile = 'D:\Lupo\Source\AI\hacs-instances\Lodestone-8ec9\.hacs-identity',
    [int]    $MirrorPort   = 22090,
    [switch] $NoBridge,
    [switch] $NoMirror
)
$ErrorActionPreference = 'Stop'
$rt  = Join-Path $RuntimeRoot $InstanceId
$log = Join-Path $rt 'service-supervisor.log'
$status = Join-Path $rt 'service-supervisor.status.json'
if (-not (Test-Path $rt)) { $null = New-Item -ItemType Directory -Force -Path $rt }

function Log([string] $m) {
    try { Add-Content -Path $log -Value ('{0}  {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $m) -Encoding utf8 } catch { }
}
function Test-Listening([int] $port) {
    # Ask the OS who is LISTENING, not whether a connect succeeds: a connect can fail for
    # reasons that are not "down" (tailscale address not up yet, firewall), and then we
    # would start a second copy that cannot bind either.
    $c = @(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)
    return ($c.Count -gt 0)
}

# One supervisor per instance. A second start (task re-trigger, manual run) exits quietly.
$mutex = New-Object System.Threading.Mutex($false, "Local\hacs-service-supervisor-$InstanceId")
if (-not $mutex.WaitOne(0)) { Log 'another supervisor holds the lock; exiting'; exit 0 }

$restarts = @{ bridge = 0; mirror = 0 }
$recent   = New-Object System.Collections.Generic.List[datetime]
Log "start (pid $PID, interval ${IntervalSec}s, once=$([bool]$Once))"

try {
    do {
        $now = Get-Date
        # Back off if something is crash-looping: more than 6 restarts in 15 minutes means
        # restarting is not fixing it, and hammering it only fills the log.
        while ($recent.Count -and ($now - $recent[0]).TotalMinutes -gt 15) { $recent.RemoveAt(0) }
        $backoff = $recent.Count -ge 6

        $state = [ordered]@{ at = $now.ToString('o'); pid = $PID; bridge = 'disabled'; mirror = 'disabled'; backoff = $backoff; restarts = $restarts }

        if (-not $NoBridge) {
            if (Test-Listening $BridgePort) { $state.bridge = 'up' }
            elseif ($backoff) { $state.bridge = 'DOWN (backing off)' }
            else {
                Log "bridge: port $BridgePort not listening -> starting"
                $out = Join-Path $rt 'web-bridge.stdout.log'; $err = Join-Path $rt 'web-bridge.stderr.log'
                $null = Start-Process -FilePath $Node -ArgumentList "`"$BridgeScript`"" -WorkingDirectory $BridgeDir `
                        -WindowStyle Hidden -RedirectStandardOutput $out -RedirectStandardError $err -PassThru
                $restarts.bridge++; $recent.Add($now); $state.bridge = 'started'
            }
        }
        if (-not $NoMirror) {
            if (Test-Listening $MirrorPort) { $state.mirror = 'up' }
            elseif ($backoff) { $state.mirror = 'DOWN (backing off)' }
            else {
                Log "mirror: port $MirrorPort not listening -> starting"
                $env:MIRROR_DATA_DIR = Join-Path $rt 'mirror-data'      # inherited by the child
                $args = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$MirrorStart`"",
                          '-IdentityFile', "`"$IdentityFile`"", '-MirrorHome', "`"$MirrorHome`"",
                          '-Port', $MirrorPort, '-WithInput', '-WithUploads')
                $out = Join-Path $rt 'mirror.stdout.log'; $err = Join-Path $rt 'mirror.stderr.log'
                $null = Start-Process -FilePath 'powershell.exe' -ArgumentList $args -WindowStyle Hidden `
                        -RedirectStandardOutput $out -RedirectStandardError $err -PassThru
                $restarts.mirror++; $recent.Add($now); $state.mirror = 'started'
            }
        }
        if ($backoff) { Log 'BACKING OFF: >6 restarts in 15 min; not restarting until the window clears' }
        try { $state | ConvertTo-Json | Set-Content -Path $status -Encoding utf8 } catch { }
        if (-not $Once) { Start-Sleep -Seconds $IntervalSec }
    } while (-not $Once)
} finally {
    $mutex.ReleaseMutex(); $mutex.Dispose()
    Log 'stop'
}
