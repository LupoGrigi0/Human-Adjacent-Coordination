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

# Machine-wide INFRASTRUCTURE: belongs to no instance, is shared by every background
# session, and must NEVER be stopped by land -- that would take down every mind on
# the box at once. Measured 2026-09-27 on the first real --bg launch:
#
#   claude daemon run --origin transient --spawned-by {"cwd":"<whoever spawned it>"}
#     (parent: WmiPrvSE.exe -- started via WMI to escape the caller)
#    +- claude --bg-pty-host \\.\pipe\cc-daemon-...-pty-<id> 200 50 -- claude --session-id <uuid> ...
#        +- claude --session-id <uuid> ...          <- the mind; the only one in the registry
#
# The daemon's command line CONTAINS the spawning instance's home dir, so the
# command-line attribution rule would have called it that instance's process, and
# `land -Force` would have killed it. Only JSON's doubled backslashes prevented that.
#
# Matched on the LEADING arguments only, never anywhere in the line: a session's
# command line carries its first prompt verbatim, and a prompt that merely mentions
# "daemon run" must not turn a mind into infrastructure and hide it from the
# double-start guard.
$script:InfrastructureArgPrefix = @('daemon run')

# VIEWERS: `claude attach <id>` is a human's terminal looking at a mind, not a mind.
# Measured 2026-09-27, the first time anyone attached: Lupo's attach client was
# unattributed, so the double-start guard counted it as "might be anyone's" and
# refused to launch EVERY instance. It must never block a launch, and land must
# never kill it -- that would be killing a person's terminal. Leading args only, for
# the same reason as the daemon: a prompt must not be able to disguise a mind.
$script:ViewerArgPrefix = @('attach ')


function Test-HacsInfrastructureProcess {
    <#
    .SYNOPSIS
      True if a claude.exe command line is NOT a mind: shared infrastructure (the
      --bg daemon) or a viewer (`claude attach`, a human's terminal). Judged on its
      LEADING arguments only. Pure; unit-testable.
    #>
    [CmdletBinding()]
    param([string] $CommandLine)
    if (-not $CommandLine) { return $false }
    # Strip the executable: either "quoted path" or an unquoted first token.
    $m = [regex]::Match($CommandLine, '^\s*(?:"[^"]*"|\S+)\s*(.*)$', 'Singleline')
    $rest = if ($m.Success) { $m.Groups[1].Value } else { '' }
    foreach ($pfx in @($script:InfrastructureArgPrefix) + @($script:ViewerArgPrefix)) {
        if ($rest.StartsWith($pfx, [StringComparison]::Ordinal)) { return $true }
    }
    $false
}


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


function ConvertTo-HacsArgString {
    <#
    .SYNOPSIS
      Quote an argv array into ONE Windows command line, by the MSVCRT rules.
    .DESCRIPTION
      Start-Process in Windows PowerShell 5.1 joins -ArgumentList with spaces and
      quotes NOTHING, so an argument containing a space silently becomes two. This
      applies the rules CommandLineToArgvW / the C runtime use to split it back:
      wrap in quotes when needed, double any backslashes that precede a quote, and
      double trailing backslashes so they do not escape the closing quote.
    #>
    [CmdletBinding()]
    param([string[]] $Arguments = @())
    $parts = foreach ($a in $Arguments) {
        $a = [string]$a
        if ($a -ne '' -and $a -notmatch '[\s"]') { $a; continue }
        $s = [regex]::Replace($a, '(\\*)"', { param($m) ($m.Groups[1].Value * 2) + '\"' })
        $s = [regex]::Replace($s, '(\\+)$', { param($m) $m.Groups[1].Value * 2 })
        '"' + $s + '"'
    }
    ($parts -join ' ')
}


function Invoke-HacsNative {
    <#
    .SYNOPSIS
      Run a native executable safely. Returns ExitCode, StdOut, StdErr, TimedOut.
    .DESCRIPTION
      WHY THIS EXISTS -- measured 2026-09-27, on the first real launch:
      `claude --bg` writes "Starting background service..." to STDERR. Under Windows
      PowerShell 5.1 with $ErrorActionPreference = 'Stop', ANY stderr line from a
      native command -- even one redirected with 2>$file or 2>$null -- is wrapped as
      a NativeCommandError and THROWN. launch.ps1 died on that line and emitted no
      JSON at all, breaking the one promise of the contract. land.ps1's
      `claude stop ... 2>&1` and the registry read carried the same latent fault.

      So nothing in this harness calls a native command with & any more. This does:
        - stdout and stderr go to FILES, not pipes. `--bg` starts a daemon; a
          daemon that inherits a pipe handle keeps it open and a reader waiting for
          EOF waits forever. A file handle held open costs nothing.
        - $p.Handle is touched immediately. In PS 5.1 a Start-Process -PassThru
          object reports ExitCode as $null after exit unless the handle was cached
          while the process was alive. $null would then read as 0 -- success.
        - WaitForExit waits for THIS process only, not its descendants (unlike
          Start-Process -Wait, which would wait for the daemon and never return).
        - stdin is ALWAYS an empty file. Measured 2026-09-27: launched from inside
          Start-Job, `claude --bg` hung for 120s with no output at all, while the
          identical call from an interactive shell returned in 1s. A child that
          inherits stdin inherits the CALLER's stdin -- in a PowerShell job that is
          a remoting pipe that never reaches EOF, and a program that reads piped
          stdin as input waits on it forever. Proved with a Python child that reads
          stdin: inherited -> never returned; empty file -> returned instantly. The
          same code must behave identically whether it is called from a terminal,
          a job, or Task Scheduler, so the caller does not get a say.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string] $FilePath,
        [string[]] $Arguments = @(),
        [string]   $WorkingDirectory = (Get-Location).Path,
        [int]      $TimeoutSec = 60
    )
    $tag  = [guid]::NewGuid().ToString('N').Substring(0, 12)
    $outF = Join-Path $env:TEMP "hacs-native-$tag.out"
    $errF = Join-Path $env:TEMP "hacs-native-$tag.err"
    $inF  = Join-Path $env:TEMP "hacs-native-$tag.in"
    [IO.File]::WriteAllText($inF, '')                   # see .DESCRIPTION: stdin is never inherited
    $sp = @{
        FilePath               = $FilePath
        WorkingDirectory       = $WorkingDirectory
        RedirectStandardInput  = $inF
        RedirectStandardOutput = $outF
        RedirectStandardError  = $errF
        NoNewWindow            = $true
        PassThru               = $true
    }
    $argString = ConvertTo-HacsArgString -Arguments $Arguments
    if ($argString) { $sp.ArgumentList = $argString }   # an empty -ArgumentList throws in 5.1

    $p = Start-Process @sp
    $null = $p.Handle                                   # see .DESCRIPTION -- do not remove
    $done = $p.WaitForExit($TimeoutSec * 1000)
    if (-not $done) { try { $p.Kill() } catch { } }

    $read = {
        param($f)
        if (-not (Test-Path $f)) { return '' }
        # FileShare.ReadWrite: a daemon child may still hold the handle open.
        $fs = [IO.File]::Open($f, 'Open', 'Read', 'ReadWrite')
        try { (New-Object IO.StreamReader($fs, [Text.Encoding]::UTF8)).ReadToEnd() } finally { $fs.Dispose() }
    }
    $out = & $read $outF
    $err = & $read $errF
    foreach ($f in $outF, $errF, $inF) { Remove-Item $f -Force -ErrorAction SilentlyContinue }

    [pscustomobject]@{
        ExitCode = if ($done) { $p.ExitCode } else { $null }
        StdOut   = $out
        StdErr   = $err
        TimedOut = -not $done
    }
}


