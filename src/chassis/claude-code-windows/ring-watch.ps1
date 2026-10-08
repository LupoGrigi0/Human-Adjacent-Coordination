<#
.SYNOPSIS
  The outside watcher: one tick of the ring state machine for ONE instance.
  Runs OUTSIDE the mind (a scheduled task, every minute), so it can see what
  the mind's own doorbell cannot: that the mind is not home, or not hearing.

.DESCRIPTION
  DOORBELL-DESIGN.md section 4, v1. Each tick, in order:

    S0 LOCK      the per-instance ring lock (another tick holding it -> BUSY)
    S1 SELF      own + module hash vs DEPLOYED.md when running from bin (drift caps at degraded)
    S2 MAIL      Get-HacsInbox. Could not look -> mail UNKNOWN (never "no mail").
                 New = a visible unread id not in the doorbell ledger, or the
                 unread total above the ledger's lastTotal. Ids under backoff are dropped.
    S3 TRIAGE    no new mail: act only if the doorbell rang and was ignored for
                 5 min, the doorbell heartbeat is stale while the mind should be
                 awake, or this is a logon tick. Otherwise IDLE -- and no claude.exe
                 is started (presence costs one).
    S4 PRESENCE  Get-HacsPresence. UNKNOWN, ATTENDED, TRANSITIONING never act.
                 HOME + new mail within the grace period -> the inner doorbell will
                 ring it; after the grace, ring from outside.
                 NOT_HOME + new mail (or logon, desired awake) -> relaunch.
                 NOT_HOME + mail unknown -> do not launch on no evidence.
                 Landed by a human + new mail -> HELD, alert once per id.
    S5 RELAUNCH  never with a fork latch, never more than 3 per rolling hour,
                 never within 5 min of the last attempt. lastLaunchAt is written
                 BEFORE the call. launch.ps1 re-checks presence under its own lock.
                 forked -> latch + alert. Credential dead -> CANNOT_THINK.
    S6 RING      Invoke-HacsRing (integers + name + word nonce only).
    S7 RECORD    rung ids are claimed in the doorbell ledger (by: watcher) with
                 the verdict, and backed off by verdict.

  Every END emits exactly one New-HacsResult (exit 0 success / 1 degraded /
  2 error) and overwrites ring-watch-status.json; actions append to
  ring-ledger.jsonl (append-only). -WhatIf computes the whole tick and reports
  the action it WOULD take, and changes nothing: no launch, no ring, no
  ledger, backoff or history writes.

  Alerts go to ring-alerts.jsonl in the runtime dir always, and as a HACS
  message only to -AlertTo recipients (none by default, so a test fixture can
  never message a real mind). Every alert names what failed and never guesses
  why: "dark, cause unknown" is the contract Axiom asked for.

.NOTES
  Author: Lodestone <lodestone@smoothcurves.nexus>
  Collaborator: Lupo
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string] $InstanceId,
    [ValidateSet('tick', 'logon')][string] $Reason = 'tick',
    [switch]   $WhatIf,
    [string[]] $AlertTo = @(),
    [string]   $HacsPy = 'D:\Lupo\Source\AI\instance-archaeology\src\hacs\hacs.py',
    [string]   $Python = 'python',
    [string]   $LaunchScript,
    [int]      $GraceSec = 120,
    [int]      $HeartbeatStaleSec = 180,
    [int]      $IgnoredMin = 5
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$script:lock = $null

trap {
    $why = "UNHANDLED: $($_.Exception.Message) (ring-watch.ps1 line $($_.InvocationInfo.ScriptLineNumber))"
    try { if ($script:lock) { Unlock-HacsInstance $script:lock } } catch { }
    try { (New-HacsResult -Status 'error' -InstanceId $InstanceId -HearingNotApplicable -Message $why -Extra @{ end = 'ERROR' }) | Write-HacsResult }
    catch { [pscustomobject]@{ status = 'error'; instanceId = $InstanceId; message = $why } | ConvertTo-Json -Compress }
    exit 2
}

