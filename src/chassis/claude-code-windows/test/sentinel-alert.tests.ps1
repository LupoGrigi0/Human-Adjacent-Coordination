<#
  sentinel-alert.tests.ps1 -- who hears about it when the credential sentinel fires.

  Every rule has a case that must fire AND a control that must not. Nothing here
  touches the real hub: sends go to test\fake_hacs.py with FAKE_RECORD set, which
  appends each send's argv to a file so the test can count exactly what went out.

  Written 2026-10-26, after the sentinel logged "a human must run /login" 11 times
  over three days and told no one.

  Author: Lodestone <lodestone@smoothcurves.nexus> / Collaborator: Lupo
#>
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$sent = Join-Path $root 'credential-sentinel.ps1'
$fake = Join-Path $PSScriptRoot 'fake_hacs.py'
$work = Join-Path $env:TEMP "sentinel-alert-test-$PID"
$null = New-Item -ItemType Directory -Force -Path $work
$script:pass = 0; $script:fail = 0

function Check([string] $name, $got, $want) {
    if ("$got" -eq "$want") { $script:pass++; Write-Host "PASS  $name" }
    else { $script:fail++; Write-Host "FAIL  $name  (got '$got', want '$want')" -ForegroundColor Red }
}

# One isolated run. -File, like the scheduled task, so argument binding is the real one.
function Run([string[]] $SentinelArgs, [hashtable] $Env = @{}) {
    $saved = @{}
    foreach ($k in $Env.Keys) { $saved[$k] = [Environment]::GetEnvironmentVariable($k); [Environment]::SetEnvironmentVariable($k, $Env[$k]) }
    try {
        $out = & powershell -NoProfile -ExecutionPolicy Bypass -File $sent -LogPath (Join-Path $work 'sentinel.log') @SentinelArgs 2>&1 | Out-String
        $code = $LASTEXITCODE       # capture, THEN measure
    } finally { foreach ($k in $saved.Keys) { [Environment]::SetEnvironmentVariable($k, $saved[$k]) } }
    return [pscustomobject]@{ Code = $code; Out = $out }
}
function Sends { $r = Join-Path $work 'sends.jsonl'; if (Test-Path $r) { @(Get-Content $r | ForEach-Object { , ($_ | ConvertFrom-Json) }) } else { @() } }
function Reset { Get-ChildItem $work -File | Remove-Item -Force }

$rec   = @{ FAKE_RECORD = (Join-Path $work 'sends.jsonl') }
$withFake = @('-HacsPy', $fake)

