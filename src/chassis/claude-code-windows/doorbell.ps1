<#
.SYNOPSIS
  The inner doorbell: keeps a background mind awake (M5) and wakes it when HACS
  mail arrives (M6). Runs INSIDE the mind's own session as a background task.

.DESCRIPTION
  DOORBELL-DESIGN.md 3.1. Started by the mind itself with run_in_background and
  timeout 7200000 (the 2 h cap since Claude Code 2.1.285). Its EXIT is the ring:
  Claude Code wakes the session with a task notification, the mind reads its
  inbox, handles it, and re-arms this script in the same turn.

  Every poll (default 45 s) it:
    1. writes doorbell-heartbeat.json, so something OUTSIDE can tell whether this
       loop is alive (the loop is the component under test; it is never its own
       witness);
    2. calls Get-HacsInbox (hacs.py inbox --json);
    3. rings if any visible unread id is not yet in the ledger, OR the unread
       total rose above the ledger's lastTotal. The total check is the page-cap
       case: the server shows 5 per page, so a 6th message has no visible id.

  Exits, and what each one means (none of them is "no mail"):
     0  RING      new mail; the ids are claimed in the ledger so a re-arm does not
                  ring again for mail the mind chose not to read yet
     3  HUB       10 consecutive polls could not look. "Could not look" is NOT
                  "no mail". Re-arm with -HubDownSince <the time printed>, and this
                  outage will not ring again; a recovery then a new outage will.
    10  LEASE     the lease ran out (default 110 min, under the 2 h cap). Re-arm.
     2  ERROR     bad arguments or identity; nothing was watched.

  It never exits for "no mail". -NoPoll is keepalive only.

  NEVER WAKE A MIND THAT CANNOT THINK. An exit is only worth anything if the mind
  can take a turn, and a turn needs the model API. On 2026-11-01 the house lost its
  internet: this exited 3, the turn it woke died on "API Error: Can't reach the API
  server (ENOTFOUND)", the notification was spent, and nothing re-armed it for 15 h.
  So every exit is gated on a TCP connect to -ApiHost:443 (no credentials, ~0 cost):
    - hub unreachable AND API unreachable: no exit 3. Ride the outage out, polling.
    - a ring or a lease end while the API is unreachable: HELD, keep polling, and
      exit the moment the API answers -- or at -HardStopMin (just under the 2 h cap,
      which would kill us anyway), logged as a HARD STOP that may be lost.
  Reachable is not "the turn will succeed" (auth, a 5xx); it is only "the network
  path exists". An outage longer than the lease is covered from OUTSIDE (ring-watch),
  never from in here.

.NOTES
  Author: Lodestone <lodestone@smoothcurves.nexus>
  Collaborator: Lupo
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string] $InstanceId,
    [int]    $PollSec = 45,
    [int]    $LeaseMin = 110,
    [int]    $HubDownPolls = 10,
    [string] $HubDownSince,
    [switch] $NoPoll,
    [string] $HacsPy = 'D:\Lupo\Source\AI\instance-archaeology\src\hacs\hacs.py',
    [string] $Python = 'python',
    [int]    $HardStopMin = 118,        # a held exit gives up here: never past the 2 h background cap
    [string] $ApiHost = 'api.anthropic.com',
    [string] $SimulateApi = '',         # tests only: 'up,down,...' one per probe, the last repeats
    [int]    $MaxPolls = 0      # tests only: stop after N polls with exit 10, as if the lease ran out
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

trap {
    Write-Output "DOORBELL ERROR: $($_.Exception.Message) (doorbell.ps1 line $($_.InvocationInfo.ScriptLineNumber)). Nothing is being watched."
    exit 2
}

Import-Module (Join-Path $PSScriptRoot 'lib\HacsHarness.psm1') -Force
$inst = Get-HacsInstance -InstanceId $InstanceId
$null = New-Item -ItemType Directory -Force -Path $inst.RuntimeDir -ErrorAction SilentlyContinue

$hbFile     = Join-Path $inst.RuntimeDir 'doorbell-heartbeat.json'
$ledgerFile = Join-Path $inst.RuntimeDir 'doorbell-ledger.json'
$stateFile  = Join-Path $inst.RuntimeDir 'doorbell-state.json'
$selfSha    = (Get-FileHash $PSCommandPath -Algorithm SHA256).Hash.ToLower()

function Write-Atomic([string] $path, $obj) {
    # Temp file then rename: a reader never sees half a file.
    $tmp = "$path.tmp-$PID"
    [IO.File]::WriteAllText($tmp, ($obj | ConvertTo-Json -Depth 5 -Compress))
    Move-Item -LiteralPath $tmp -Destination $path -Force
}