Import-Module (Join-Path $PSScriptRoot 'lib\HacsHarness.psm1') -Force
if (-not $LaunchScript) { $LaunchScript = Join-Path $PSScriptRoot 'launch.ps1' }
$inst = Get-HacsInstance -InstanceId $InstanceId
$rt = $inst.RuntimeDir
$null = New-Item -ItemType Directory -Force -Path $rt -ErrorAction SilentlyContinue
$P = @{
    status   = Join-Path $rt 'ring-watch-status.json'
    ledger   = Join-Path $rt 'doorbell-ledger.json'
    bellHb   = Join-Path $rt 'doorbell-heartbeat.json'
    bellSt   = Join-Path $rt 'doorbell-state.json'
    audit    = Join-Path $rt 'ring-ledger.jsonl'
    alerts   = Join-Path $rt 'ring-alerts.jsonl'
    desired  = Join-Path $rt '.desired-state'
    latch    = Join-Path $rt '.relaunch-latch'
    history  = Join-Path $rt 'relaunch-history.jsonl'
    backoff  = Join-Path $rt 'ring-backoff.json'
    seen     = Join-Path $rt 'ring-watch-seen.json'
    lastLaunch = Join-Path $rt '.last-launch-at'
}
$now = Get-Date
$facts = [ordered]@{ reason = $Reason; whatIf = [bool]$WhatIf }

function Read-Json([string] $path) {
    if (-not (Test-Path $path)) { return $null }
    try { Get-Content $path -Raw | ConvertFrom-Json } catch { $null }
}
function Write-Atomic([string] $path, $obj) {
    $tmp = "$path.tmp-$PID"
    [IO.File]::WriteAllText($tmp, ($obj | ConvertTo-Json -Depth 6 -Compress))
    Move-Item -LiteralPath $tmp -Destination $path -Force
}
function Add-Line([string] $path, $obj) {
    [IO.File]::AppendAllText($path, (($obj | ConvertTo-Json -Depth 6 -Compress) + "`n"))
}
function Send-Alert([string] $kind, [string] $text) {
    $a = [ordered]@{ at = (Get-Date).ToString('o'); instanceId = $InstanceId; kind = $kind; text = $text; to = $AlertTo }
    $facts.alert = "$kind -- $text"
    if ($WhatIf) { return }
    Add-Line $P.alerts $a
    # The body goes as an ARGUMENT: Invoke-HacsNative gives every child an empty
    # stdin, so `send -` would send nothing. Double quotes and dollar signs are
    # stripped: the hub's send_stanza breaks on them (Lantern, 2026-10-07).
    $body = ("ring-watch on $env:COMPUTERNAME, ${InstanceId}: $kind. $text " +
             'Cause not diagnosed; this reports what was observed, nothing more.') -replace '["$]', "'"
    foreach ($to in $AlertTo) {
        $saved = $env:PYTHONIOENCODING
        try {
            $env:PYTHONIOENCODING = 'utf-8'
            $n = Invoke-HacsNative -FilePath $Python -Arguments @($HacsPy, 'send', $to, "ring-watch: $InstanceId $kind", $body) -TimeoutSec 60
            if ($n.ExitCode -ne 0) { Add-Line $P.alerts @{ at = (Get-Date).ToString('o'); kind = 'ALERT-SEND-FAILED'; to = $to; error = "hacs.py send exited $($n.ExitCode)" } }
        } catch { Add-Line $P.alerts @{ at = (Get-Date).ToString('o'); kind = 'ALERT-SEND-FAILED'; to = $to; error = $_.Exception.Message } }
        finally { $env:PYTHONIOENCODING = $saved }
    }
}
function End-Tick([string] $end, [string] $status, [string] $msg, $hearing = 'n/a', [switch] $Acted) {
    $facts.end = $end
    $extra = @{}; foreach ($k in $facts.Keys) { $extra[$k] = $facts[$k] }
    # NOT `$hearing -eq 'n/a'`: with $true on the left PowerShell converts 'n/a' to a
    # boolean (non-empty = $true) and the test MATCHES, so a proven HEARING was
    # reported as n/a. Found by the first real end-to-end tick.
    $r = if ($hearing -is [string] -and $hearing -eq 'n/a') { New-HacsResult -Status $status -InstanceId $InstanceId -HearingNotApplicable -Message $msg -Extra $extra }
         else { New-HacsResult -Status $status -InstanceId $InstanceId -Hearing $hearing -Message $msg -Extra $extra }
    if (-not $WhatIf) {
        Write-Atomic $P.status $r
        $prev = Read-Json "$($P.status).last-end"
        if ($Acted) { Add-Line $P.audit $r }
        if (-not $prev -or $prev.end -ne $end) {
            Write-HacsLog -Instance $inst -Log 'ring-watch.log' -Message "$end ($status): $msg"
            Write-Atomic "$($P.status).last-end" @{ end = $end; at = (Get-Date).ToString('o') }
        }
    }
    if ($script:lock) { Unlock-HacsInstance $script:lock; $script:lock = $null }
    $r | Write-HacsResult
    exit $(switch ($r.status) { 'success' { 0 } 'degraded' { 1 } default { 2 } })
}

