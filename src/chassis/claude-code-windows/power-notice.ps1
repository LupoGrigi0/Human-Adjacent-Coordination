<#
.SYNOPSIS
  Courtesy notices for planned absences: "going offline" when Windows announces
  a restart, shutdown, sign-out or sleep, and "back" after it, with the dark
  interval read from the event log.

.DESCRIPTION
  Lupo's request (2026-10-05): when the laptop goes away on purpose, tell the
  alert recipients to ignore the gap. This is the POLITE half only. Unplanned
  loss (power cut, crash, a lid closed on battery) cannot announce itself, and
  covering it is the job of a check that runs on smoothcurves, not here.

  -Event going   Run by an event-triggered task (System log: User32 1074 restart
                 or power off, Winlogon 7002 sign-out, Kernel-Power 42 sleep).
                 Names the newest such event from the last 2 minutes. BEST EFFORT:
                 on 2026-10-04 Windows logged 1074 at 22:26:59 and the kernel
                 shutdown at 22:27:06, so this has about seven seconds to start
                 PowerShell and Python and reach the hub. If it loses that race,
                 nothing is sent, and the "back" notice still reports the gap.
  -Event back    Run at logon and on resume. Finds the most recent return (boot,
                 resume, or a logon after a sign-out) in the last -RecentMin minutes,
                 pairs it with what preceded it, and reports:
                   announced     Windows logged an orderly shutdown (1074 + 13)
                   unannounced   Windows logged 6008 for this boot: no clean shutdown
                   sleep         Kernel-Power 42, then Power-Troubleshooter 1
                   signout       Winlogon 7002, then 7001
                   unknown       a boot with neither record; said so, not guessed
                 Nothing recent -> nothing is sent (a manual run must not spam).

  Words: "announced", never "planned". Windows' own 1074 reason string said
  "Other (Unplanned)" for an ordinary Start > Restart on 2026-10-04. A notice
  about a system is testimony; the event sequence is the measurement.

  What a notice does NOT say: whether the mind can think. A machine that is back
  is not a mind that is back; ring-watch and the canary answer that separately,
  and every "back" notice says so.

  Privacy: the 1074 record carries a user name and a process path. Neither is
  read into the notice; only the restart/power-off word and the times are.

  Every run appends to power-notices.jsonl in the runtime dir and emits one
  New-HacsResult: 0 sent or nothing to send, 1 degraded (a send failed), 2 error.
  -AlertTo defaults to none. -WhatIf computes everything and writes and sends
  nothing. -EventFixture (a JSON list of {id, provider, time, detail}) and -Now
  replace the event log and the clock, for tests.

.NOTES
  Author: Lodestone <lodestone@smoothcurves.nexus>
  Collaborator: Lupo
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string] $InstanceId,
    [Parameter(Mandatory)][ValidateSet('going', 'back')][string] $Event,
    [string[]] $AlertTo = @(),
    [switch]   $WhatIf,
    [int]      $RecentMin = 30,
    [string]   $HacsPy = 'D:\Lupo\Source\AI\instance-archaeology\src\hacs\hacs.py',
    [string]   $Python = 'python',
    [string]   $EventFixture,
    [string]   $Now
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
# `powershell -File x.ps1 -AlertTo A,B` (how every scheduled task runs us, via
# run-hidden.vbs) binds ONE string 'A,B', not two. Split here, or every alert
# goes to a recipient named 'A,B' that does not exist. Found 2026-10-10.
$AlertTo = @($AlertTo | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim() } | Where-Object { $_ })

trap {
    $why = "UNHANDLED: $($_.Exception.Message) (power-notice.ps1 line $($_.InvocationInfo.ScriptLineNumber))"
    try { (New-HacsResult -Status 'error' -InstanceId $InstanceId -HearingNotApplicable -Message $why -Extra @{ event = $Event }) | Write-HacsResult }
    catch { [pscustomobject]@{ status = 'error'; instanceId = $InstanceId; message = $why } | ConvertTo-Json -Compress }
    exit 2
}

Import-Module (Join-Path $PSScriptRoot 'lib\HacsHarness.psm1') -Force
$inst = Get-HacsInstance -InstanceId $InstanceId
$log  = Join-Path $inst.RuntimeDir 'power-notices.jsonl'
$at   = if ($Now) { [datetime]::Parse($Now, [Globalization.CultureInfo]::InvariantCulture) } else { Get-Date }