function Read-Ledger {
    if (Test-Path $ledgerFile) {
        try {
            $l = Get-Content $ledgerFile -Raw | ConvertFrom-Json
            return @{ seen = @($l.seen | ForEach-Object { [string]$_ }); lastTotal = [int]$l.lastTotal }
        } catch {
            # An unreadable ledger must not swallow mail: start empty, which can
            # only make the doorbell ring MORE, never less.
            Write-HacsLog -Instance $inst -Log 'doorbell.log' -Message "ledger unreadable, starting empty: $($_.Exception.Message)"
        }
    }
    @{ seen = @(); lastTotal = 0 }
}

$apiSim = @()
if ($SimulateApi) {
    $apiSim = @($SimulateApi -split ',' | ForEach-Object { $_.Trim() })
    if (@($apiSim | Where-Object { $_ -notin 'up', 'down' }).Count) { throw "-SimulateApi takes only 'up' and 'down', got '$SimulateApi'" }
}
$script:apiProbes = 0
function Test-ApiReachable {
    # Can a turn reach the model at all? A TCP connect, nothing sent. A DNS failure
    # throws inside Wait() and lands in catch: unresolvable is unreachable.
    if ($apiSim.Count) { $v = $apiSim[[Math]::Min($script:apiProbes, $apiSim.Count - 1)]; $script:apiProbes++; return ($v -eq 'up') }
    $c = New-Object Net.Sockets.TcpClient
    try { return ($c.ConnectAsync($ApiHost, 443).Wait(5000) -and $c.Connected) } catch { return $false } finally { $c.Dispose() }
}

$script:holdSince = $null
$script:forced    = $false
function Test-ExitGate([string] $what) {
    # $true = go ahead and exit. $false = hold: the exit would wake a mind that cannot think.
    if (Test-ApiReachable) {
        if ($script:holdSince) {
            Write-HacsLog -Instance $inst -Log 'doorbell.log' -Message "RELEASED $what -- $ApiHost reachable again (held since $($script:holdSince.ToString('HH:mm:ss')))"
        }
        return $true
    }
    if ($leaseClock.Elapsed.TotalMinutes -ge $HardStopMin) {
        $script:forced = $true
        Write-HacsLog -Instance $inst -Log 'doorbell.log' -Message "HARD STOP $what at ${HardStopMin}m: $ApiHost still unreachable; exiting anyway, and the turn it wakes may fail (ring-watch is the backup)"
        return $true
    }
    if (-not $script:holdSince) {
        $script:holdSince = Get-Date
        Write-HacsLog -Instance $inst -Log 'doorbell.log' -Message "HELD $what -- $ApiHost unreachable; a turn now would fail and spend the notification"
    }
    return $false
}

$armedAt    = Get-Date
$leaseUntil = $armedAt.AddMinutes($LeaseMin)     # for the log/state only -- NOT the clock the lease runs on
# The lease runs on ELAPSED time, never wall-clock. On 2026-11-01 DST fell back, the
# local clock repeated an hour, a Get-Date deadline moved an hour later than the 2 h
# background cap, and Claude Code killed the doorbell instead of it exiting 10.
$leaseClock = [Diagnostics.Stopwatch]::StartNew()
$fails      = 0
$failSince  = $null
$netDown    = $false
$recovered  = -not $HubDownSince      # a re-arm during an outage stays quiet until the hub comes back
$lastOk     = $null
$lastTotal  = $null
$polls      = 0
$lastAlive  = $armedAt

Write-HacsLog -Instance $inst -Log 'doorbell.log' -Message "ARMED pid=$PID lease=${LeaseMin}m poll=${PollSec}s noPoll=$([bool]$NoPoll) hubDownSince=$HubDownSince sha=$($selfSha.Substring(0,16))"

function Write-Heartbeat {
    Write-Atomic $hbFile ([ordered]@{
        provider = 'shell'; instanceId = $InstanceId; pid = $PID; at = (Get-Date).ToString('o')
        armedAt = $armedAt.ToString('o'); leaseUntil = $leaseUntil.ToString('o')
        scriptSha256 = $selfSha; lastPollOk = $script:lastOk; lastTotal = $script:lastTotal; noPoll = [bool]$NoPoll })
}

