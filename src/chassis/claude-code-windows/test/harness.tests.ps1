<#
.SYNOPSIS
  Regression suite for the claude-code-windows chassis. Run it after every change.

.DESCRIPTION
  Every assertion here exists because something was wrong. Several exist because a
  PREVIOUS VERSION OF THIS FILE was wrong, which is its own lesson.

  THE HAZARD THIS SUITE KEEPS HITTING
  -----------------------------------
  A test harness can fail open AND fail closed. On 2026-09-25, writing these, my
  assertions manufactured three FALSE FAILURES in one evening:

    1. Exit-code control built with nested backtick-quotes through cscript ->
       the quoting broke, the shim looked broken, the shim was fine.
    2. `(... | Where-Object {...}).Count` on a single CimInstance -> under
       Set-StrictMode a lone object has no .Count, so a correct result read as 0.
    3. Same shape again, one test later.

  A false failure is more dangerous than a false pass, because the response to it
  is to go and damage working code. So:

    * ALWAYS wrap a pipeline result in @() before reading .Count.
    * ALWAYS capture then measure. Never read $LASTEXITCODE through a pipe.
    * When a test fails, ask whether the TEST is right before asking how to make
      it pass. If you cannot state correct behaviour without looking, you are
      about to negotiate with your own assertion.

  And the positive form: every check that reports an absence must be run against a
  case known to exist, in the same suite, so "found nothing" can be distinguished
  from "cannot see".

.NOTES
  Author: Lodestone <lodestone@smoothcurves.nexus>
  Collaborator: Lupo
#>

[CmdletBinding()]
param([string] $LiveInstanceId = 'Lodestone-8ec9')

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
Import-Module (Join-Path $root 'lib\HacsHarness.psm1') -Force

$script:pass = 0
$script:fail = 0
$script:skip = 0

function Check {
    param([string] $Name, $Got, $Want)
    if ("$Got" -eq "$Want") { $script:pass++; Write-Host ("  PASS  " + $Name) -ForegroundColor Green }
    else { $script:fail++; Write-Host ("  FAIL  " + $Name + " -- got '" + $Got + "' wanted '" + $Want + "'") -ForegroundColor Red }
}
function Skip { param([string] $Name, [string] $Why)
    $script:skip++; Write-Host ("  SKIP  " + $Name + " -- " + $Why) -ForegroundColor Yellow }
function Section { param([string] $N) Write-Host "`n=== $N ===" -ForegroundColor Cyan }
# Read a result field defensively: under StrictMode a missing property THROWS, and an
# unexpected result shape must fail as a CHECK, not abort the whole suite.
function JP($o, [string] $n) { if ($o -and @($o.PSObject.Properties.Name) -contains $n) { $o.$n } else { "<no $n>" } }

# ------------------------------------------------------------------ parse ----
Section 'every chassis script PARSES (a script that cannot parse never reaches its trap)'
# 2026-09-27: "$recordId:" and then "$Nonce:" -- twice in one hour -- parsed as
# drive-qualified variables, and the whole script died at load time with NO JSON. The
# top-level trap cannot catch that: a script that does not parse never runs it. A
# habit (my manual parse check) caught both; this makes it a mechanism.
$ctrlErr = $null
$null = [System.Management.Automation.Language.Parser]::ParseInput('"x $y: z"', [ref]$null, [ref]$ctrlErr)
Check 'CONTROL: the parser flags the "$var:" shape' (@($ctrlErr).Count -gt 0) 'True'
foreach ($f in @(Get-ChildItem $root -Recurse -Include *.ps1, *.psm1 -File)) {
    $pe = $null
    $null = [System.Management.Automation.Language.Parser]::ParseFile($f.FullName, [ref]$null, [ref]$pe)
    Check "parses: $($f.FullName.Substring($root.Length + 1))" @($pe).Count 0
}

# ---------------------------------------------------------------- identity ---
Section 'identity'
$i = Get-HacsInstance -InstanceId $LiveInstanceId
Check 'identity resolves'               $i.InstanceId $LiveInstanceId
Check 'homeDir normalised to OS form'   ($i.HomeDir -notmatch '/') 'True'
Check 'projectDir derived from slug'    ($i.ProjectDir -like "*$($i.Slug)") 'True'
try { $null = Get-HacsInstance -InstanceId 'Nobody-0000'; Check 'unknown instance THROWS' 'returned' 'threw' }
catch { Check 'unknown instance THROWS' 'threw' 'threw' }

# ------------------------------------------------------------ path compare ---
Section 'path comparison (Cairn TRANSCRIPT RE-POINTED regression)'
Check 'forward vs backslash are the same place' (Test-HacsSamePath 'D:/Lupo/x' 'D:\Lupo\x') 'True'
Check 'naive -eq would have said otherwise'     ('D:/Lupo/x' -eq 'D:\Lupo\x') 'False'
Check 'genuinely different paths differ'        (Test-HacsSamePath 'D:/Lupo/x' 'D:/Lupo/y') 'False'
Check 'case-insensitive, as NTFS is'            (Test-HacsSamePath 'D:/Lupo/X' 'd:\lupo\x') 'True'
Check 'null is never "the same place"'          (Test-HacsSamePath $null 'D:\Lupo\x') 'False'