# --- the evidence: one flat list of {id, provider, time, detail} ---------------
$wanted = @(
    @{ Id = 1074; P = 'User32' }                                  # restart / power off announced
    @{ Id = 7002; P = 'Microsoft-Windows-Winlogon' }              # sign-out
    @{ Id = 7001; P = 'Microsoft-Windows-Winlogon' }              # logon
    @{ Id = 42;   P = 'Microsoft-Windows-Kernel-Power' }          # entering sleep
    @{ Id = 1;    P = 'Microsoft-Windows-Power-Troubleshooter' }  # resumed
    @{ Id = 13;   P = 'Microsoft-Windows-Kernel-General' }        # kernel shut down cleanly
    @{ Id = 12;   P = 'Microsoft-Windows-Kernel-General' }        # kernel started (boot)
    @{ Id = 6008; P = 'EventLog' }                                # previous shutdown was unexpected
)
function Read-Evidence {
    if ($EventFixture) {
        # NOT `ConvertFrom-Json | ForEach-Object`: PowerShell 5.1 hands the whole
        # array down the pipe as ONE item, so $_ was the array -- one event lost its
        # detail silently, two made the [int] cast throw. foreach enumerates it.
        $items = Get-Content $EventFixture -Raw | ConvertFrom-Json
        return @(foreach ($x in $items) {
            [pscustomobject]@{ id = [int]$x.id; provider = [string]$x.provider
                               time = [datetime]::Parse($x.time, [Globalization.CultureInfo]::InvariantCulture)
                               detail = $(if ($x.PSObject.Properties.Name -contains 'detail') { [string]$x.detail } else { '' }) }
        })
    }
    $since = $at.AddDays(-14)
    foreach ($w in $wanted) {
        # "No events found" is an exception from Get-WinEvent; any OTHER failure
        # means we could not look, and that must not read as "nothing happened".
        try { $evs = @(Get-WinEvent -FilterHashtable @{ LogName = 'System'; Id = $w.Id; ProviderName = $w.P; StartTime = $since } -MaxEvents 5 -ErrorAction Stop) }
        catch { if ($_.FullyQualifiedErrorId -match 'NoMatchingEventsFound') { continue } else { throw "could not read the System log for $($w.P) $($w.Id): $($_.Exception.Message)" } }
        foreach ($e in $evs) {
            $d = if ($w.Id -eq 1074 -and $e.Properties.Count -gt 4) { [string]$e.Properties[4].Value } else { '' }   # 'restart' / 'power off' only
            [pscustomobject]@{ id = $w.Id; provider = $w.P; time = $e.TimeCreated; detail = $d }
        }
    }
}
$ev = @(Read-Evidence | Where-Object { $_.time -le $at } | Sort-Object time)
function Newest([int] $id, [datetime] $before = $at, [datetime] $after = [datetime]::MinValue) {
    @($ev | Where-Object { $_.id -eq $id -and $_.time -le $before -and $_.time -gt $after }) | Select-Object -Last 1
}
function Z($t) { if ($null -eq $t) { 'unknown' } else { $t.ToUniversalTime().ToString('yyyy-MM-dd HH:mm:ss') + 'Z' } }
function Span($a, $b) { if ($null -eq $a -or $null -eq $b) { $null } else { [int]($b - $a).TotalSeconds } }
function Human($s) { if ($null -eq $s) { 'unknown length' } elseif ($s -lt 120) { "$s s" } elseif ($s -lt 7200) { "$([int]($s / 60)) min" } else { '{0:N1} h' -f ($s / 3600) } }