# ---------------------------------------------------------------- S0 LOCK ----
$lk = Lock-HacsInstance -Instance $inst -Kind ring -TimeoutSec 10
if (-not $lk.Ok) { End-Tick 'BUSY' 'degraded' "another ring-watch tick holds the ring lock (pid $($lk.HolderPid))." }
$script:lock = $lk
if ($lk.Abandoned) { $facts.lockAbandoned = $true; Write-HacsLog -Instance $inst -Log 'ring-watch.log' -Message 'FINDING: the ring lock was abandoned by a tick that died holding it' }

# ---------------------------------------------------------------- S1 SELF ----
$drift = $false
$manifest = Join-Path $PSScriptRoot 'DEPLOYED.md'
if (Test-Path $manifest) {
    $m = Get-Content $manifest -Raw
    foreach ($f in @('ring-watch.ps1', 'lib\HacsHarness.psm1')) {
        $h = (Get-FileHash (Join-Path $PSScriptRoot $f) -Algorithm SHA256).Hash.ToLower()
        if ($m -notmatch [regex]::Escape("$h  $f")) { $drift = $true }
    }
}
$facts.drift = $drift

# ---------------------------------------------------------------- S2 MAIL ----
$inbox = Get-HacsInbox -Instance $inst -HacsPy $HacsPy -Python $Python
$ledger = Read-Json $P.ledger
$seenIds = @(if ($ledger -and $ledger.PSObject.Properties.Name -contains 'seen') { $ledger.seen | ForEach-Object { [string]$_ } })
$lastTotal = if ($ledger -and $ledger.PSObject.Properties.Name -contains 'lastTotal') { [int]$ledger.lastTotal } else { 0 }
$backoff = Read-Json $P.backoff
$firstSeen = Read-Json $P.seen
$mail = 'UNKNOWN'; $newIds = @(); $total = $null
if ($inbox.Ok -eq $true) {
    $total = $inbox.TotalUnread
    $newIds = @($inbox.VisibleIds | Where-Object { $seenIds -notcontains $_ })
    $newIds = @($newIds | Where-Object {
        $id = $_
        -not ($backoff -and $backoff.PSObject.Properties.Name -contains $id -and [datetime]$backoff.$id.until -gt $now) })
    $mail = if ($newIds.Count -gt 0 -or $total -gt $lastTotal) { 'NEW' } else { 'NONE' }
} else { $facts.mailError = $inbox.Error }
$facts.mail = $mail; $facts.unread = $total; $facts.newIds = $newIds

# grace: when was each new id first seen by the watcher?
$fs = @{}
if ($firstSeen) { foreach ($k in $firstSeen.PSObject.Properties.Name) { $fs[$k] = [datetime]$firstSeen.$k } }
foreach ($id in $newIds) { if (-not $fs.ContainsKey($id)) { $fs[$id] = $now } }
if (-not $WhatIf -and $inbox.Ok -eq $true) {
    $keep = @{}; foreach ($k in $fs.Keys) { if ($inbox.VisibleIds -contains $k) { $keep[$k] = $fs[$k].ToString('o') } }
    Write-Atomic $P.seen $keep
}
$oldestNewSec = if ($newIds.Count -gt 0) { [int](($now - (@($newIds | ForEach-Object { $fs[$_] }) | Sort-Object | Select-Object -First 1)).TotalSeconds) } else { 0 }