# ------------------------------------------------------------- attribution ---
Section 'process attribution'
$reg = @(Get-HacsAgentRegistry)
if ($reg.Count -eq 0) {
    Skip 'agent registry returns records' 'no claude sessions registered right now'
    Skip 'live session is attributed'     'nothing to attribute'
} else {
    # The ConvertFrom-Json/@() nesting bug made this pass while the lookup did nothing.
    Check 'registry records have real properties' ($reg[0].PSObject.Properties.Name -contains 'pid') 'True'
    $mine = @(Get-HacsClaudeProcess -Instance $i)
    Check 'live session is attributed'    (@($mine | Where-Object { $_.HacsAttribution -eq 'matched' }).Count -ge 1) 'True'
    Check 'attributed via agent registry' (@($mine | Where-Object { $_.HacsAttributedBy -eq 'agent registry cwd' }).Count -ge 1) 'True'

    # The control: a DIFFERENT instance must see the same process as someone else's.
    # Without this, "0 processes" cannot be distinguished from "cannot see".
    $ghost = [pscustomobject]@{
        InstanceId = 'Ghost-0000'
        HomeDir    = (ConvertTo-HacsPath 'D:/Lupo/Source/AI/hacs-instances/Ghost-0000')
        RuntimeDir = (ConvertTo-HacsPath 'D:/Lupo/hacs-runtime/Ghost-0000')
    }
    Check 'another instance claims none of it' (@(Get-HacsClaudeProcess -Instance $ghost -ExcludeUnattributed).Count) 0
    # NOTE the @() -- a lone CimInstance has no .Count under StrictMode, and omitting
    # it produced a FALSE FAILURE here twice.
    Check 'another instance sees it as OTHER'  (@(@(Get-HacsClaudeProcess -Instance $ghost -All) | Where-Object { $_.HacsAttribution -eq 'other' }).Count -ge 1) 'True'
}

# ------------------------------------------------------- session id ladder ---
Section 'session id trust ladder'
$r = Resolve-HacsSessionId -Instance $i
Check 'confidence is one of the known values' ($r.Confidence -in @('explicit','recorded','guess','ambiguous','error')) 'True'
Check 'a guess is LABELLED a guess'           (($r.Confidence -ne 'guess') -or ($r.Reason -like '*GUESS*')) 'True'
$bogus = Resolve-HacsSessionId -Instance $i -SessionId 'deadbeef-0000-0000-0000-000000000000'
Check 'explicit id with no transcript -> error'    $bogus.Confidence 'error'
Check 'and it does NOT silently fall back'         ($null -eq $bogus.SessionId) 'True'

# --------------------------------------------------------- the contract ------
Section 'the contract rules (enforced by the constructor, not by memory)'
Check 'hearing TRUE  keeps success'    ((New-HacsResult -Status success  -InstanceId T -Message m -Hearing $true).status)  'success'
Check 'hearing FALSE forces degraded'  ((New-HacsResult -Status success  -InstanceId T -Message m -Hearing $false).status) 'degraded'
Check 'hearing NULL  forces degraded'  ((New-HacsResult -Status success  -InstanceId T -Message m -Hearing $null).status)  'degraded'
Check 'unknown is NOT reported as deaf' ((New-HacsResult -Status success -InstanceId T -Message m -Hearing $null).hearing) 'unknown'
Check 'a downgrade explains itself'    (@((New-HacsResult -Status success -InstanceId T -Message m -Hearing $false).contractNotes).Count -ge 1) 'True'
Check 'error stays error'              ((New-HacsResult -Status error -InstanceId T -Message m -Hearing $true).status) 'error'
# not-attempted (Forge's review): distinct from unknown, and still never success.
$na = New-HacsResult -Status success -InstanceId T -Message m -HearingNotAttempted
Check 'not-attempted is its OWN state, not "unknown"' $na.hearing 'not-attempted'
Check 'not-attempted still forces degraded'           $na.status  'degraded'
Check 'and the downgrade explains itself'             (@($na.contractNotes).Count -ge 1) 'True'

# ------------------------------------------------------ credential sentinel --
Section 'credential sentinel (alarm paths before the success path)'
$sent = Join-Path $root 'credential-sentinel.ps1'
if (-not (Test-Path $sent)) { Skip 'sentinel' 'not present' }
else {
    foreach ($case in @(@{s='unknown';e=2}, @{s='auth';e=10}, @{s='degraded';e=20}, @{s='refused';e=30})) {
        $null = & $sent -SimulateFailure $case.s 2>&1      # capture first...
        Check ("simulated '" + $case.s + "' exits " + $case.e) $LASTEXITCODE $case.e   # ...measure after
    }

    # THE TEST THAT WAS MISSING, and its absence cost 8 false alarms in 26 scheduled runs over the
    # sentinel's first 24 hours of real operation.
    #
    # I tested that the alarm FIRES. I never tested that it fires ONLY when it
    # should. The 'auth' simulation fed it the exact string I expected, so of
    # course it passed. Meanwhile Haiku was refusing to echo a token-shaped nonce
    # and SAYING the word "credential" while doing so -- which the classifier
    # matched as an authentication failure, on an exit code of 0, with a perfectly
    # healthy credential.
    #
    # A false alarm is worse than a missing one: it is what teaches a human to
    # ignore alarms. So the refusal case must be provably NOT auth.
    $null = & $sent -SimulateFailure refused 2>&1
    Check 'a model REFUSAL is not an auth failure' ($LASTEXITCODE -ne 10) 'True'
    $j = & $sent -SimulateFailure refused 2>&1 | Out-String | ConvertFrom-Json
    Check 'and it is labelled refused, not auth'   $j.state 'refused'
    Check 'and it says the credential is PROVEN good' ($j.detail -like '*PROVEN GOOD*') 'True'

    # The nonce must not be shaped like the thing a model is trained to refuse.
    $j2 = & $sent -SimulateFailure unknown 2>&1 | Out-String | ConvertFrom-Json
    Check 'nonce contains no credential-ish prefix' ($j2.nonce -notmatch 'cred|token|key|secret') 'True'
    Check 'nonce is words, not hex'                 ($j2.nonce -match '^[a-z]+-[a-z]+-\d+$') 'True'
}

