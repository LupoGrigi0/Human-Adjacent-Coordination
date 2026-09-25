<#
.SYNOPSIS
  Shared primitives for the claude-code-windows chassis.

.DESCRIPTION
  The Windows sibling of src/chassis/claude-code-channel. Same CONTRACT, different
  mechanism: no tmux, no per-instance unix user, no systemd. Isolation here is by
  directory and port, not by uid -- and this module says so out loud rather than
  pretending otherwise.

  Nothing in this file knows the name of any instance. Every path is derived from
  <instancesRoot>/<InstanceId>/.hacs-identity. If you find yourself typing
  "Lodestone" into this file, stop: that is the bug this module exists to prevent.

  THE TWO RULES THAT ARE CODE, NOT CONVENTION
  -------------------------------------------
  Inherited verbatim from Crossing-2d23's launch-claude-code-channel.sh:

    * status is NEVER 'success' over a mind that cannot hear.
    * 'unknown' (could not measure) is NEVER collapsed into 'false' (deaf).

  New-HacsResult ENFORCES both. It downgrades a caller that claims success while
  reporting hearing false or unknown. A rule you have to remember is a rule that
  fails at 3am; a rule the constructor enforces is a rule.

.NOTES
  Author: Lodestone <lodestone@smoothcurves.nexus>
  Collaborator: Lupo
#>

Set-StrictMode -Version Latest

$script:InstancesRoot = if ($env:HACS_INSTANCES_ROOT) { $env:HACS_INSTANCES_ROOT }
                        else { 'D:\Lupo\Source\AI\hacs-instances' }

# Helper processes that are NOT a mind. This filter is load-bearing and was learned
# the hard way: without it a Chrome native-messaging host counts as a live session
# and the heartbeat skips forever.
$script:NotASession = @('--chrome-native-host', '--ide', 'mcp serve')


function ConvertTo-HacsPath {
    <#
    .SYNOPSIS
      Canonicalise a path so two spellings of the same file compare equal.
    .DESCRIPTION
      Identity files store paths with FORWARD slashes, because a backslash in JSON
      is an escape character and a hand-edited 'D:\Lupo' is invalid JSON that
      reports as a corrupt file. Windows accepts forward slashes everywhere, so the
      file is unmanglable -- and this function converts to the OS form on read.

      This is not cosmetic. Cairn's mirror compares a tailed transcript path against
      the newest-on-disk path as STRINGS: path.join() normalises to backslashes
      while the env var arrives with forward slashes, so the same file compares
      unequal and the server logs 'TRANSCRIPT RE-POINTED -- publishing NOTHING.
      Restart it.' while publishing perfectly. That message sends people restarting
      working mirrors forever. Normalising at the boundary is the fix; a threshold
      change is not.

      Windows paths are case-insensitive, so comparisons downstream should use
      -ieq / -like, not -ceq.
    #>
    [CmdletBinding()]
    param([AllowNull()][string] $Path)
    if (-not $Path) { return $Path }
    $p = $Path -replace '/', [IO.Path]::DirectorySeparatorChar
    try { [IO.Path]::GetFullPath($p) } catch { $p.TrimEnd([IO.Path]::DirectorySeparatorChar) }
}


function Test-HacsSamePath {
    <#
    .SYNOPSIS
      Do two path spellings name the same location? Use this, never -eq.
    #>
    [CmdletBinding()]
    param([AllowNull()][string] $A, [AllowNull()][string] $B)
    if (-not $A -or -not $B) { return $false }
    (ConvertTo-HacsPath $A) -ieq (ConvertTo-HacsPath $B)
}