$desired = Read-Json $P.desired
$desiredState = if ($desired -and $desired.PSObject.Properties.Name -contains 'state') { [string]$desired.state } else { 'awake' }
$facts.desired = $desiredState
$hb = Read-Json $P.bellHb
$hbAgeSec = if ($hb -and $hb.PSObject.Properties.Name -contains 'at') { [int]($now - [datetime]$hb.at).TotalSeconds } else { $null }
$facts.doorbellHeartbeatAgeSec = $hbAgeSec
$hbFresh = ($null -ne $hbAgeSec -and $hbAgeSec -lt $HeartbeatStaleSec)

# -------------------------------------------------------------- S3 TRIAGE ----
$why = $null
if ($mail -eq 'NONE') {
    $st = Read-Json $P.bellSt
    if ($st -and $st.PSObject.Properties.Name -contains 'state' -and $st.state -eq 'fired' -and
        ($now - [datetime]$st.at).TotalMinutes -ge $IgnoredMin -and $inbox.Ok -eq $true -and
        @($st.ids | Where-Object { $inbox.VisibleIds -contains $_ }).Count -gt 0) { $why = 'IGNORED' }
    elseif ($desiredState -eq 'awake' -and -not $hbFresh) { $why = 'DOORBELL_DEAD' }
    elseif ($Reason -eq 'logon') { $why = 'LOGON' }
    else { End-Tick 'IDLE' $(if ($drift) { 'degraded' } else { 'success' }) "no new mail, and nothing needs the watcher (unread $total; doorbell heartbeat $hbAgeSec s old)." }
}
$facts.trigger = if ($why) { $why } else { "mail-$mail" }

# ------------------------------------------------------------ S4 PRESENCE ----
$pres = Get-HacsPresence -Instance $inst
$facts.presence = $pres.State; $facts.presenceWhy = $pres.Why
switch ($pres.State) {
    'UNKNOWN'  { End-Tick 'REFUSED_UNKNOWN' 'degraded' "presence UNKNOWN ($($pres.Why)). No launch, no ring: nothing can be decided on a look that failed." }
    'ATTENDED' { End-Tick 'ATTENDED' 'degraded' "a human session is live ($($pres.Why)). The watcher never acts over a human." }
    'TRANSITIONING' {
        $tt = Read-Json "$($P.status).transitioning"
        $n = if ($tt) { [int]$tt.ticks + 1 } else { 1 }
        if (-not $WhatIf) { Write-Atomic "$($P.status).transitioning" @{ ticks = $n; at = $now.ToString('o') } }
        if ($n -eq 6) { Send-Alert 'STUCK_TRANSITIONING' "presence has been TRANSITIONING for 6 consecutive ticks: $($pres.Why)" }
        End-Tick 'SETTLING' 'degraded' "presence TRANSITIONING ($($pres.Why)); never resume mid-shutdown. Tick $n."
    }
}
if (-not $WhatIf) { Remove-Item "$($P.status).transitioning" -ErrorAction SilentlyContinue }

$action = $null
if ($pres.State -eq 'HOME') {
    if ($mail -eq 'UNKNOWN') { End-Tick 'HOME_MAIL_UNKNOWN' 'degraded' "home, but the inbox could not be read: $($inbox.Error)" }
    if ($mail -eq 'NEW' -and $hbFresh -and $oldestNewSec -lt $GraceSec) {
        End-Tick 'DEFERRED_TO_DOORBELL' 'success' "home with new mail first seen $oldestNewSec s ago, and its doorbell is alive ($hbAgeSec s): it will ring itself within a poll."
    }
    if ($mail -eq 'NEW' -or $why -in @('IGNORED', 'DOORBELL_DEAD')) { $action = 'RING' }
    else { End-Tick 'HOME' 'success' 'home and nothing new.' }
} else {
    # NOT_HOME
    if ($desiredState -eq 'landed') {
        if ($mail -eq 'NEW') {
            $by = if ($desired -and $desired.PSObject.Properties.Name -contains 'by') { $desired.by } else { 'someone' }
            Send-Alert 'HELD' "landed by $by, and $($newIds.Count) new message(s) are waiting. Not relaunching a mind a human put down."
            End-Tick 'HELD' 'degraded' "not home and landed by $by; new mail is held, not delivered by relaunch."
        }
        End-Tick 'LANDED' 'success' 'not home, and landed on purpose; nothing to do.'
    }
    if ($mail -eq 'UNKNOWN' -and $Reason -ne 'logon') {
        End-Tick 'NOT_HOME_MAIL_UNKNOWN' 'degraded' "not home, and the inbox could not be read ($($inbox.Error)). Not launching on no evidence."
    }
    if ($mail -eq 'NEW' -or $Reason -eq 'logon') { $action = 'RELAUNCH' }
    else { End-Tick 'NOT_HOME_IDLE' 'success' "not home and no new mail ($($facts.trigger)); a relaunch waits for mail or logon." }
}