Write-Heartbeat      # at arm time, before the first poll
while ($true) {
    $now = Get-Date
    if (($now - $lastAlive).TotalMinutes -ge 60) {
        Write-HacsLog -Instance $inst -Log 'doorbell.log' -Message "alive pid=$PID lastPollOk=$lastOk lastTotal=$lastTotal"
        $lastAlive = $now
    }

    if (-not $NoPoll) {
        $r = Get-HacsInbox -Instance $inst -HacsPy $HacsPy -Python $Python
        $polls++
        if ($r.Ok -eq $true) {
            if (-not $recovered) {
                Write-HacsLog -Instance $inst -Log 'doorbell.log' -Message "hub reachable again (it was down since $HubDownSince)"
            }
            if ($netDown) {
                Write-HacsLog -Instance $inst -Log 'doorbell.log' -Message "network back: hub reachable again after riding out an outage since $($failSince.ToUniversalTime().ToString('o'))"
                $netDown = $false
            }
            $recovered = $true; $fails = 0; $failSince = $null
            $lastOk = $true; $lastTotal = $r.TotalUnread
            $ledger = Read-Ledger
            $new = @($r.VisibleIds | Where-Object { $ledger.seen -notcontains $_ })
            # Held: claim nothing, so the next poll finds the same mail and asks again.
            if (($new.Count -gt 0 -or $r.TotalUnread -gt $ledger.lastTotal) -and (Test-ExitGate 'ring')) {
                $ledger.seen = @($ledger.seen + $new | Select-Object -Last 500)
                $ledger.lastTotal = $r.TotalUnread
                Write-Atomic $ledgerFile @{ seen = $ledger.seen; lastTotal = $ledger.lastTotal; by = 'inner'; at = (Get-Date).ToString('o') }
                Write-Atomic $stateFile  @{ state = 'fired'; ids = $new; total = $r.TotalUnread; at = (Get-Date).ToString('o') }
                Write-HacsLog -Instance $inst -Log 'doorbell.log' -Message "RING new=$($new.Count) total=$($r.TotalUnread) ids=$($new -join ',')"
                $page = if ($r.MoreUnread) { '; the server shows 5 per page, so read, then run inbox again' } else { '' }
                Write-Output "DOORBELL: $($new.Count) new (total unread $($r.TotalUnread)$page) -- run hacs.py inbox"
                exit 0
            }
            if ($r.TotalUnread -lt $ledger.lastTotal) {
                # Mail was read: let lastTotal follow DOWN, or new mail that brings
                # the total back to its old value would never ring. DOWN only: a held
                # ring (the total rose, the API was unreachable) must still ring next poll.
                Write-Atomic $ledgerFile @{ seen = $ledger.seen; lastTotal = $r.TotalUnread; by = 'inner'; at = (Get-Date).ToString('o') }
            }
        } else {
            $lastOk = $null
            $fails++
            if (-not $failSince) { $failSince = Get-Date }
            if ($fails -eq 1) { Write-HacsLog -Instance $inst -Log 'doorbell.log' -Message "could not look: $($r.Error)" }
            if ($fails -ge $HubDownPolls -and $recovered -and -not (Test-ApiReachable)) {
                # Hub AND model API unreachable: the network is down, and so is the mind's
                # ability to think. Exiting would spend the notification on a turn that fails.
                if (-not $netDown) {
                    $netDown = $true
                    $since = $failSince.ToUniversalTime().ToString('o')
                    Write-Atomic $stateFile @{ state = 'network-down'; since = $since; error = $r.Error; at = (Get-Date).ToString('o') }
                    Write-HacsLog -Instance $inst -Log 'doorbell.log' -Message "NETWORK DOWN since ${since}: hub and $ApiHost both unreachable; riding it out, not ringing ($($r.Error))"
                }
            } elseif ($fails -ge $HubDownPolls -and $recovered) {
                $since = $failSince.ToUniversalTime().ToString('o')
                Write-Atomic $stateFile @{ state = 'hub-unreachable'; since = $since; error = $r.Error; at = (Get-Date).ToString('o') }
                Write-HacsLog -Instance $inst -Log 'doorbell.log' -Message "HUB UNREACHABLE since $since after $fails polls: $($r.Error)"
                Write-Output "HUB UNREACHABLE since ${since}: could not look, this is NOT no-mail ($($r.Error)). Re-arm with -HubDownSince $since"
                exit 3
            }
        }
    }

    # After the poll, so the file always describes the latest look -- found by the
    # first live run, whose heartbeat still said lastPollOk=null after a good poll.
    Write-Heartbeat
    if (($leaseClock.Elapsed.TotalMinutes -ge $LeaseMin -or ($MaxPolls -gt 0 -and $polls -ge $MaxPolls)) -and (Test-ExitGate 'lease')) {
        Write-HacsLog -Instance $inst -Log 'doorbell.log' -Message "LEASE EXPIRED after $polls polls$(if ($script:forced) { ' (HARD STOP, API unreachable)' })"
        $note = if ($script:forced) { " WARNING: $ApiHost was unreachable at the hard stop -- if you are reading this, it came back" }
                elseif ($script:holdSince) { " (held from $($script:holdSince.ToString('HH:mm:ss')) until the API was reachable)" } else { '' }
        Write-Output "LEASE EXPIRED: re-arm the doorbell (no new mail since it was armed; last poll ok=$lastOk, unread=$lastTotal)$note"
        exit 10
    }
    Start-Sleep -Seconds $PollSec
}