function Get-HacsInstance {
    <#
    .SYNOPSIS
      Resolve an instance's identity and paths. Fails loud; never guesses.
    #>
    [CmdletBinding()]
    param([Parameter(Mandatory)][string] $InstanceId)

    $dir  = Join-Path $script:InstancesRoot $InstanceId
    $file = Join-Path $dir '.hacs-identity'
    if (-not (Test-Path $file)) {
        throw "No .hacs-identity for '$InstanceId' at $file. Instances are configured by file, not by argument."
    }

    # BOM tolerance: PowerShell 5.1's -Encoding utf8 writes a BOM, and a BOM makes a
    # JSON parser report 'expecting value at char 0' -- an error that reads like a
    # corrupt file rather than an encoding problem. Measured on this box.
    $raw = [IO.File]::ReadAllText($file)
    if ($raw.Length -gt 0 -and [int][char]$raw[0] -eq 65279) { $raw = $raw.Substring(1) }

    try   { $id = $raw | ConvertFrom-Json }
    catch { throw "Malformed .hacs-identity at ${file}: $($_.Exception.Message)" }

    $have = $id.PSObject.Properties.Name
    foreach ($k in 'instanceId', 'homeDir', 'runtimeDir', 'slug') {
        if ($have -notcontains $k -or -not $id.$k) {
            throw "'.hacs-identity' for '$InstanceId' is missing required key '$k' ($file)"
        }
    }
    if ($id.instanceId -ne $InstanceId) {
        throw "Identity mismatch: asked for '$InstanceId', file says '$($id.instanceId)'. Refusing to act on either."
    }

    [pscustomobject]@{
        InstanceId    = $id.instanceId
        Chassis       = if ($have -contains 'chassis')       { $id.chassis }            else { 'claude-code-windows' }
        HomeDir       = (ConvertTo-HacsPath $id.homeDir)
        RuntimeDir    = (ConvertTo-HacsPath $id.runtimeDir)
        Slug          = $id.slug
        ProjectDir    = (ConvertTo-HacsPath (Join-Path $env:USERPROFILE ".claude\projects\$($id.slug)"))
        ChannelPort   = if ($have -contains 'channelPort')   { [int]$id.channelPort }   else { $null }
        MirrorPort    = if ($have -contains 'mirrorPort')    { [int]$id.mirrorPort }    else { $null }
        MirrorEnabled = if ($have -contains 'mirrorEnabled') { [bool]$id.mirrorEnabled } else { $false }
        IdentityFile  = $file
    }
}


function Write-HacsLog {
    <#
    .SYNOPSIS
      Append one timestamped line to a per-instance log. Every run logs, including
      the boring ones -- deciding whether to speak is what ALARMS do, and on the
      night nothing was wrong, nothing spoke.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)] $Instance,
        [Parameter(Mandatory)][string] $Log,
        [Parameter(Mandatory)][string] $Message
    )
    $null = New-Item -ItemType Directory -Force -Path $Instance.RuntimeDir -ErrorAction SilentlyContinue
    $line = '{0}  {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
    Add-Content -Path (Join-Path $Instance.RuntimeDir $Log) -Value $line -Encoding utf8
    Write-Verbose $line
}


function Get-HacsAgentRegistry {
    <#
    .SYNOPSIS
      `claude agents --json`, parsed. Returns @() if it cannot be read.
    .DESCRIPTION
      This is the ONLY source on Windows that reliably maps a claude pid to the
      working directory it was started in. Win32_Process exposes a command line but
      NOT a cwd, and an interactive session's cwd comes from the shell rather than
      from an argument -- so the command line frequently does not mention the home
      directory at all.
    #>
    [CmdletBinding()]
    param([string] $ClaudeExe = "$env:USERPROFILE\.local\bin\claude.exe")
    if (-not (Test-Path $ClaudeExe)) { return }
    try {
        $raw = & $ClaudeExe agents --json 2>$null | Out-String
        if (-not $raw -or -not $raw.Trim()) { return }
        $parsed = $raw | ConvertFrom-Json

        # DO NOT wrap this in @(). ConvertFrom-Json on a JSON array returns an
        # Object[], and @() around an Object[] produces an array whose single
        # element is that array. The result LOOKS correct -- Count is 1, and
        # $x.pid still reads 11324 because PowerShell unrolls member access over
        # collections -- but $x.PSObject.Properties.Name then returns the
        # ARRAY's properties (Count, Length, Rank, SyncRoot...), so a
        # `-contains 'pid'` guard silently matches nothing and every process
        # comes back unattributed. Measured 2026-09-25; the double-start guard
        # only fired because unattributed defaults to "be more careful".
        # Emitting each element lets the pipeline flatten it correctly, and the
        # caller's @() then produces a genuinely flat array.
        foreach ($x in $parsed) { $x }
    } catch { return }
}