# ------------------------------------------------------------ S5 RELAUNCH ----
if ($action -eq 'RELAUNCH') {
    if (Test-Path $P.latch) {
        Send-Alert 'LAUNCH_HELD' "a fork latch is set ($($P.latch)); automatic relaunch is off until a human deletes it."
        End-Tick 'LAUNCH_HELD' 'error' 'fork latch present: no automatic relaunch until a human clears it.'
    }
    $hist = @(if (Test-Path $P.history) { Get-Content $P.history | Where-Object { $_ } | ForEach-Object { try { $_ | ConvertFrom-Json } catch { } } })
    $recent = @($hist | Where-Object { $_ -and ($now - [datetime]$_.at).TotalMinutes -lt 60 })
    if ($recent.Count -ge 3) {
        Send-Alert 'LAUNCH_HELD' "$($recent.Count) automatic relaunches in the last hour; the circuit breaker is open."
        End-Tick 'LAUNCH_HELD' 'error' "circuit breaker: $($recent.Count) relaunches in 60 min."
    }
    $ll = Read-Json $P.lastLaunch
    if ($ll -and ($now - [datetime]$ll.at).TotalMinutes -lt 5) {
        End-Tick 'LAUNCH_PENDING' 'degraded' "a relaunch was attempted at $($ll.at); waiting for it to register before trying again."
    }
    if ($WhatIf) { End-Tick 'WOULD_RELAUNCH' 'degraded' "WhatIf: would relaunch ($($facts.trigger); unread $total) with launch.ps1 -InstanceId $InstanceId, then ring." }
    Write-Atomic $P.lastLaunch @{ at = $now.ToString('o') }                  # BEFORE the call (design 1)
    Add-Line $P.history @{ at = $now.ToString('o'); trigger = $facts.trigger }
    $ps = (Get-Process -Id $PID).Path
    $ln = Invoke-HacsNative -FilePath $ps -Arguments @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $LaunchScript, '-InstanceId', $InstanceId) -TimeoutSec 420
    $lj = $null; try { $lj = ($ln.StdOut | Out-String).Trim() | ConvertFrom-Json } catch { }
    $ln2 = if ($lj) { @($lj.PSObject.Properties.Name) } else { @() }
    $facts.launch = if ($lj) { "$($lj.status): $($lj.message)" } else { "unparseable (exit $($ln.ExitCode))" }
    if (-not $lj) { End-Tick 'LAUNCH_ERROR' 'error' "launch.ps1 returned no JSON (exit $($ln.ExitCode)); state unknown." -Acted }
    if ($ln2 -contains 'refusal') { End-Tick 'LAUNCH_REFUSED' 'degraded' "launch refused ($($lj.refusal)): $($lj.message)" -Acted }
    if ($ln2 -contains 'forked' -and $lj.forked -eq $true) {
        Write-Atomic $P.latch @{ at = (Get-Date).ToString('o'); launch = $lj.message }
        Send-Alert 'FORKED' "a relaunch started a COPY: $($lj.message) The latch is set; no automatic relaunch until a human clears it."
        End-Tick 'FORKED' 'degraded' "relaunch FORKED; latch set; the copy is never rung." -Acted
    }
    if ([string]$lj.message -match 'CREDENTIAL IS DEAD') {
        Send-Alert 'CANNOT_THINK' 'the credential is dead; a human must run /login. Nothing was started.'
        End-Tick 'CANNOT_THINK' 'error' 'credential dead: a human must /login.' -Acted
    }
    if ($lj.status -eq 'error') { End-Tick 'LAUNCH_ERROR' 'error' "launch failed: $($lj.message)" -Acted }
    if ($ln2 -contains 'hearing' -and [string]$lj.hearing -eq 'false') {
        Send-Alert 'DEAF_AT_LAUNCH' "relaunched, and the launch hearing check says DEAF: $($lj.message)"
        End-Tick 'DEAF_AT_LAUNCH' 'degraded' "relaunched but DEAF at launch. No automatic land." -Acted
    }
    $action = 'RING'      # proven hearing at launch or not, the mail still needs telling
}