try {
    # --- the guard: tests must never page anyone --------------------------------
    Reset
    $r = Run @('-SimulateFailure', 'auth') $rec
    Check 'CONTROL simulated auth WITHOUT -HacsPy: exit still 10'           $r.Code 10
    Check 'CONTROL  ...sends nothing (the real hub is never a test target)'  @(Sends).Count 0
    Check 'CONTROL  ...and writes no alert state'                            (Test-Path (Join-Path $work 'sentinel.alert-state.json')) 'False'

    # --- auth alerts at once, to both recipients --------------------------------
    Reset
    $r = Run (@('-SimulateFailure', 'auth') + $withFake) $rec
    $s = @(Sends)
    Check 'auth alerts immediately: exit unchanged'                         $r.Code 10
    Check '  ...one send per recipient'                                     $s.Count 2
    Check '  ...to Axiom and Bastion-3012 (default)'                         (($s | ForEach-Object { $_[1] }) -join ',') 'Axiom,Bastion-3012'
    Check '  ...subject names the state'                                     ($s[0][2] -like '*auth*') 'True'
    # Bastion's routing contract, CASE-SENSITIVE (-cmatch): a matcher that is "dumb and robust"
    # on their side means every deviation here is a silently unrouted alert.
    $contract = '^credential-sentinel: \S+ (AUTH|DEGRADED|COULD-NOT-LOOK|RECOVERED)( \(still\))?$'
    Check "  ...subject meets Bastion's routing contract exactly"           ($s[0][2] -cmatch $contract) 'True'
    Check '  ...body tells a human what to do'                               ($s[0][3] -like '*must*/login*') 'True'

    $r = Run (@('-SimulateFailure', 'auth') + $withFake) $rec
    Check 'CONTROL a second auth run does not re-send (no alarm fatigue)'   @(Sends).Count 2

    $r = Run (@('-SimulateFailure', 'auth', '-RepeatHours', '0') + $withFake) $rec
    $s = @(Sends)
    Check 'while it persists past -RepeatHours, it re-alerts'               $s.Count 4
    Check '  ...marked (still)'                                              ($s[2][2] -like '*(still)*') 'True'
    Check '  ...and a (still) subject still meets the contract'             ($s[2][2] -cmatch $contract) 'True'

    # --- recovery: a real round-trip through a fake claude ----------------------
    $fakeClaude = Join-Path $work 'claude.cmd'
    Set-Content -Path $fakeClaude -Value '@echo %*' -Encoding ascii     # echoes the prompt, so the nonce genuinely round-trips
    $r = Run (@('-Claude', $fakeClaude, '-ScratchDir', (Join-Path $work 'scratch')) + $withFake) $rec
    $s = @(Sends)
    Check 'a real OK after an alert exits 0'                                 $r.Code 0
    Check '  ...and sends RECOVERED to both'                                 $s.Count 6
    Check '  ...subject says RECOVERED'                                      ($s[4][2] -like '*RECOVERED*') 'True'
    Check '  ...RECOVERED meets the contract'                                ($s[4][2] -cmatch $contract) 'True'
    $r = Run (@('-Claude', $fakeClaude, '-ScratchDir', (Join-Path $work 'scratch')) + $withFake) $rec
    Check 'CONTROL a second OK sends nothing'                               @(Sends).Count 6

    # --- degraded and unknown need a streak -------------------------------------
    Reset
    foreach ($n in 1..2) { $null = Run (@('-SimulateFailure', 'degraded') + $withFake) $rec }
    Check 'CONTROL degraded x2 does not alert (one blip is not an outage)'  @(Sends).Count 0
    $null = Run (@('-SimulateFailure', 'degraded') + $withFake) $rec
    Check 'degraded x3 alerts'                                               @(Sends).Count 2

    Reset
    foreach ($n in 1..2) { $null = Run (@('-SimulateFailure', 'unknown') + $withFake) $rec }
    Check 'CONTROL unknown x2 does not alert'                               @(Sends).Count 0
    $null = Run (@('-SimulateFailure', 'unknown') + $withFake) $rec
    $s = @(Sends)
    Check 'unknown x3 alerts'                                                $s.Count 2
    Check "  ...and says 'could not look', not 'bad credential'"             ($s[0][3] -like '*could not look*') 'True'
    Check '  ...token COULD-NOT-LOOK, never the internal word unknown'      ($s[0][2] -cmatch $contract -and $s[0][2] -cmatch 'COULD-NOT-LOOK') 'True'
    Reset
    foreach ($n in 1..3) { $null = Run (@('-SimulateFailure', 'degraded') + $withFake) $rec }
    Check '  ...DEGRADED meets the contract'                                ((@(Sends))[0][2] -cmatch $contract) 'True'

    Reset
    foreach ($n in 1..3) { $null = Run (@('-SimulateFailure', 'refused') + $withFake) $rec }
    Check 'CONTROL refused x3 NEVER alerts (a refusal proves the credential)' @(Sends).Count 0

    # --- a failed send never changes the verdict --------------------------------
    Reset
    $r = Run (@('-SimulateFailure', 'auth') + $withFake) ($rec + @{ FAKE_SEND_EXIT = '1' })
    Check 'a failing send leaves the exit code alone'                        $r.Code 10
    Check '  ...and the log says FAILED, not sent'                           ((Get-Content (Join-Path $work 'sentinel.log') -Raw) -like '*FAILED*') 'True'

    # --- switches and binding ----------------------------------------------------
    Reset
    $null = Run (@('-SimulateFailure', 'auth', '-NoAlert') + $withFake) $rec
    Check 'CONTROL -NoAlert sends nothing'                                  @(Sends).Count 0

    Reset
    $null = Run (@('-SimulateFailure', 'auth', '-AlertTo', 'A,B') + $withFake) $rec
    Check "-AlertTo 'A,B' under -File reaches TWO recipients, not one called 'A,B'" ((@(Sends) | ForEach-Object { $_[1] }) -join '|') 'A|B'
} finally {
    Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "sentinel-alert: $script:pass passed, $script:fail failed"
exit $(if ($script:fail) { 1 } else { 0 })