function Get-HacsSessionIdFromCommandLine {
    <#
    .SYNOPSIS
      The session UUID a claude command line is running, or $null. Pure.
    .DESCRIPTION
      Two forms, both measured 2026-09-27 on --bg pty hosts:
        birth:  ... -- claude.exe --session-id 90fa2961-2e6b-4ed2-b8d3-958f2828e4e7 ...
        resume: ... -- claude.exe --resume C:\Users\...\5bc16afe-30f8-...-6dcac3a55555.jsonl
      The first version knew only the birth form, so a RESUMED mind's pty host was
      unattributable and land refused to stop it -- correctly, since it will not act
      over a process it cannot place, but it meant a resumed mind could not land.
      The caller must still confirm the UUID against the registry: a UUID in a
      command line is a claim, the registry is the witness.
    #>
    [CmdletBinding()]
    param([string] $CommandLine)
    if (-not $CommandLine) { return $null }
    $uuid = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'
    $m = [regex]::Match($CommandLine, "--session-id\s+`"?($uuid)")
    if ($m.Success) { return $m.Groups[1].Value.ToLower() }
    # --resume takes a bare id OR a path ending in <uuid>.jsonl. Take the ARGUMENT
    # first -- quoted (paths under a username with a space) or bare -- then look for
    # the uuid at its end. A single regex over the raw line could not cross the
    # space inside the quotes.
    $m = [regex]::Match($CommandLine, '--resume\s+(?:"([^"]*)"|(\S+))')
    if ($m.Success) {
        $arg = if ($m.Groups[1].Success) { $m.Groups[1].Value } else { $m.Groups[2].Value }
        $mm = [regex]::Match($arg, "(?:^|[\\/])($uuid)(?:\.jsonl)?$")
        if ($mm.Success) { return $mm.Groups[1].Value.ToLower() }
    }
    $null
}


function Get-HacsNonceEvidence {
    <#
    .SYNOPSIS
      Does this ONE transcript line prove a mind received the nonce? Returns
      'acknowledged', 'delivered', or $null.
    .DESCRIPTION
      AN ALLOWLIST, NOT A BLOCKLIST -- measured 2026-09-27, first real canary run.
      The first version skipped tool blocks and accepted everything else. The very
      first real delivery produced this, in the recipient's own transcript:

          queue-operation  enqueue   <- nonce here. ACCEPTED, not delivered.
          queue-operation  dequeue
          user (isMeta, origin.kind=peer)   <- nonce here. DELIVERED into context.
          assistant tool_use                <- the mind acting on it
          assistant text                    <- nonce here. ACKNOWLEDGED.

      The canary said HEARING off line one: the queue ledger, which a frozen mind
      writes just as well. It was right that time by luck. A blocklist fails OPEN on
      every entry type its author never saw; this fails CLOSED. A new entry type is
      not evidence until someone decides it is.

      Rules, each one paid for:
        - only 'user' and 'assistant' entries count
        - the nonce must be in the message CONTENT, not metadata (origin.body is a
          description of the send, not the arrival)
        - no tool_use / tool_result anywhere in the entry: in a canary on my own
          transcript that is the instrument appearing in its own reading
        - 'assistant' text  -> acknowledged (the mind said it back)
          'user' content    -> delivered   (it is in the mind's context)
    #>
    [CmdletBinding()]
    param([string] $Line, [Parameter(Mandatory)][string] $Nonce)
    if (-not $Line -or $Line.IndexOf($Nonce, [StringComparison]::OrdinalIgnoreCase) -lt 0) { return $null }
    $x = Get-HacsEntryContent -Line $Line
    if (-not $x -or $x.Text.IndexOf($Nonce, [StringComparison]::OrdinalIgnoreCase) -lt 0) { return $null }
    if ($x.Type -eq 'assistant') { 'acknowledged' } else { 'delivered' }
}


function Get-HacsEntryContent {
    <#
    .SYNOPSIS
      The ONE definition of "a transcript line whose content a mind received or said".
      Returns @{Type='user'|'assistant'; Text=...} or $null. No nonce involved.
    .DESCRIPTION
      Shared by Get-HacsNonceEvidence (is the nonce here?) and Test-HacsTranscriptSchema
      (can I recognise ANYTHING here?). One rule, two callers -- because two copies of
      "what counts as delivered" would agree by luck until an input changed, which is
      the disease Messenger has now seen five times in this family.
    #>
    [CmdletBinding()]
    param([string] $Line)
    if (-not $Line -or -not $Line.Trim()) { return $null }
    try { $e = $Line | ConvertFrom-Json } catch { return $null }
    $names = @($e.PSObject.Properties.Name)
    if ($names -notcontains 'type' -or $e.type -notin @('user', 'assistant')) { return $null }
    if ($names -contains 'toolUseResult') { return $null }
    if ($names -notcontains 'message' -or -not $e.message) { return $null }
    if (@($e.message.PSObject.Properties.Name) -notcontains 'content') { return $null }

    $c = $e.message.content
    $text = $null
    if ($c -is [string]) { $text = $c }
    else {
        $blocks = @(foreach ($b in $c) { $b })
        foreach ($b in $blocks) {
            if (@($b.PSObject.Properties.Name) -contains 'type' -and $b.type -in @('tool_use', 'tool_result')) { return $null }
        }
        $text = (@(foreach ($b in $blocks) { if (@($b.PSObject.Properties.Name) -contains 'text') { $b.text } }) -join "`n")
    }
    if (-not $text) { return $null }
    @{ Type = [string]$e.type; Text = [string]$text }
}


function Test-HacsTranscriptSchema {
    <#
    .SYNOPSIS
      Can the evidence rules recognise this transcript AT ALL? The instrument checking
      its own eyesight before it is allowed to report blindness in someone else.
    .DESCRIPTION
      Forge's review, 2026-09-27: the evidence allowlist fails CLOSED, which is right --
      but if a Claude Code update changed the transcript schema, a hearing, active mind
      would produce no recognisable lines, the transcript would keep growing, and the
      canary would say "ACTIVE and still did not receive it". The confident wrong answer
      that gets a healthy mind landed. So: before minting a nonce, prove the rules can
      see at least one user line and one assistant line in this very file.
    #>
    [CmdletBinding()]
    param([Parameter(Mandatory)][string] $Path, [int] $TailBytes = 2MB)
    $r = [ordered]@{ Recognised = $false; UserLines = 0; AssistantLines = 0; Scanned = 0; Reason = '' }
    if (-not (Test-Path $Path)) { $r.Reason = "no transcript at $Path"; return [pscustomobject]$r }
    $fs = [IO.File]::Open($Path, 'Open', 'Read', 'ReadWrite')
    try {
        $start = [Math]::Max(0, $fs.Length - $TailBytes)
        $null = $fs.Seek($start, 'Begin')
        $tail = (New-Object IO.StreamReader($fs, [Text.Encoding]::UTF8)).ReadToEnd()
    } finally { $fs.Dispose() }
    $lines = @($tail -split "`n")
    if ($start -gt 0 -and $lines.Count -gt 0) { $lines = @($lines | Select-Object -Skip 1) }   # first line is partial
    foreach ($ln in $lines) {
        if (-not $ln.Trim()) { continue }
        $r.Scanned++
        $x = Get-HacsEntryContent -Line $ln
        if ($x) { if ($x.Type -eq 'user') { $r.UserLines++ } else { $r.AssistantLines++ } }
    }
    $r.Recognised = ($r.UserLines -gt 0 -and $r.AssistantLines -gt 0)
    if (-not $r.Recognised) {
        $r.Reason = "scanned $($r.Scanned) lines: $($r.UserLines) user and $($r.AssistantLines) assistant content lines recognised; need at least one of each"
    }
    [pscustomobject]$r
}


function Get-HacsAgentRegistryResult {
    <#
    .SYNOPSIS
      `claude agents --json`, parsed, WITH whether it could be read: {Ok, Rows, Error}.
    .DESCRIPTION
      P1 (DOORBELL-DESIGN.md). Get-HacsAgentRegistry returns @() on every failure
      (missing exe, nonzero exit, timeout, unparseable output), which is the same
      value as "no sessions are running". The canary read that as NOT HOME and
      told the caller to relaunch a mind it had never been able to look for. Use
      this function wherever "nobody is registered" leads to an action; Ok=$false
      is "could not look" and must never be read as an empty room.
      Empty stdout is treated as a failed read: a working `claude agents --json`
      prints a JSON array, `[]` when nothing runs. If that is ever wrong, the
      error is in the safe direction (ERROR rather than NOT HOME).
      HACS_TEST_SIMULATE_REGISTRY_FAILURE injects a failure for the tests.
    #>
    [CmdletBinding()]
    param([string] $ClaudeExe = "$env:USERPROFILE\.local\bin\claude.exe")
    function NotOk([string] $why) { [pscustomobject]@{ Ok = $false; Rows = @(); Error = $why } }
    if ($env:HACS_TEST_SIMULATE_REGISTRY_FAILURE) { return (NotOk 'simulated registry failure (HACS_TEST_SIMULATE_REGISTRY_FAILURE is set)') }
    if (-not (Test-Path $ClaudeExe)) { return (NotOk "claude not found at $ClaudeExe") }
    try {
        $n = Invoke-HacsNative -FilePath $ClaudeExe -Arguments @('agents', '--json') -TimeoutSec 30
        if ($n.TimedOut)          { return (NotOk 'claude agents --json timed out after 30s') }
        if ($n.ExitCode -ne 0)    { return (NotOk "claude agents --json exited $($n.ExitCode)") }
        $raw = $n.StdOut
        if (-not $raw -or -not $raw.Trim()) { return (NotOk 'claude agents --json printed nothing') }
        $parsed = $raw | ConvertFrom-Json
        # Emit element by element: see the @() nesting note in Get-HacsAgentRegistry.
        $rows = @(foreach ($x in $parsed) { $x })
        return [pscustomobject]@{ Ok = $true; Rows = $rows; Error = $null }
    } catch { return (NotOk "could not read claude agents --json: $($_.Exception.Message)") }
}


function Get-HacsMutexName {
    <#
    .SYNOPSIS
      The ONLY place a harness mutex name is built. DOORBELL-DESIGN.md 3.3: two
      callers spelling the same lock differently would each hold "the lock" and
      exclude nobody -- a failure that never announces itself. A test asserts
      that no other file builds a 'hacs-<kind>-' name by hand.
    #>
    param(
        [Parameter(Mandatory)][ValidateSet('launch', 'ring', 'ledger')][string] $Kind,
        [Parameter(Mandatory)][string] $InstanceId
    )
    "Global\hacs-$Kind-$InstanceId"
}


function Lock-HacsInstance {
    <#
    .SYNOPSIS
      Take a per-instance named mutex. Returns {Ok, Busy, HolderPid, Abandoned, Name, Mutex}.
    .DESCRIPTION
      Serializes every caller that could start or ring a mind: the watcher, a
      human, the logon task. Busy is reported with the holder's pid (from a
      sidecar file) so a refusal can say WHO holds it. An AbandonedMutexException
      means the previous holder died holding it: the lock is ours, and the
      abandonment is returned so the caller can log it as a finding.
      Release with Unlock-HacsInstance, from the same thread.
    #>
    param(
        [Parameter(Mandatory)] $Instance,
        [Parameter(Mandatory)][ValidateSet('launch', 'ring', 'ledger')][string] $Kind,
        [int] $TimeoutSec = 10
    )
    $name    = Get-HacsMutexName -Kind $Kind -InstanceId $Instance.InstanceId
    $sidecar = Join-Path $Instance.RuntimeDir ".lock-$Kind"
    $m = New-Object System.Threading.Mutex($false, $name)
    $got = $false; $abandoned = $false
    try { $got = $m.WaitOne($TimeoutSec * 1000) }
    catch [System.Threading.AbandonedMutexException] { $got = $true; $abandoned = $true }
    if (-not $got) {
        $holder = $null
        try { $holder = (Get-Content $sidecar -Raw -ErrorAction Stop).Trim() } catch { }
        $m.Dispose()
        return [pscustomobject]@{ Ok = $false; Busy = $true; HolderPid = $holder; Abandoned = $false; Name = $name; Mutex = $null; Sidecar = $sidecar }
    }
    try { [IO.File]::WriteAllText($sidecar, [string]$PID) } catch { }
    [pscustomobject]@{ Ok = $true; Busy = $false; HolderPid = $PID; Abandoned = $abandoned; Name = $name; Mutex = $m; Sidecar = $sidecar }
}


function Unlock-HacsInstance {
    param([Parameter(Mandatory)] $Lock)
    if (-not $Lock -or -not $Lock.Ok -or -not $Lock.Mutex) { return }
    try { Remove-Item -LiteralPath $Lock.Sidecar -ErrorAction SilentlyContinue } catch { }
    try { $Lock.Mutex.ReleaseMutex() } catch { }
    $Lock.Mutex.Dispose()
}


function Get-HacsInbox {
    <#
    .SYNOPSIS
      The instance's HACS inbox, WITH whether it could be looked at:
      {Ok, TotalUnread, VisibleIds, MoreUnread, Me, Error}.
    .DESCRIPTION
      DOORBELL-DESIGN.md 3.3. Runs `hacs.py inbox --json` (P3: exit 3 = could not
      look). Ok is $true only when hacs.py exited 0, printed {"ok": true ...} and
      reported the instance id we asked for. Every other outcome is Ok=$null with
      a reason, and TotalUnread is $null -- never 0. Without the Me check, the
      instance_id.txt fallback in hacs.py would silently read Lodestone's inbox on
      behalf of a test fixture.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)] $Instance,
        [string] $HacsPy = 'D:\Lupo\Source\AI\instance-archaeology\src\hacs\hacs.py',
        [string] $Python = 'python',
        [int]    $TimeoutSec = 60
    )
    function NotOk([string] $why) {
        [pscustomobject]@{ Ok = $null; TotalUnread = $null; VisibleIds = @(); MoreUnread = $null; Me = $null; Error = $why }
    }
    $saved = @{ id = $env:HACS_INSTANCE_ID; enc = $env:PYTHONIOENCODING }
    try {
        # Invoke-HacsNative has no environment parameter; the child inherits ours.
        $env:HACS_INSTANCE_ID = $Instance.InstanceId
        $env:PYTHONIOENCODING = 'utf-8'
        $n = Invoke-HacsNative -FilePath $Python -Arguments @($HacsPy, 'inbox', '--json') -TimeoutSec $TimeoutSec
    } catch {
        return (NotOk "could not run hacs.py: $($_.Exception.Message)")
    } finally {
        $env:HACS_INSTANCE_ID = $saved.id
        $env:PYTHONIOENCODING = $saved.enc
    }
    if ($n.TimedOut) { return (NotOk "hacs.py inbox timed out after ${TimeoutSec}s") }
    $j = $null
    try { $j = ($n.StdOut | Out-String).Trim() | ConvertFrom-Json } catch { }
    if ($n.ExitCode -ne 0) {
        $why = if ($j -and $j.error) { $j.error } else { "hacs.py inbox exited $($n.ExitCode)" }
        return (NotOk $why)
    }
    if (-not $j -or $j.ok -ne $true)            { return (NotOk 'hacs.py inbox --json did not report ok') }
    if ([string]$j.me -ne $Instance.InstanceId) { return (NotOk "hacs.py read the inbox of '$($j.me)', not '$($Instance.InstanceId)'") }
    [pscustomobject]@{
        Ok          = $true
        TotalUnread = [int]$j.total_unread
        VisibleIds  = @($j.ids | ForEach-Object { [string]$_ })
        MoreUnread  = [bool]$j.more_unread
        Me          = [string]$j.me
        Error       = $null
    }
}