# ---------------------------------------------------------------- S6 RING ----
if ($WhatIf) { End-Tick 'WOULD_RING' 'degraded' "WhatIf: would ring '$InstanceId' about $total unread ($($facts.trigger))." }
$unread = if ($null -ne $total) { $total } else { 0 }
$ring = Invoke-HacsRing -Instance $inst -Reason mail -Unread $unread
$facts.ring = $ring.Verdict; $facts.ringDetail = $ring.Detail

# -------------------------------------------------------------- S7 RECORD ----
$wait = switch ($ring.Verdict) { 'HEARING' { 0 } 'DEAF' { 30 } 'QUEUED_BUSY' { 15 } default { 10 } }
if ($ring.Verdict -in @('HEARING', 'DEAF', 'QUEUED_BUSY', 'RINGER_FAILED', 'ERROR', 'NOT_HOME') -and $inbox.Ok -eq $true) {
    $lg = Lock-HacsInstance -Instance $inst -Kind ledger -TimeoutSec 10
    try {
        $cur = Read-Json $P.ledger
        $cs = @(if ($cur -and $cur.PSObject.Properties.Name -contains 'seen') { $cur.seen | ForEach-Object { [string]$_ } })
        if ($ring.Verdict -eq 'HEARING') { $cs = @($cs + $newIds | Select-Object -Unique | Select-Object -Last 500) }
        Write-Atomic $P.ledger @{ seen = $cs; lastTotal = $(if ($ring.Verdict -eq 'HEARING') { $total } else { $lastTotal }); by = 'watcher'; verdict = $ring.Verdict; nonce = $ring.Nonce; at = (Get-Date).ToString('o') }
    } finally { Unlock-HacsInstance $lg }
    if ($wait -gt 0) {
        $bo = @{}; if ($backoff) { foreach ($k in $backoff.PSObject.Properties.Name) { $bo[$k] = $backoff.$k } }
        foreach ($id in $newIds) {
            $n = if ($bo.ContainsKey($id)) { [int]$bo[$id].count + 1 } else { 1 }
            $bo[$id] = @{ until = (Get-Date).AddMinutes($wait).ToString('o'); count = $n; verdict = $ring.Verdict }
        }
        Write-Atomic $P.backoff $bo
    }
}
switch ($ring.Verdict) {
    'HEARING'     { End-Tick 'RUNG' 'success' "rang '$InstanceId' about $unread unread; it HEARD ($($ring.Evidence))." $true -Acted }
    'QUEUED_BUSY' { End-Tick 'RUNG_BUSY' 'degraded' "rang; the doorbell is queued and the mind is mid-turn. $($ring.Detail)" $null -Acted }
    'DEAF' {
        Send-Alert 'DEAF' "rang about $unread unread; the doorbell reached the queue but never the mind, and its transcript was still. $($ring.Detail)"
        End-Tick 'DEAF' 'degraded' $ring.Detail $false -Acted
    }
    'AMBIGUOUS' {
        Send-Alert 'AMBIGUOUS' $ring.Detail
        End-Tick 'AMBIGUOUS' 'degraded' $ring.Detail $null -Acted
    }
    default { End-Tick "RING_$($ring.Verdict)" 'degraded' $ring.Detail $null -Acted }
}