# --- classify --------------------------------------------------------------------
$facts = [ordered]@{ event = $Event; whatIf = [bool]$WhatIf; at = $at.ToString('o') }
$kind = $null; $text = $null
if ($Event -eq 'going') {
    # A restart ALSO writes a sign-out (7002) about three seconds after its 1074
    # (measured, 2026-10-04), so the newest event is the wrong one to name: a
    # restart outranks a sleep, and both outrank a sign-out.
    $cands = @($ev | Where-Object { $_.id -in 1074, 7002, 42 -and $_.time -ge $at.AddMinutes(-2) })
    $g = @($cands | Sort-Object @{ e = { @{ 1074 = 0; 42 = 1; 7002 = 2 }[$_.id] } }, @{ e = { $_.time }; Descending = $true }) | Select-Object -First 1
    if (-not $g) { $kind = 'unidentified'; $text = 'is going offline; the trigger fired but no restart, sign-out or sleep event was found in the last 2 minutes.' }
    else {
        switch ($g.id) {
            1074 { $kind = $(if ($g.detail -match 'power off') { 'shutdown' } elseif ($g.detail -match 'restart') { 'restart' } else { 'restart-or-shutdown' }) }
            7002 { $kind = 'signout' }
            42   { $kind = 'sleep' }
        }
        $text = "is going offline on purpose: Windows announced a $kind at $(Z $g.time). Expected back; please ignore the gap."
    }
    $facts.from = Z $(if ($g) { $g.time } else { $null })
}
else {
    $boot   = Newest 12
    $resume = Newest 1
    $logoff = Newest 7002
    $logon  = if ($logoff) { Newest 7001 $at $logoff.time } else { $null }
    # A logon after a sign-out is a sign-out's return ONLY if the machine did not
    # boot in between. A restart writes 7002 too; the first real-data run of this
    # script called the 2026-10-04 reboot "a sign-out".
    if ($logon -and $boot -and $boot.time -gt $logoff.time) { $logon = $null }
    $rets = @(
        $(if ($boot)   { [pscustomobject]@{ k = 'boot';   t = $boot.time } })
        $(if ($resume) { [pscustomobject]@{ k = 'resume'; t = $resume.time } })
        $(if ($logon)  { [pscustomobject]@{ k = 'logon';  t = $logon.time } })
    ) | Where-Object { $_ } | Sort-Object t
    $ret = $rets | Select-Object -Last 1
    $from = $null; $to = $null
    if (-not $ret -or $ret.t -lt $at.AddMinutes(-$RecentMin)) {
        $kind = 'none'
        $text = "no boot, resume or logon in the last $RecentMin min; nothing to report."
    }
    elseif ($ret.k -eq 'resume') {
        $sl = Newest 42 $ret.t
        $kind = 'sleep'; $from = $(if ($sl) { $sl.time }); $to = $ret.t
    }
    elseif ($ret.k -eq 'logon') {
        $kind = 'signout'; $from = $logoff.time; $to = $ret.t
    }
    else {
        $prev = @($ev | Where-Object { $_.id -eq 12 -and $_.time -lt $ret.t }) | Select-Object -Last 1   # the boot before this one
        $after = if ($prev) { $prev.time } else { [datetime]::MinValue }
        $clean = Newest 13 $ret.t $after
        $ann   = Newest 1074 $ret.t $after
        # 6008 is written DURING the boot it reports on, so look just after this boot,
        # and never before it: an old 6008 belongs to an older boot.
        $u = @($ev | Where-Object { $_.id -eq 6008 -and $_.time -ge $ret.t -and $_.time -le $ret.t.AddMinutes(10) }) | Select-Object -First 1
        $to = $ret.t
        if ($u)                 { $kind = 'unannounced'; $from = $null }
        elseif ($clean -and $ann) { $kind = 'announced'; $from = $clean.time; $facts.announcedAs = $(if ($ann.detail) { $ann.detail } else { 'unrecorded' }) }
        elseif ($clean)         { $kind = 'unknown';     $from = $clean.time }
        else                    { $kind = 'unknown';     $from = $null }
    }
    if ($kind -ne 'none') {
        $s = Span $from $to
        $what = switch ($kind) {
            'announced'   { "an announced $($facts.announcedAs)" }
            'unannounced' { 'an UNANNOUNCED stop (Windows recorded no clean shutdown, event 6008)' }
            'sleep'       { 'sleep' }
            'signout'     { 'a sign-out' }
            default       { 'a stop whose cause Windows did not record' }
        }
        $text = "is back after $what. Dark from $(Z $from) to $(Z $to) ($(Human $s))."
        if ($kind -ne 'signout') { $logonAfter = Newest 7001 $at $to; if ($logonAfter) { $text += " Logon at $(Z $logonAfter.time)." } }
        $text += ' This says the machine is back, NOT that the mind can think; that is checked separately.'
        $facts.from = Z $from; $facts.to = Z $to; $facts.darkSec = $s
    }
}
$facts.kind = $kind
$facts.alertTo = $AlertTo