function Get-HacsAgentRegistry {
    <#
    .SYNOPSIS
      `claude agents --json`, parsed. Returns @() if it cannot be read.
      Kept for callers that only ATTRIBUTE (an unread registry leaves processes
      'unknown', which already makes them more careful). Anything that ACTS on
      "no row" must use Get-HacsAgentRegistryResult instead.
    .DESCRIPTION
      This is the ONLY source on Windows that reliably maps a claude pid to the
      working directory it was started in. Win32_Process exposes a command line but
      NOT a cwd, and an interactive session's cwd comes from the shell rather than
      from an argument -- so the command line frequently does not mention the home
      directory at all.
    #>
    [CmdletBinding()]
    param([string] $ClaudeExe = "$env:USERPROFILE\.local\bin\claude.exe")
    $r = Get-HacsAgentRegistryResult -ClaudeExe $ClaudeExe
    if (-not $r.Ok) { return }
    $parsed = $r.Rows
    try {
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
    # P2 (DOORBELL-DESIGN.md): this was `-ErrorAction SilentlyContinue`, so a CIM
    # failure looked exactly like "no claude processes", and launch's double-start
    # guard let the launch through over a live mind. A look that failed must never
    # read as an empty room, so it THROWS and every caller fails closed.
    # HACS_TEST_SIMULATE_CIM_FAILURE injects that failure for the tests (the
    # battery-watch -Simulate pattern); in production it can only make things refuse.
    if ($env:HACS_TEST_SIMULATE_CIM_FAILURE) {
        throw "could not list claude processes: simulated CIM failure (HACS_TEST_SIMULATE_CIM_FAILURE is set)"
    }
    try {
        $procs = @(Get-CimInstance Win32_Process -Filter "Name='claude.exe'" -ErrorAction Stop)
    } catch {
        throw "could not list claude processes: $($_.Exception.Message)"
    }
    if ($procs.Count -eq 0) { return }

    $registry = @(Get-HacsAgentRegistry)
    $cwdByPid = @{}
    $cwdBySession = @{}
    foreach ($a in $registry) {
        $names = @($a.PSObject.Properties.Name)
        if ($names -contains 'pid' -and $names -contains 'cwd') { $cwdByPid[[int]$a.pid] = $a.cwd }
        if ($names -contains 'sessionId' -and $names -contains 'cwd' -and $a.sessionId) { $cwdBySession[[string]$a.sessionId] = $a.cwd }
    }

    $out = @()
    foreach ($p in $procs) {
        $cl = "$($p.CommandLine)"
        $isHelper = $false
        foreach ($h in $script:NotASession) { if ($cl -like "*$h*") { $isHelper = $true } }
        if ($isHelper) { continue }
        # The --bg daemon: shared by every background mind. Never anyone's to stop.
        if (Test-HacsInfrastructureProcess -CommandLine $cl) { continue }

        # A --bg pty host is not in the registry, but it names its session -- as
        # --session-id <uuid> at birth, or --resume <path>\<uuid>.jsonl on a resume --
        # and the registry maps that session to exactly one cwd.
        $cmdSid  = Get-HacsSessionIdFromCommandLine -CommandLine $cl
        $sessCwd = if ($cmdSid -and $cwdBySession.ContainsKey($cmdSid)) { $cwdBySession[$cmdSid] } else { $null }

        $attr = 'unknown'
        $how  = 'neither the agent registry nor the command line attributed this process'
        if ($cwdByPid.ContainsKey([int]$p.ProcessId)) {
            if (Test-HacsSamePath $cwdByPid[[int]$p.ProcessId] $Instance.HomeDir) {
                $attr = 'matched'; $how = 'agent registry cwd'
            } else {
                $attr = 'other';   $how = "agent registry cwd = $($cwdByPid[[int]$p.ProcessId])"
            }
        } elseif ($sessCwd) {
            if (Test-HacsSamePath $sessCwd $Instance.HomeDir) {
                $attr = 'matched'; $how = "session $cmdSid named in command line -> registry cwd"
            } else {
                $attr = 'other';   $how = "--session-id in command line -> registry cwd = $sessCwd"
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


function Get-HacsPresence {
    <#
    .SYNOPSIS
      Is this mind home? HOME / ATTENDED / TRANSITIONING / NOT_HOME / UNKNOWN,
      with every witness's evidence. DOORBELL-DESIGN.md 3.3.
    .DESCRIPTION
      The watcher acts on this, so the expensive answer is the safe one:
        UNKNOWN        a witness could not look (registry, CIM, transcript).
                       Nothing may act on it.
        ATTENDED       a live non-background row (a human's session). Never
                       relaunched over.
        HOME           exactly one live background row for the recorded session,
                       and its pid is alive.
        NOT_HOME       ALL FOUR witnesses agree the mind is gone:
                         1 a successful registry read with no live row;
                         2 zero claude processes attributable to it OR unattributed
                           (an unattributed one could be it);
                         3 the transcript is still across a sample AND its last
                           write is at least -QuietFloorSec old (the reaper writes
                           its bookkeeping ~30 s after the last activity, FINDINGS 6d);
                         4 no claude process command line names the session (a pty
                           host can outlive its registry row).
        TRANSITIONING  any disagreement between witnesses. Forge's guard: never
                       resume a mind that is still shutting down.
      daemon.status.json is never a witness: it showed workers:{} while the
      roster held a live session.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)] $Instance,
        [int] $SampleSeconds = 5,
        [int] $QuietFloorSec = 60
    )
    $ev = [ordered]@{}
    function Out([string] $state, [string] $why) {
        [pscustomobject]@{ State = $state; Why = $why; Evidence = [pscustomobject]$ev }
    }

    $sid = Resolve-HacsSessionId -Instance $Instance
    $ev.sessionConfidence = $sid.Confidence
    $ev.sessionId = $sid.SessionId
    if ($sid.Confidence -notin @('recorded', 'explicit')) {
        return (Out 'UNKNOWN' "no recorded session for this instance ($($sid.Confidence): $($sid.Reason)); refusing to judge presence by a guess")
    }

    $reg = Get-HacsAgentRegistryResult
    $ev.registryReadable = [bool]$reg.Ok
    if (-not $reg.Ok) { return (Out 'UNKNOWN' "agent registry unreadable: $($reg.Error)") }
    $rows = @($reg.Rows | Where-Object {
        $n = @($_.PSObject.Properties.Name)
        ($n -contains 'pid') -and $_.pid -and (
            (($n -contains 'sessionId') -and ([string]$_.sessionId -eq [string]$sid.SessionId)) -or
            (($n -contains 'cwd') -and $_.cwd -and (Test-HacsSamePath $_.cwd $Instance.HomeDir))) })
    $ev.liveRows = @($rows | ForEach-Object { "$($_.kind) pid $($_.pid) session $($_.sessionId)" })

    try {
        $allProcs = @(Get-CimInstance Win32_Process -Filter "Name='claude.exe'" -ErrorAction Stop)
        $mine     = @(Get-HacsClaudeProcess -Instance $Instance)
    } catch { return (Out 'UNKNOWN' "could not list processes: $($_.Exception.Message)") }
    $ev.attributableOrUnknownPids = @($mine | ForEach-Object { "$($_.ProcessId) ($($_.HacsAttribution))" })
    $naming = @($allProcs | Where-Object { "$($_.CommandLine)" -like "*$($sid.SessionId)*" })
    $ev.processesNamingSession = @($naming | ForEach-Object { $_.ProcessId })

    $attended = @($rows | Where-Object { [string]$_.kind -ne 'background' })
    if ($attended.Count -gt 0) {
        return (Out 'ATTENDED' "a non-background session is live here (pid $(($attended | ForEach-Object { $_.pid }) -join ',')): a human is attending; never relaunch over them")
    }

    $bg = @($rows | Where-Object { [string]$_.kind -eq 'background' -and [string]$_.sessionId -eq [string]$sid.SessionId })
    if ($bg.Count -eq 1 -and $rows.Count -eq 1) {
        $alive = @($allProcs | Where-Object { [int]$_.ProcessId -eq [int]$bg[0].pid }).Count -eq 1
        $ev.rowPidAlive = $alive
        if ($alive) { return (Out 'HOME' "one live background session, pid $($bg[0].pid), and the process exists") }
        return (Out 'TRANSITIONING' "the registry lists pid $($bg[0].pid) but that process is gone")
    }
    if ($rows.Count -gt 0) {
        return (Out 'TRANSITIONING' "$($rows.Count) live rows for this instance, not exactly one background row for its session")
    }

    # No live row: is it really gone? All four witnesses must agree.
    if ($mine.Count -gt 0) {
        return (Out 'TRANSITIONING' "no registry row, but claude process(es) that are or could be this mind are alive: $($ev.attributableOrUnknownPids -join ', ')")
    }
    if ($naming.Count -gt 0) {
        return (Out 'TRANSITIONING' "no registry row, but a process still names session $($sid.SessionId) (pid $($naming.ProcessId -join ','))")
    }
    $q = Test-HacsQuiescent -Instance $Instance -TranscriptPath $sid.Path -SampleSeconds $SampleSeconds
    $ev.transcriptStill = $q.TranscriptStill
    $ev.transcriptDetail = $q.Detail
    if ($null -eq $q.TranscriptStill) { return (Out 'UNKNOWN' "could not measure the transcript: $($q.Detail)") }
    if (-not $q.TranscriptStill)     { return (Out 'TRANSITIONING' "the transcript is still growing ($($q.Detail))") }
    $age = ((Get-Date) - (Get-Item $sid.Path).LastWriteTime).TotalSeconds
    $ev.transcriptQuietSec = [int]$age
    if ($age -lt $QuietFloorSec) {
        return (Out 'TRANSITIONING' "the transcript was written $([int]$age) s ago (< $QuietFloorSec s): the reaper may still be writing its bookkeeping")
    }
    Out 'NOT_HOME' "no live row, no process that is or could be it, nothing naming its session, transcript quiet for $([int]$age) s"
}


function Invoke-HacsRing {
    <#
    .SYNOPSIS
      Ring a mind's own doorbell through the supported sender and judge, from its
      transcript, whether it heard. Returns {Verdict, Hearing, Evidence, Detail,
      Nonce, RingName}. Shared by launch.ps1 (step 8) and the outside watcher,
      so there is ONE classifier. DOORBELL-DESIGN.md 3.3.
    .DESCRIPTION
      The ringer is a one-shot `claude --print` holding SendMessage. It is an
      injection surface, so its prompt is built HERE, only from an integer, the
      session name and a word nonce: subjects and bodies of mail never enter it.
      Callers cannot pass text.

        HEARING        the nonce reached the mind                          Hearing $true
        DEAF           enqueued in its transcript, never delivered, and
                       the transcript was still                             Hearing $false
        QUEUED_BUSY    enqueued, not yet delivered, transcript growing: a
                       mind in a long turn has not dequeued yet             Hearing $null
        RINGER_FAILED  no enqueue at all, or the sender failed (one retry
                       with different wording first). Not about the mind.   Hearing $null
        NOT_HOME       the canary found no live session                     Hearing $null
        AMBIGUOUS      not exactly one live registry row carries the name   Hearing $null
        ERROR          the canary could not mark or could not judge         Hearing $null
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)] $Instance,
        [Parameter(Mandatory)][ValidateSet('launch', 'mail')][string] $Reason,
        [int]    $Unread = 0,
        [string] $RingName,
        [string] $ClaudeExe = "$env:USERPROFILE\.local\bin\claude.exe",
        [string] $SenderModel = 'haiku',
        [string] $SenderDir = 'D:\Lupo\hacs-runtime\_liveness-probe',
        [int]    $TimeoutSec = 90
    )
    $canary = Join-Path (Split-Path $PSScriptRoot -Parent) 'canary.ps1'
    # Verdicts are built by a scriptblock held in a local VARIABLE, and the canary
    # runs as its OWN PROCESS. Measured 2026-10-08, twice: a helper FUNCTION here
    # named R resolved to PowerShell's alias r (Invoke-History); renamed, it then
    # vanished mid-call because canary.ps1, run in-process, re-imports this module
    # with -Force. Either way every verdict line errored and execution fell through
    # into a second, redundant ring.
    $mkVerdict = { param([string] $v, $hearing, [string] $detail, $evidence = $null, $nonce = $null)
        [pscustomobject]@{ Verdict = $v; Hearing = $hearing; Detail = $detail; Evidence = $evidence; Nonce = $nonce; RingName = $RingName } }
    $ps = (Get-Process -Id $PID).Path
    $runCanary = { param([string[]] $canaryArgs, [int] $timeout)
        (Invoke-HacsNative -FilePath $ps -Arguments (@('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $canary) + $canaryArgs) -TimeoutSec $timeout).StdOut }

    $reg = Get-HacsAgentRegistryResult -ClaudeExe $ClaudeExe
    if (-not $reg.Ok) { return (& $mkVerdict 'ERROR' $null "could not read the agent registry ($($reg.Error)), so I cannot address the ring") }
    if (-not $RingName) {
        # The name a session ANSWERS to is the one it was born with, and a mind
        # adopted by resume may not be named after its instance id (Lodestone-8ec9
        # answers to 'Lodestone'). Take it from the registry row for the recorded
        # session; fall back to the instance id.
        $rsid = Resolve-HacsSessionId -Instance $Instance
        $row = @($reg.Rows | Where-Object { @($_.PSObject.Properties.Name) -contains 'sessionId' -and [string]$_.sessionId -eq [string]$rsid.SessionId -and
                                           @($_.PSObject.Properties.Name) -contains 'name' -and $_.name }) | Select-Object -First 1
        $RingName = if ($row) { [string]$row.name } else { $Instance.InstanceId }
    }
    $named = @($reg.Rows | Where-Object { @($_.PSObject.Properties.Name) -contains 'name' -and [string]$_.name -eq $RingName -and $_.pid })
    if ($named.Count -ne 1) {
        return (& $mkVerdict 'AMBIGUOUS' $null "ambiguous address: $($named.Count) live sessions are named '$RingName'. A ring by name must reach exactly one mind; refusing.")
    }

    $markRaw = & $runCanary @('-InstanceId', $Instance.InstanceId, '-Mark') 60
    $mark = $null; try { $mark = $markRaw | ConvertFrom-Json } catch { }
    if (-not $mark -or @($mark.PSObject.Properties.Name) -notcontains 'nonce') {
        $why = if ($mark -and @($mark.PSObject.Properties.Name) -contains 'detail') { $mark.detail } else { ($markRaw -replace '\s+', ' ').Trim() }
        return (& $mkVerdict 'ERROR' $null "the canary could not mark ($why)")
    }
    $nonce = [string]$mark.nonce
    $body = if ($Reason -eq 'mail') {
        "You have $([int]$Unread) unread HACS messages (doorbell $nonce). Run hacs.py inbox, then re-arm your doorbell."
    } else {
        "Harness hearing check at launch. Please reply in one short line containing this word exactly: $nonce"
    }
    $asks = @(
        "Use the SendMessage tool to send this exact text to the session named '$RingName': $body",
        "Please deliver a message with your SendMessage tool. Recipient: the session named '$RingName'. Message text: $body"
    )
    $null = New-Item -ItemType Directory -Force -Path $SenderDir -ErrorAction SilentlyContinue
    Write-HacsLog -Instance $Instance -Log 'ring.log' -Message "RING reason=$Reason unread=$([int]$Unread) name='$RingName' nonce=$nonce offset=$($mark.offset)"

    $sendFailed = $null
    foreach ($ask in $asks) {
        $snd = Invoke-HacsNative -FilePath $ClaudeExe -Arguments @('--print', '--model', $SenderModel, $ask) -WorkingDirectory $SenderDir -TimeoutSec 180
        Write-HacsLog -Instance $Instance -Log 'ring.log' -Message "sender: exit=$($snd.ExitCode) timedOut=$($snd.TimedOut) said='$(($snd.StdOut -replace '\s+',' ').Trim())'"
        if ($snd.TimedOut -or $snd.ExitCode -ne 0) { $sendFailed = "the sender failed (exit $($snd.ExitCode), timedOut $($snd.TimedOut))"; continue }
        $sendFailed = $null
        $judgeRaw = & $runCanary @('-InstanceId', $Instance.InstanceId, '-Nonce', $nonce, '-FromOffset', [string]$mark.offset, '-TimeoutSec', [string]$TimeoutSec) ($TimeoutSec + 60)
        $judge = $null; try { $judge = $judgeRaw | ConvertFrom-Json } catch { }
        $names = if ($judge) { @($judge.PSObject.Properties.Name) } else { @() }
        $verdict = if ($names -contains 'verdict') { [string]$judge.verdict } else { 'ERROR' }
        $evidence = if ($names -contains 'evidence') { $judge.evidence } else { $null }
        $seen = @(if ($names -contains 'nonceSightings') { $judge.nonceSightings })
        $grew = if ($names -contains 'transcriptGrewBytes') { [int64]$judge.transcriptGrewBytes } else { 0 }
        switch ($verdict) {
            'HEARING' { return (& $mkVerdict 'HEARING' $true "HEARING ($evidence): its own doorbell was rung and the nonce reached it." $evidence $nonce) }
            'DEAF' {
                if ($seen.Count -eq 0) { continue }   # never reached the queue: the RINGER did not deliver; try the other wording
                if ($grew -gt 0) {
                    return (& $mkVerdict 'QUEUED_BUSY' $null "the doorbell is in the mind's queue ($($seen -join '; ')) and its transcript is still growing: a mind in a long turn has not dequeued it yet. Not deafness." $null $nonce)
                }
                return (& $mkVerdict 'DEAF' $false "DEAF: the doorbell reached the mind's queue ($($seen -join '; ')) but never its context, and the transcript was still. $($judge.detail)" $null $nonce)
            }
            'ERROR' {
                if ($names -contains 'notHome' -and $judge.notHome -eq $true) {
                    return (& $mkVerdict 'NOT_HOME' $null "the canary found no live session: $($judge.detail)" $null $nonce)
                }
                return (& $mkVerdict 'ERROR' $null "the canary could not judge: $(if ($judge) { $judge.detail } else { ($judgeRaw -replace '\s+', ' ').Trim() })" $null $nonce)
            }
            default { return (& $mkVerdict 'ERROR' $null "the canary could not judge: $(if ($judge) { $judge.detail })" $null $nonce) }
        }
    }
    $why = if ($sendFailed) { $sendFailed } else { "no enqueue in the mind's transcript after two wordings" }
    & $mkVerdict 'RINGER_FAILED' $null "the RINGER did not deliver ($why) -- declined, misaddressed ('$RingName'), or failed. That is not evidence about the mind." $null $nonce
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

    .PARAMETER HearingNotApplicable
      A fourth state, and it exists because the rule was firing where the question
      does not apply. `land` stops a session; whether it could hear is irrelevant
      to whether it stopped. Without this, land reported 'degraded' on EVERY run,
      including the clean ones -- and a guard that always fires is one people learn
      to click past, which is how a real warning gets missed. Measured 2026-09-25,
      on the first run of land.ps1.

      Use it ONLY where hearing genuinely is not the question. If you are tempted
      to use it because the canary was inconvenient, that is the failure this
      module exists to prevent: 'unknown' is the honest answer there, and 'unknown'
      is supposed to cost you a 'success'.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][ValidateSet('success', 'degraded', 'error')][string] $Status,
        [Parameter(Mandatory)][string] $InstanceId,
        [Parameter(Mandatory)][string] $Message,
        [AllowNull()][object] $Hearing = $null,
        [switch] $HearingNotApplicable,
        [switch] $HearingNotAttempted,
        [hashtable] $Extra = @{}
    )

    # A FIFTH state (Forge's review, 2026-09-27). 'unknown' means "I tried and could
    # not tell". 'not-attempted' means "I was told not to try". Collapsing them makes
    # a deliberate opt-out read like a measurement failure -- and makes a real
    # measurement failure read like routine. Both are still capped at 'degraded':
    # nothing proves this mind hears.
    if ($HearingNotAttempted) {
        $o = [ordered]@{
            status = $(if ($Status -eq 'success') { 'degraded' } else { $Status })
            instanceId = $InstanceId; hearing = 'not-attempted'; message = $Message
            at = (Get-Date).ToString('o'); chassis = 'claude-code-windows'
        }
        foreach ($k in $Extra.Keys) { $o[$k] = $Extra[$k] }
        if ($Status -eq 'success') { $o['contractNotes'] = @('DOWNGRADED: hearing was NOT ATTEMPTED (caller opted out). Nothing proves this mind hears.') }
        return [pscustomobject]$o
    }

    $hearingText = if ($HearingNotApplicable) { 'n/a' }
                   elseif ($null -eq $Hearing) { 'unknown' }
                   elseif ($Hearing) { 'true' } else { 'false' }
    $notes = @()
    if ($HearingNotApplicable) {
        # Short-circuit both rules: they are about starting a mind, not stopping one.
        $o = [ordered]@{
            status = $Status; instanceId = $InstanceId; hearing = 'n/a'
            message = $Message; at = (Get-Date).ToString('o'); chassis = 'claude-code-windows'
        }
        foreach ($k in $Extra.Keys) { $o[$k] = $Extra[$k] }
        return [pscustomobject]$o
    }

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


Export-ModuleMember -Function Get-HacsInstance, Write-HacsLog, Get-HacsClaudeProcess, Get-HacsAgentRegistry, Get-HacsAgentRegistryResult, Get-HacsInbox, Get-HacsMutexName, Lock-HacsInstance, Unlock-HacsInstance, Get-HacsPresence, Invoke-HacsRing,
                              Invoke-HacsNative, ConvertTo-HacsArgString, Get-HacsNonceEvidence,
                              Test-HacsInfrastructureProcess, Get-HacsSessionIdFromCommandLine,
                              Get-HacsEntryContent, Test-HacsTranscriptSchema,
                              Resolve-HacsSessionId, Test-HacsQuiescent,
                              New-HacsResult, Write-HacsResult,
                              ConvertTo-HacsPath, Test-HacsSamePath
