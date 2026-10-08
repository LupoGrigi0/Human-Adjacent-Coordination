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

$armedAt    = Get-Date
$leaseUntil = $armedAt.AddMinutes($LeaseMin)
$fails      = 0
$failSince  = $null
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
            $recovered = $true; $fails = 0; $failSince = $null
            $lastOk = $true; $lastTotal = $r.TotalUnread
            $ledger = Read-Ledger
            $new = @($r.VisibleIds | Where-Object { $ledger.seen -notcontains $_ })
            if ($new.Count -gt 0 -or $r.TotalUnread -gt $ledger.lastTotal) {
                $ledger.seen = @($ledger.seen + $new | Select-Object -Last 500)
                $ledger.lastTotal = $r.TotalUnread
                Write-Atomic $ledgerFile @{ seen = $ledger.seen; lastTotal = $ledger.lastTotal; by = 'inner'; at = (Get-Date).ToString('o') }
                Write-Atomic $stateFile  @{ state = 'fired'; ids = $new; total = $r.TotalUnread; at = (Get-Date).ToString('o') }
                Write-HacsLog -Instance $inst -Log 'doorbell.log' -Message "RING new=$($new.Count) total=$($r.TotalUnread) ids=$($new -join ',')"
                $page = if ($r.MoreUnread) { '; the server shows 5 per page, so read, then run inbox again' } else { '' }
                Write-Output "DOORBELL: $($new.Count) new (total unread $($r.TotalUnread)$page) -- run hacs.py inbox"
                exit 0
            }
            if ($r.TotalUnread -ne $ledger.lastTotal) {
                # Mail was read: let lastTotal follow DOWN, or new mail that brings
                # the total back to its old value would never ring.
                Write-Atomic $ledgerFile @{ seen = $ledger.seen; lastTotal = $r.TotalUnread; by = 'inner'; at = (Get-Date).ToString('o') }
            }
        } else {
            $lastOk = $null
            $fails++
            if (-not $failSince) { $failSince = Get-Date }
            if ($fails -eq 1) { Write-HacsLog -Instance $inst -Log 'doorbell.log' -Message "could not look: $($r.Error)" }
            if ($fails -ge $HubDownPolls -and $recovered) {
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
    if ((Get-Date) -ge $leaseUntil -or ($MaxPolls -gt 0 -and $polls -ge $MaxPolls)) {
        Write-HacsLog -Instance $inst -Log 'doorbell.log' -Message "LEASE EXPIRED after $polls polls"
        Write-Output "LEASE EXPIRED: re-arm the doorbell (no new mail since it was armed; last poll ok=$lastOk, unread=$lastTotal)"
        exit 10
    }
    Start-Sleep -Seconds $PollSec
}