# --- once per transition ---------------------------------------------------------
# A restart fires 1074 AND 7002 about three seconds apart, and a logon can follow a
# resume: two triggers, one transition. "going": skip if a going notice was already
# logged in the last 2 minutes. "back": skip if this exact return (kind + to) was.
$dupOf = $null
if ($kind -ne 'none' -and (Test-Path $log)) {
    foreach ($line in [IO.File]::ReadAllLines($log)) {
        $p = $null; try { $p = $line | ConvertFrom-Json } catch { continue }
        if (-not $p -or -not ($p.PSObject.Properties.Name -contains 'event')) { continue }
        if ($Event -eq 'going' -and $p.event -eq 'going' -and ($p.PSObject.Properties.Name -contains 'at') -and
            ($at - [datetime]$p.at).TotalSeconds -ge 0 -and ($at - [datetime]$p.at).TotalSeconds -lt 120) { $dupOf = $p.at }
        if ($Event -eq 'back' -and $p.event -eq 'back' -and ($p.PSObject.Properties.Name -contains 'to') -and
            $p.kind -eq $kind -and $p.to -eq $facts.to) { $dupOf = $p.at }
    }
}
if ($dupOf) { $facts.duplicateOf = $dupOf; $text = "already notified for this $Event at $dupOf; not sending again."; $kind = 'none'; $facts.kind = 'duplicate' }

# --- record and send ---------------------------------------------------------------
$failed = @()
# An unidentified "going" is LOGGED and never SENT: a going notice that names no
# event is most likely a late run (the machine already back), and "going offline"
# said after the fact is worse than silence. Recorded so the late run is visible.
$record = $kind -ne 'none'
$send   = $record -and $kind -ne 'unidentified'
if (-not $send) { $AlertTo = @() }
if ($record -and -not $WhatIf) {
    # 'at' is the (possibly -Now) clock the dedupe compares against; 'to' is the return time.
    [IO.File]::AppendAllText($log, ((@{ at = $at.ToString('o'); instanceId = $InstanceId; event = $Event; kind = $kind; text = $text
                                        to = $(if ($facts.Contains('to')) { $facts.to } else { $null }); recipients = $AlertTo } | ConvertTo-Json -Compress) + "`n"))
    $body = "power-notice from $env:COMPUTERNAME: $InstanceId $text"
    foreach ($to in $AlertTo) {
        $saved = $env:PYTHONIOENCODING
        try {
            $env:PYTHONIOENCODING = 'utf-8'
            $n = Invoke-HacsNative -FilePath $Python -Arguments @($HacsPy, 'send', $to, "power: $InstanceId $Event ($kind)", $body) -TimeoutSec 20
            if ($n.ExitCode -ne 0) { $failed += "$to (exit $($n.ExitCode))" }
        } catch { $failed += "$to ($($_.Exception.Message))" }
        finally { $env:PYTHONIOENCODING = $saved }
    }
    if ($failed) { [IO.File]::AppendAllText($log, ((@{ at = (Get-Date).ToString('o'); kind = 'SEND-FAILED'; failed = $failed } | ConvertTo-Json -Compress) + "`n")) }
}
$facts.text = $text
$facts.sent = $(if ($WhatIf -or -not $send) { @() } else { @($AlertTo | Where-Object { $f = $_; -not ($failed | Where-Object { $_ -like "$f *" }) }) })
$facts.failed = $failed
$status = if ($failed) { 'degraded' } else { 'success' }
$msg = if ($WhatIf) { "WHATIF: would send: $text" } elseif (-not $send) { $text } else { "sent to $($AlertTo.Count - $failed.Count)/$($AlertTo.Count): $text" }
(New-HacsResult -Status $status -InstanceId $InstanceId -HearingNotApplicable -Message $msg -Extra $facts) | Write-HacsResult
exit $(if ($failed) { 1 } else { 0 })