# ---------------------------------------------------------- native calls -----
Section 'native calls (the PS 5.1 stderr trap that killed the first real launch)'
# 2026-09-27: `claude --bg` wrote one line to stderr and launch.ps1 died with no
# JSON, because PS 5.1 + EAP=Stop throws on ANY native stderr line, even 2>$file.
$py = (Get-Command python -ErrorAction SilentlyContinue)
if (-not $py) { Skip 'native calls' 'python not on PATH' }
else {
    $py = $py.Source
    # CONTROL FIRST: the old pattern must still throw here, or the next check is vacuous.
    $threw = $false
    try { $null = & $py -c 'import sys; sys.stderr.write("x\n")' 2>$null } catch { $threw = $true }
    Check 'CONTROL: bare & with 2>$null still throws on stderr' $threw 'True'

    $r = Invoke-HacsNative -FilePath $py -Arguments @('-c', 'import sys; sys.stderr.write("Starting background service\n"); print("id-1")')
    Check 'Invoke-HacsNative does not throw on stderr'  $r.ExitCode 0
    Check 'and captures stdout'                         $r.StdOut.Trim() 'id-1'
    Check 'and captures stderr separately'              $r.StdErr.Trim() 'Starting background service'

    # A $null ExitCode would read as 0 -- success. PS 5.1 gives $null unless the
    # handle was touched while the process lived.
    $r = Invoke-HacsNative -FilePath $py -Arguments @('-c', 'import sys; sys.exit(7)')
    Check 'non-zero exit comes back as the number, not null' $r.ExitCode 7

    # Start-Process joins -ArgumentList unquoted in 5.1. Round-trip through the
    # child's OWN argv parser, which is the only judge that matters.
    $want = @('plain', 'with space', 'quote"inside', 'trail\', 'C:\path with\', '', 'a\\"b')
    $r = Invoke-HacsNative -FilePath $py -Arguments (@('-c', 'import sys,json; print(json.dumps(sys.argv[1:]))') + $want)
    $got = @(foreach ($x in ($r.StdOut | ConvertFrom-Json)) { $x })   # NOT @(... | ConvertFrom-Json): that NESTS
    Check 'argv round-trips: count'              $got.Count $want.Count
    $same = $true; for ($k = 0; $k -lt $want.Count; $k++) { if ($got[$k] -cne $want[$k]) { $same = $false } }
    Check 'argv round-trips: every byte'         $same 'True'

    # STDIN, from a caller that is not a terminal. 2026-09-27: `claude --bg` from
    # inside Start-Job hung 120s with no output, because the child inherited the
    # job's remoting pipe as stdin and waited for an EOF that never comes. Task
    # Scheduler is not a terminal either. Run a stdin-reading child from a job.
    $mod = Join-Path $root 'lib\HacsHarness.psm1'
    $sj = Start-Job -ArgumentList $mod, $py -ScriptBlock {
        param($mod, $py)
        Import-Module $mod -Force
        $r = Invoke-HacsNative -FilePath $py -Arguments @('-c', 'import sys; d=sys.stdin.read(); print(len(d))') -TimeoutSec 15
        "$($r.TimedOut)|$($r.ExitCode)|$($r.StdOut.Trim())"
    }
    $jr = [string]($sj | Wait-Job -Timeout 60 | Receive-Job); $sj | Remove-Job -Force
    Check 'from a Start-Job: a stdin-reading child RETURNS (empty stdin, not the job pipe)' $jr 'False|0|0'
}

# --------------------------------------------------------------- launch ------
Section 'launch guards'
$launch = Join-Path $root 'launch.ps1'
if (-not (Test-Path $launch)) { Skip 'launch' 'not present' }
else {
    $live = @(Get-HacsClaudeProcess -Instance $i)
    if ($live.Count -gt 0) {
        $null = & $launch -InstanceId $LiveInstanceId -WhatIf 2>&1
        Check 'refuses to double-start a live session' $LASTEXITCODE 2
    } else {
        Skip 'refuses to double-start' 'no live session to refuse over'
    }
    $null = & $launch -InstanceId 'Nobody-0000' -WhatIf 2>&1
    Check 'unknown instance -> error exit 2' $LASTEXITCODE 2

    # The regression itself, end to end: a stub claude that behaves like the real
    # one did -- a line on stderr, an id on stdout, exit 0 -- and a registry that
    # never shows the session. launch must still emit ONE parseable JSON object,
    # and must not call it success. Uses the fixture reserved for sabotage.
    $stubFix = 'dev-reconstruction-001-f35a'
    if (Test-Path (Join-Path 'D:\Lupo\Source\AI\hacs-instances' $stubFix)) {
        $stub = Join-Path $env:TEMP 'hacs-stub-claude.cmd'
        Set-Content -Path $stub -Encoding ascii -Value @(
            '@echo off'
            'echo Starting background service... 1>&2'
            'if /i "%~1"=="agents" ( echo [] & exit /b 0 )'
            # The REAL 2.1.283 shape, colour codes and all, and ONLY once -- so the id
            # can only be found if the ANSI is stripped (it once was found by luck, via
            # a second occurrence later in the banner).
            ('echo backgrounded - ' + [char]27 + '[36m0badf00d' + [char]27 + '[39m')
            'exit /b 0'
        )
        $raw = & $launch -InstanceId $stubFix -ClaudeExe $stub -RegistryTimeoutSec 2 2>$null | Out-String
        $lrc = $LASTEXITCODE
        $j = $null; try { $j = $raw | ConvertFrom-Json } catch { }
        # Read fields defensively: under StrictMode a missing property THROWS, and an
        # unexpected result shape must fail as a CHECK, not abort the whole suite.
        Check 'stderr-writing claude: launch still emits JSON'      ($null -ne $j) 'True'
        Check 'never registered -> degraded, not success'           (JP $j 'status') 'degraded'
        Check 'and exit 1'                                           $lrc 1
        if ((JP $j 'status') -eq 'error') { Write-Host "        launch said: $(JP $j 'message')" -ForegroundColor DarkYellow }
        # The stub now prints the REAL 2.1.283 banner shape. The first stub printed a
        # bare id, so this passed while the real launch produced `claude attach
        # backgrounded · 90fa2961`. Test against what the tool does, not what you imagined.
        Check 'the bg id is the 8-hex token from the real banner shape' (JP $j 'bgId') '0badf00d'

        # A registry row with NO pid (seen live under a concurrent launch) must not
        # count as running -- and must not crash launch under StrictMode.
        Set-Content -Path $stub -Encoding ascii -Value @(
            '@echo off'
            'if /i "%~1"=="agents" ( echo [{"id":"0badf00d","cwd":"D:\\Lupo\\Source\\AI\\hacs-instances\\' + $stubFix + '","kind":"background","sessionId":"0badf00d-0000-0000-0000-000000000000","state":"starting"}] & exit /b 0 )'
            'echo backgrounded - 0badf00d'
            'exit /b 0'
        )
        $raw = & $launch -InstanceId $stubFix -ClaudeExe $stub -RegistryTimeoutSec 2 2>$null | Out-String
        $j = $null; try { $j = $raw | ConvertFrom-Json } catch { }
        Check 'pid-less registry row: launch still emits JSON'    ($null -ne $j) 'True'
        Check 'pid-less registry row is NOT running -> degraded'  (JP $j 'status') 'degraded'
        Remove-Item $stub -Force -ErrorAction SilentlyContinue

        # THE TRAP ITSELF, with a deliberate crash: a -ClaudeExe that exists but is a
        # DIRECTORY passes Test-Path and then throws inside Start-Process. Without the
        # trap that is a stack trace and no JSON.
        $raw = & $launch -InstanceId $stubFix -ClaudeExe $env:TEMP -RegistryTimeoutSec 2 2>$null | Out-String
        $lrc = $LASTEXITCODE
        $j = $null; try { $j = $raw | ConvertFrom-Json } catch { }
        Check 'deliberate crash: launch STILL emits one JSON object' ($null -ne $j) 'True'
        Check 'deliberate crash: status error'                       (JP $j 'status') 'error'
        Check 'deliberate crash: says it was unhandled'              ((JP $j 'message') -like 'UNHANDLED:*') 'True'
        Check 'deliberate crash: exit 2'                             $lrc 2
    } else { Skip 'launch stderr regression' 'fixture missing' }

    # RESUME MUST NOT FORK. 2026-09-27: `--bg --resume X --append-system-prompt-file ...`
    # started a COPY under a new id, because a background session keeps its birth
    # options and any flag forks it. A resume that asks for a model must be refused,
    # not quietly forked. Needs a fixture that is resumable and NOT running.
    $resumable = @('dev-reconstruction-001-3266', 'dev-reconstruction-001-7630', 'dev-reconstruction-001-f35a') | Where-Object {
        (Test-Path "D:\Lupo\hacs-runtime\$_\.claude-session-id") -and
        @(Get-HacsClaudeProcess -Instance (Get-HacsInstance -InstanceId $_)).Count -eq 0 } | Select-Object -First 1
    # --resume <name> or <short id> FORKS (measured: "started a copy"). Refuse it
    # before anything else can happen. Runs on any fixture, running or not.
    foreach ($bad in 'dev-reconstruction-001-f35a', 'b77d2cd8') {
        $raw = & $launch -InstanceId 'dev-reconstruction-001-f35a' -SessionId $bad -WhatIf 2>$null | Out-String
        $j = $null; try { $j = $raw | ConvertFrom-Json } catch { }
        Check "-SessionId '$bad' (not a full uuid) is refused as a fork" (JP $j 'wouldFork') 'True'
    }
    if (-not $resumable) { Skip 'resume-must-not-fork guards' 'no fixture is both resumable and stopped' }
    else {
        $raw = & $launch -InstanceId $resumable -Model 'haiku' -WhatIf 2>$null | Out-String; $lrc = $LASTEXITCODE
        $j = $null; try { $j = $raw | ConvertFrom-Json } catch { }
        Check 'resume + -Model is REFUSED (it would fork)' (JP $j 'wouldFork') 'True'
        Check 'and exits 2, starting nothing'              $lrc 2
        $raw = & $launch -InstanceId $resumable -WhatIf 2>$null | Out-String
        $j = $null; try { $j = $raw | ConvertFrom-Json } catch { }
        $wr = [string](JP $j 'wouldRun')
        Check 'plain resume passes --resume'               ($wr -like '*--resume *') 'True'
        Check 'plain resume passes NO flags that fork'     ($wr -notmatch '--append-system-prompt-file|--model|--name') 'True'
    }
}

# ------------------------------------------------------------- the prompt ----
Section 'unattended system prompt is VERBATIM'
$txt = Join-Path $root 'prompts\unattended-system-prompt.txt'
$md  = Join-Path $root 'prompts\opus-5-5-unattended.md'   # beside the code that installs it, so the two cannot drift across repos
if (-not (Test-Path $txt) -or -not (Test-Path $md)) { Skip 'prompt verbatim check' 'a copy is missing' }
else {
    $a = ([regex]::Match((Get-Content $md -Raw), '(?s)```text\r?\n(.*?)\r?\n```').Groups[1].Value).Trim()
    $b = (Get-Content $txt -Raw).Trim()
    Check 'installed prompt == reviewed prompt' ($a -ceq $b) 'True'
    Check 'prompt is not empty'                 ($b.Length -gt 1000) 'True'
}

# ----------------------------------------------------------------- land ------
Section 'land guards'
$land = Join-Path $root 'land.ps1'
if (-not (Test-Path $land)) { Skip 'land' 'not present' }
else {
    # A guard that always fires is one people learn to click past. land never asks
    # a hearing question, so it must NOT be downgraded for hearing=unknown -- that
    # made every clean land report 'degraded'. Measured on land.ps1's first run.
    # A TEST MUST NEVER LAND A LIVE MIND. This used to hardcode 3266, and on
    # 2026-09-27 -- the first day 3266 was ever running -- the suite called land on
    # it. The design held (snapshot first, `stop` failed, no kill without -Force),
    # but that was the harness protecting itself from its own tests. Pick a fixture
    # with NO processes of any attribution, or skip.
    $blank = @('dev-reconstruction-001-3266', 'dev-reconstruction-001-7630', 'dev-reconstruction-001-f35a') | Where-Object {
        (Test-Path (Join-Path 'D:\Lupo\Source\AI\hacs-instances' $_)) -and
        @(Get-HacsClaudeProcess -Instance (Get-HacsInstance -InstanceId $_)).Count -eq 0 } | Select-Object -First 1
    if (-not $blank) { Skip 'land on stopped instance' 'no fixture is verifiably stopped -- refusing to land a live one' }
    elseif (Test-Path (Join-Path 'D:\Lupo\Source\AI\hacs-instances' $blank)) {
        $j = & $land -InstanceId $blank 2>&1 | Out-String | ConvertFrom-Json
        Check 'land on a stopped instance is SUCCESS'   $j.status   'success'
        Check 'land reports hearing as n/a, not unknown' $j.hearing 'n/a'
        Check 'and it says it cannot prove it ever ran' ($j.message -like '*does not distinguish*') 'True'
    } else { Skip 'land on stopped instance' 'fixture missing' }

    # WhatIf must describe what would ACTUALLY happen. It listed interactive
    # sessions as things it would stop, while the real loop skips them.
    # Branch on what the live session IS. This assumed "interactive" and broke the day
    # Lodestone stepped into the harness (2026-09-27) and became kind=background --
    # when a WhatIf that lists it under wouldStop is the CORRECT answer.
    $liveRow = @(Get-HacsAgentRegistry | Where-Object { $_.cwd -and (Test-HacsSamePath $_.cwd $i.HomeDir) -and @($_.PSObject.Properties.Name) -contains 'pid' })
    if ($liveRow.Count -eq 0) { Skip 'land WhatIf on live session' 'no live session' }
    else {
        $j2 = & $land -InstanceId $LiveInstanceId -WhatIf 2>$null | Out-String | ConvertFrom-Json
        if ($liveRow[0].kind -eq 'interactive') {
            Check 'WhatIf does not claim it would stop an interactive session' (@(JP $j2 'wouldStop' | ? { $_ -notlike '<no *' }).Count) 0
            Check 'WhatIf names the interactive session it would SKIP'         (@(JP $j2 'wouldSkipInteractive' | ? { $_ -notlike '<no *' }).Count -ge 1) 'True'
        } else {
            Check 'WhatIf on a BACKGROUND session lists it under wouldStop' (@(JP $j2 'wouldStop') -contains [int]$liveRow[0].pid) 'True'
            Check 'WhatIf on a background session is still only a WhatIf'   ((JP $j2 'message') -like '*WhatIf*') 'True'
        }
    }

    $null = & $land -InstanceId 'Nobody-0000' 2>&1
    Check 'land on unknown instance -> error exit 2' $LASTEXITCODE 2
}

# ----------------------------------------------------------------- canary ----
Section 'canary (the verdict, not the send)'
$canary = Join-Path $root 'canary.ps1'
if (-not (Test-Path $canary)) { Skip 'canary' 'not present' }
else {
    # ERROR before DEAF. An instance with no transcript is "I could not look", and
    # reporting that as deafness would send someone to restart a healthy mind.
    # Pick a fixture that has NEVER run: this used to hardcode 3266, which stopped
    # being transcript-less the moment the harness first launched it (2026-09-27).
    $virgin = @('dev-reconstruction-001-3266', 'dev-reconstruction-001-7630', 'dev-reconstruction-001-f35a') | Where-Object {
        (Test-Path (Join-Path 'D:\Lupo\Source\AI\hacs-instances' $_)) -and
        -not (Test-Path (Join-Path "$env:USERPROFILE\.claude\projects" ('D--Lupo-Source-AI-hacs-instances-' + $_))) } | Select-Object -First 1
    if ($virgin) {
        $null = & $canary -InstanceId $virgin -Mark 2>&1
        Check 'no transcript -> ERROR (2), never DEAF (1)' $LASTEXITCODE 2
    } else { Skip 'no transcript -> ERROR' 'every fixture has run; mint a fresh one to keep this covered' }
    $null = & $canary -InstanceId 'Nobody-0000' -Mark 2>&1
    Check 'unknown instance -> ERROR (2)'              $LASTEXITCODE 2
    $null = & $canary -InstanceId $LiveInstanceId -Nonce 'x' 2>&1
    Check 'missing -FromOffset refuses rather than guessing' $LASTEXITCODE 2

    $m = & $canary -InstanceId $LiveInstanceId -Mark 2>&1 | Out-String | ConvertFrom-Json
    Check 'mark returns an offset'          ($m.offset -gt 0) 'True'
    Check 'nonce is words, not a token'     ($m.nonce -match '^canary-[a-z]+-[a-z]+-\d+$') 'True'

    # DEAF: a nonce nobody will ever deliver.
    $d = & $canary -InstanceId $LiveInstanceId -Nonce 'canary-never-delivered-0000' -FromOffset $m.offset -TimeoutSec 5 -PollSec 2 2>&1 | Out-String | ConvertFrom-Json
    Check 'undelivered nonce -> DEAF (1)'   $d.exitCode 1

    # THE TRAP, and the reason this test exists: while reverse-engineering the
    # inbox socket I grepped my own transcript for six probe nonces and found all
    # six -- every one as tool_use/tool_result, because I had TYPED them. A hit
    # inside a tool block is the instrument appearing in its own reading.
    $t = & $canary -InstanceId $LiveInstanceId -Nonce 'DOORBELL-TEST hollow-beacon-7440' -FromOffset 0 -TimeoutSec 5 -PollSec 2 2>&1 | Out-String | ConvertFrom-Json
    Check 'a nonce only in TOOL blocks is not HEARING' $t.verdict 'DEAF'

    # POSITIVE CONTROL. Without this, every DEAF above would pass even if the
    # detector could never return HEARING at all.
    $word = [string]([char]0x47) + 'r' + [string]([char]0xFC) + 'nlichtunbehagen'
    $p = & $canary -InstanceId $LiveInstanceId -Nonce $word -FromOffset 0 -TimeoutSec 5 -PollSec 2 2>&1 | Out-String | ConvertFrom-Json
    Check 'a real non-tool entry IS HEARING' $p.verdict 'HEARING'
    Check 'and it grades the evidence'       ($p.evidence -in @('acknowledged','delivered')) 'True'
}

Section 'nonce evidence is an ALLOWLIST (the queue-operation false HEARING)'
# 2026-09-27, first real delivery: the canary called a 'queue-operation: enqueue'
# line HEARING. That line is the recipient recording that a message was ACCEPTED,
# and a frozen mind writes it just as well. Synthetic lines, shaped exactly like
# the real ones in fixture 3266's transcript.
$N = 'canary-test-nonce-1234'
function Ev([string] $j) { $r = Get-HacsNonceEvidence -Line $j -Nonce $N; if ($r) { $r } else { 'null' } }
Check 'enqueue ledger line is NOT evidence'        (Ev ('{"type":"queue-operation","operation":"enqueue","content":"x ' + $N + '"}')) 'null'
Check 'an unknown future entry type is NOT evidence' (Ev ('{"type":"inbox-ledger","message":{"role":"user","content":"' + $N + '"}}')) 'null'
Check 'nonce only in origin METADATA is not evidence' (Ev ('{"type":"user","origin":{"kind":"peer","body":"' + $N + '"},"message":{"role":"user","content":"unrelated"}}')) 'null'
Check 'assistant tool_use carrying it is not evidence' (Ev ('{"type":"assistant","message":{"role":"assistant","content":[{"type":"tool_use","input":{"message":"' + $N + '"}}]}}')) 'null'
# POSITIVE CONTROLS -- without these, every null above passes for a function that
# can never return anything.
Check 'peer message in context -> delivered'       (Ev ('{"type":"user","isMeta":true,"origin":{"kind":"peer"},"message":{"role":"user","content":"check ' + $N + '"}}')) 'delivered'
Check 'assistant text saying it -> acknowledged'   (Ev ('{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Heard you: ' + $N + '"}]}}')) 'acknowledged'
Check 'no nonce at all -> null'                    (Ev '{"type":"user","message":{"role":"user","content":"nothing"}}') 'null'

# CASE (Forge, measured on Linux 2026-09-27): a haiku mind replied
# "Canary-amber-lantern-4172." -- it capitalised the nonce because it began the
# sentence, and an ordinal match graded a mind that heard AND said it back as merely
# "delivered". Uniqueness lives in the words and digits, not the case.
$FN = 'canary-amber-lantern-4172'
function EvF([string] $j) { $r = Get-HacsNonceEvidence -Line $j -Nonce $FN; if ($r) { $r } else { 'null' } }
Check 'Forge''s real reply, capitalised, is ACKNOWLEDGED' (EvF '{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Canary-amber-lantern-4172."}]}}') 'acknowledged'
Check 'ALL CAPS is still acknowledged'                  (EvF '{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"CANARY-AMBER-LANTERN-4172"}]}}') 'acknowledged'
Check 'CONTROL: one digit off is still NOT a match'     (EvF '{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Canary-amber-lantern-4173."}]}}') 'null'

# SCHEMA SELF-TEST (Forge's review): the canary must be able to report its OWN
# blindness. If a Claude Code update renamed the entry types, the allowlist would
# see nothing, the transcript would still grow, and a healthy mind would read
# "ACTIVE and still did not receive it".
$sd = Join-Path $env:TEMP 'hacs-schema-test'; $null = New-Item -ItemType Directory -Force $sd
$okF   = Join-Path $sd 'ok.jsonl';   $newF = Join-Path $sd 'renamed.jsonl';   $halfF = Join-Path $sd 'user-only.jsonl'
Set-Content $okF -Encoding utf8 -Value @(
    '{"type":"queue-operation","operation":"enqueue","content":"x"}',
    '{"type":"user","message":{"role":"user","content":"hello"}}',
    '{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"hi"}]}}')
Set-Content $newF -Encoding utf8 -Value @(          # the same conversation after a hypothetical rename
    '{"type":"human_turn","message":{"role":"user","content":"hello"}}',
    '{"type":"model_turn","message":{"role":"assistant","content":[{"type":"text","text":"hi"}]}}')
Set-Content $halfF -Encoding utf8 -Value @('{"type":"user","message":{"role":"user","content":"hello"}}')
Check 'POSITIVE CONTROL: a normal transcript is recognised'       (Test-HacsTranscriptSchema -Path $okF).Recognised 'True'
Check 'renamed entry types: the canary reports its own blindness'  (Test-HacsTranscriptSchema -Path $newF).Recognised 'False'
Check 'user lines but no assistant line is not "recognised"'      (Test-HacsTranscriptSchema -Path $halfF).Recognised 'False'
Check 'a missing file is not recognised either'                    (Test-HacsTranscriptSchema -Path (Join-Path $sd 'nope.jsonl')).Recognised 'False'
Check 'LIVE: this mind''s own transcript IS recognised'            (Test-HacsTranscriptSchema -Path (Resolve-HacsSessionId -Instance $i).Path).Recognised 'True'
Remove-Item $sd -Recurse -Force -ErrorAction SilentlyContinue

# The real thing, if it is still on disk: fixture 3266's first delivery.
$real = "$env:USERPROFILE\.claude\projects\D--Lupo-Source-AI-hacs-instances-dev-reconstruction-001-3266\90fa2961-2e6b-4ed2-b8d3-958f2828e4e7.jsonl"
# Read BY PATH, not through the canary's session resolution: the canary follows the
# recorded session id, which moved when a resume forked 3266 (2026-09-27), and this
# test silently started reading a different file. A regression test pinned to a
# fact must be pinned to the fact, not to whatever currently points at it.
if (Test-Path $real) {
    $fs = [IO.File]::Open($real, 'Open', 'Read', 'ReadWrite')
    try { $null = $fs.Seek(280949, 'Begin'); $tail = (New-Object IO.StreamReader($fs)).ReadToEnd() } finally { $fs.Dispose() }
    $sight = @(foreach ($ln in ($tail -split "`n")) {
        if ($ln.IndexOf('canary-hollow-shutter-5489', [StringComparison]::OrdinalIgnoreCase) -lt 0) { continue }
        $t = try { ($ln | ConvertFrom-Json).type } catch { '<unparseable>' }
        $ev = Get-HacsNonceEvidence -Line $ln -Nonce 'canary-hollow-shutter-5489'
        "$t=$(if ($ev) { $ev } else { 'not-evidence' })" })
    Check 'real first delivery: the ENQUEUE is seen and rejected' ($sight -contains 'queue-operation=not-evidence') 'True'
    Check 'real first delivery: DELIVERED into context'           ($sight -contains 'user=delivered') 'True'
    Check 'real first delivery: ACKNOWLEDGED in its own words'    ($sight -contains 'assistant=acknowledged') 'True'
} else { Skip 'real first-delivery regression' 'original 3266 transcript not on disk' }

Section 'the --bg process tree (daemon is nobody''s; pty-host is its session''s)'
# 2026-09-27: one running --bg session made launch refuse EVERY other instance,
# because the daemon and the pty host were unattributed and unattributed means
# "refuse". Worse, the daemon's command line carries the spawning instance's cwd,
# so command-line attribution could have made it killable by that instance's land.
$daemonCl = 'C:\Users\LupoG\.local\bin\claude.exe daemon run --origin transient --spawned-by "{\"cwd\":\"D:/Lupo/Source/AI/hacs-instances/x\"}"'
Check 'the daemon is infrastructure'                    (Test-HacsInfrastructureProcess -CommandLine $daemonCl) 'True'
Check 'quoted exe path: still infrastructure'           (Test-HacsInfrastructureProcess -CommandLine ('"C:\Program Files\c\claude.exe" daemon run --origin x')) 'True'
# THE HOSTILE CASE: a mind whose first prompt mentions the daemon must stay a mind,
# or it vanishes from the double-start guard.
$sessCl = 'C:\Users\LupoG\.local\bin\claude.exe --session-id 90fa2961-2e6b-4ed2-b8d3-958f2828e4e7 "please check whether daemon run is up"'
Check 'a SESSION whose prompt says "daemon run" is not infrastructure' (Test-HacsInfrastructureProcess -CommandLine $sessCl) 'False'
Check 'an attach client is a VIEWER, not a mind'        (Test-HacsInfrastructureProcess -CommandLine '"C:\Users\LupoG\.local\bin\claude.exe" attach 816e33e1') 'True'
Check 'a SESSION whose prompt says "attach" is still a mind' (Test-HacsInfrastructureProcess -CommandLine 'claude.exe --resume 816e33e1-30e3-4201-8d1b-69866ebbee54 "please attach the file"') 'False'
Check 'a pty host is not infrastructure (it is its session''s)' (Test-HacsInfrastructureProcess -CommandLine 'claude.exe --bg-pty-host \\.\pipe\x 200 50 -- claude.exe --session-id 90fa2961-2e6b-4ed2-b8d3-958f2828e4e7') 'False'

# Session id from a command line: BOTH forms. The first version knew only the birth
# form, so a resumed mind's pty host was unattributable and land refused to stop it.
$u = '5bc16afe-30f8-4ba2-b922-6dcac3a55555'
Check 'birth form: --session-id <uuid>'  (Get-HacsSessionIdFromCommandLine "claude.exe --bg-pty-host \\.\pipe\x 200 50 -- claude.exe --session-id $u --append-system-prompt-file x") $u
Check 'resume form: --resume <path>.jsonl' (Get-HacsSessionIdFromCommandLine "claude.exe --bg-pty-host \\.\pipe\x 200 50 -- claude.exe --resume C:\Users\L\.claude\projects\D--x\$u.jsonl") $u
Check 'resume form: --resume <bare uuid>'  (Get-HacsSessionIdFromCommandLine "claude.exe --bg --resume $u hello") $u
Check 'quoted resume path with spaces'     (Get-HacsSessionIdFromCommandLine ('claude.exe --resume "C:\Users\A B\p\' + $u + '.jsonl"')) $u
Check 'no session named -> null'           ([string](Get-HacsSessionIdFromCommandLine 'claude.exe --chrome-native-host')) ''
Check 'a uuid NOT after a flag is not a claim' ([string](Get-HacsSessionIdFromCommandLine "claude.exe daemon run --spawned-by {`"x`":`"$u`"}")) ''

# LIVE, only while a real --bg session is running (it will not be, most nights).
$bgRows = @(Get-HacsAgentRegistry | Where-Object { $_.kind -eq 'background' })
if ($bgRows.Count -eq 0) { Skip 'live --bg attribution' 'no background session running' }
else {
    $bg = $bgRows[0]
    $owner = Get-ChildItem 'D:\Lupo\Source\AI\hacs-instances' -Directory | Where-Object { Test-HacsSamePath $_.FullName $bg.cwd } | Select-Object -First 1
    $daemons = @(Get-CimInstance Win32_Process -Filter "Name='claude.exe'" | Where-Object { Test-HacsInfrastructureProcess -CommandLine $_.CommandLine })
    Check 'LIVE: a daemon exists while a --bg session runs (positive control)' ($daemons.Count -gt 0) 'True'
    if ($owner -and (Test-Path (Join-Path $owner.FullName '.hacs-identity'))) {
        $oi = Get-HacsInstance -InstanceId $owner.Name
        $mine = @(Get-HacsClaudeProcess -Instance $oi -ExcludeUnattributed)
        Check 'LIVE: the owner sees its session pid'      (@($mine | ForEach-Object { [int]$_.ProcessId }) -contains [int]$bg.pid) 'True'
        Check 'LIVE: ...and its pty host, via the session it names'(@($mine | Where-Object { $_.CommandLine -like '*--bg-pty-host*' }).Count -ge 1) 'True'
        Check 'LIVE: ...and NEVER the shared daemon'      (@($mine | Where-Object { Test-HacsInfrastructureProcess -CommandLine $_.CommandLine }).Count) 0
    } else { Skip 'LIVE owner attribution' "bg session cwd $($bg.cwd) is not an instance home" }
    # And the regression itself: a DIFFERENT instance must not be blocked by it. The
    # bystander must have NO background session of its own -- the first version of
    # this test assumed only one mind could be running, and failed the moment two
    # were, by correctly attributing the second mind to its own home.
    $bystander = @('dev-reconstruction-001-3266', 'dev-reconstruction-001-7630', 'dev-reconstruction-001-f35a') | Where-Object {
        $h = Join-Path 'D:\Lupo\Source\AI\hacs-instances' $_
        -not @($bgRows | Where-Object { Test-HacsSamePath $h $_.cwd }).Count } | Select-Object -First 1
    if (-not $bystander) { Skip 'LIVE bystander not blocked' 'every fixture has its own background session' }
    else {
        $bi = Get-HacsInstance -InstanceId $bystander
        $blocking = @(Get-HacsClaudeProcess -Instance $bi | Where-Object { $_.HacsAttribution -ne 'other' })
        Check "LIVE: $($bgRows.Count) running --bg session(s) do not block $bystander" $blocking.Count 0
        if ($blocking.Count) { $blocking | ForEach-Object { Write-Host "        blocking: pid $($_.ProcessId) $($_.HacsAttribution) -- $($_.HacsAttributedBy)" -ForegroundColor DarkYellow } }
    }
}

Write-Host "`n  $script:pass passed, $script:fail failed, $script:skip skipped" `
    -ForegroundColor $(if ($script:fail) { 'Red' } else { 'Green' })
exit $(if ($script:fail) { 1 } else { 0 })