function Get-HacsClaudeProcess {
    <#
    .SYNOPSIS
      Live claude.exe processes, helpers excluded, attributed to an instance.
    .DESCRIPTION
      Attribution on a box with ONE OS user is the whole multitenancy problem, and
      the first version of this function got it wrong in the most dangerous
      direction.

      THE BUG, 2026-09-25, found within an hour of writing it: attribution matched
      the instance's home directory against the process COMMAND LINE. An
      interactive session's working directory comes from the shell, not from an
      argument, so its command line does not contain the home path -- and the
      function returned ZERO processes for a session that was demonstrably running.
      launch.ps1 then offered to start a second session over a live mind, which is
      the split-brain case the guard exists to prevent. A check that could not see,
      reporting absence.

      It was caught by running it against a case known to exist. Nothing else would
      have caught it, because a guard that never fires and a guard with nothing to
      fire at look identical.

      Attribution is now, in order:
        1. `claude agents --json` -- authoritative; it reports cwd per pid.
        2. command line containing the home dir -- for processes the registry
           does not list.
        3. otherwise 'unknown' -- RETURNED, not dropped, because an unattributable
           claude process is a reason to refuse to act, not a reason to proceed.

    .PARAMETER All
      Return EVERY claude process with its classification attached, including ones
      belonging to other instances. For diagnostics and status output only -- never
      for deciding whether to stop something. It exists because a classification
      nobody can observe is a classification nobody can test.
    #>
    [CmdletBinding()]
    param([Parameter(Mandatory)] $Instance, [switch] $ExcludeUnattributed, [switch] $All)

    # NOT named $all: PowerShell variable names are case-insensitive, so $all and
    # the -All switch are the SAME VARIABLE. Assigning an Object[] to a
    # SwitchParameter threw, and every property access downstream then failed on a
    # value that was no longer a process list. Measured 2026-09-25.
    $procs = @(Get-CimInstance Win32_Process -Filter "Name='claude.exe'" -ErrorAction SilentlyContinue)
    if ($procs.Count -eq 0) { return }

    $registry = @(Get-HacsAgentRegistry)
    $cwdByPid = @{}
    foreach ($a in $registry) {
        if ($a.PSObject.Properties.Name -contains 'pid' -and $a.PSObject.Properties.Name -contains 'cwd') {
            $cwdByPid[[int]$a.pid] = $a.cwd
        }
    }

    $out = @()
    foreach ($p in $procs) {
        $cl = "$($p.CommandLine)"
        $isHelper = $false
        foreach ($h in $script:NotASession) { if ($cl -like "*$h*") { $isHelper = $true } }
        if ($isHelper) { continue }

        $attr = 'unknown'
        $how  = 'neither the agent registry nor the command line attributed this process'
        if ($cwdByPid.ContainsKey([int]$p.ProcessId)) {
            if (Test-HacsSamePath $cwdByPid[[int]$p.ProcessId] $Instance.HomeDir) {
                $attr = 'matched'; $how = 'agent registry cwd'
            } else {
                $attr = 'other';   $how = "agent registry cwd = $($cwdByPid[[int]$p.ProcessId])"
            }
        } elseif ($cl -like "*$($Instance.HomeDir)*" -or $cl -like "*$($Instance.HomeDir -replace '\\','/')*") {
            $attr = 'matched'; $how = 'command line'
        }

        $p | Add-Member -NotePropertyName HacsAttribution   -NotePropertyValue $attr -Force
        $p | Add-Member -NotePropertyName HacsAttributedBy  -NotePropertyValue $how  -Force

        # 'other' is a different instance's session and is correctly excluded from
        # the normal view -- stopping it would be stopping someone else's mind.
        # 'unknown' is NOT excluded by default: not knowing whose it is must make a
        # caller more careful, never less.
        if ($All -or $attr -eq 'matched' -or ($attr -eq 'unknown' -and -not $ExcludeUnattributed)) { $out += $p }
    }
    @($out)
}


function Resolve-HacsSessionId {
    <#
    .SYNOPSIS
      Discover which transcript belongs to this instance, and say how much to
      trust the answer.
    .DESCRIPTION
      The trust ladder, taken from mirror-start.ps1 (written 2026-08-30, never run):

          explicit   caller passed it           -> Confidence 'explicit'
          recorded   .claude-session-id on disk -> Confidence 'recorded'
          newest     newest .jsonl in the slug  -> Confidence 'guess'

      A guess is LABELLED, never laundered. And it refuses to guess twice: if more
      than one transcript was written recently it returns 'ambiguous' with no id at
      all, because picking one would be a coin flip wearing a result's clothing.
      'newest .jsonl' silently targets the wrong mind the moment two sessions share
      a home -- which is precisely what multitenancy creates.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)] $Instance,
        [string] $SessionId,
        [int] $AmbiguityWindowMinutes = 10
    )

    if ($SessionId) {
        $f = Join-Path $Instance.ProjectDir "$SessionId.jsonl"
        if (-not (Test-Path $f)) {
            return [pscustomobject]@{ SessionId = $null; Path = $null; Confidence = 'error'
                Reason = "explicit session id '$SessionId' has no transcript at $f -- a named session with no transcript is a hard failure, never a fallback" }
        }
        return [pscustomobject]@{ SessionId = $SessionId; Path = $f; Confidence = 'explicit'; Reason = 'caller supplied it' }
    }

    $recordFile = Join-Path $Instance.RuntimeDir '.claude-session-id'
    if (Test-Path $recordFile) {
        $rec = (Get-Content $recordFile -Raw -ErrorAction SilentlyContinue)
        if ($rec) { $rec = $rec.Trim() }
        if ($rec) {
            $f = Join-Path $Instance.ProjectDir "$rec.jsonl"
            if (Test-Path $f) {
                return [pscustomobject]@{ SessionId = $rec; Path = $f; Confidence = 'recorded'; Reason = "recorded in $recordFile" }
            }
        }
    }

    if (-not (Test-Path $Instance.ProjectDir)) {
        return [pscustomobject]@{ SessionId = $null; Path = $null; Confidence = 'error'
            Reason = "project dir missing: $($Instance.ProjectDir) -- this is 'I could not look', NOT 'there is no session'" }
    }

    $files = @(Get-ChildItem $Instance.ProjectDir -Filter *.jsonl -File -ErrorAction SilentlyContinue |
               Sort-Object LastWriteTime -Descending)
    if ($files.Count -eq 0) {
        return [pscustomobject]@{ SessionId = $null; Path = $null; Confidence = 'error'
            Reason = "no .jsonl in $($Instance.ProjectDir)" }
    }

    $cutoff = (Get-Date).AddMinutes(-$AmbiguityWindowMinutes)
    $recent = @($files | Where-Object { $_.LastWriteTime -gt $cutoff })
    if ($recent.Count -gt 1) {
        return [pscustomobject]@{ SessionId = $null; Path = $null; Confidence = 'ambiguous'
            Reason = "$($recent.Count) transcripts written in the last $AmbiguityWindowMinutes min ($($recent.Name -join ', ')) -- refusing to guess which mind is which" }
    }

    [pscustomobject]@{ SessionId = $files[0].BaseName; Path = $files[0].FullName; Confidence = 'guess'
        Reason = 'newest .jsonl in the slug dir -- THIS IS A GUESS and is labelled as one' }
}


function Test-HacsQuiescent {
    <#
    .SYNOPSIS
      Is this instance safe to act on destructively? Two independent witnesses.
    .DESCRIPTION
      Witness 1: no live claude.exe attributable to the instance.
      Witness 2: the transcript's length is unchanged across two samples.

      Neither alone is enough. A process can exist while frozen -- that is exactly
      why the old heartbeat's SKIP rule was wrong, because it used 'a process
      exists' as a proxy for 'actively working' and skipped five wakes over a
      frozen session. And a file can be momentarily quiet mid-turn. Disagreement
      between the two IS the detector.

      TranscriptStill is THREE-VALUED. $null means COULD NOT MEASURE, and must
      never be read as 'still'.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)] $Instance,
        [string] $TranscriptPath,
        [int] $SampleSeconds = 4
    )

    $procs = @(Get-HacsClaudeProcess -Instance $Instance)
    $w1 = ($procs.Count -eq 0)

    $w2 = $null
    $detail = 'no transcript path given -- could not measure'
    if ($TranscriptPath -and (Test-Path $TranscriptPath)) {
        $a = (Get-Item $TranscriptPath).Length
        Start-Sleep -Seconds $SampleSeconds
        $b = (Get-Item $TranscriptPath).Length
        $w2 = ($a -eq $b)
        $detail = "length $a -> $b over ${SampleSeconds}s"
    }

    [pscustomobject]@{
        Quiescent       = ($w1 -and ($w2 -eq $true))
        NoLiveProcess   = $w1
        TranscriptStill = $w2
        LiveProcessIds  = @($procs | ForEach-Object { $_.ProcessId })
        Detail          = $detail
    }
}


function New-HacsResult {
    <#
    .SYNOPSIS
      Build the contract object. Enforces the two rules rather than trusting callers.
    .PARAMETER Hearing
      $true  = proven to hear.
      $false = proven deaf.
      $null  = COULD NOT MEASURE.
      Three states, and they must stay three states.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][ValidateSet('success', 'degraded', 'error')][string] $Status,
        [Parameter(Mandatory)][string] $InstanceId,
        [Parameter(Mandatory)][string] $Message,
        [AllowNull()][object] $Hearing = $null,
        [hashtable] $Extra = @{}
    )

    $hearingText = if ($null -eq $Hearing) { 'unknown' } elseif ($Hearing) { 'true' } else { 'false' }
    $notes = @()

    # RULE 1: never 'success' over a mind that cannot hear.
    if ($Status -eq 'success' -and $Hearing -eq $false) {
        $Status = 'degraded'
        $notes += 'DOWNGRADED: caller claimed success while hearing=false. A chassis that is up but cannot hear is not a success.'
    }
    # RULE 2: unknown is not deaf -- and it is not success either.
    if ($Status -eq 'success' -and $null -eq $Hearing) {
        $Status = 'degraded'
        $notes += 'DOWNGRADED: hearing COULD NOT BE VERIFIED. Unknown is not deaf, and it is not success either.'
    }

    $o = [ordered]@{
        status     = $Status
        instanceId = $InstanceId
        hearing    = $hearingText
        message    = $Message
        at         = (Get-Date).ToString('o')
        chassis    = 'claude-code-windows'
    }
    foreach ($k in $Extra.Keys) { $o[$k] = $Extra[$k] }
    if ($notes.Count) { $o['contractNotes'] = $notes }

    [pscustomobject]$o
}


function Write-HacsResult {
    [CmdletBinding()]
    param([Parameter(Mandatory, ValueFromPipeline)] $Result)
    process { $Result | ConvertTo-Json -Depth 6 }
}


Export-ModuleMember -Function Get-HacsInstance, Write-HacsLog, Get-HacsClaudeProcess, Get-HacsAgentRegistry,
                              Resolve-HacsSessionId, Test-HacsQuiescent,
                              New-HacsResult, Write-HacsResult,
                              ConvertTo-HacsPath, Test-HacsSamePath
