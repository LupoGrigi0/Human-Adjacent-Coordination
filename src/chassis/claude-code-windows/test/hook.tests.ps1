<#
.SYNOPSIS
  Tests for the SessionStart doorbell-capture hook.

.DESCRIPTION
  Separate file because the assertions are full of Windows paths and pipe names,
  and every attempt to patch them into the main suite through a shell heredoc was
  mangled by backslash collapse -- five times in one evening. The lesson is in
  Memory.md: anything containing backslashes goes through a file writer or a real
  serializer, never a heredoc.

  ORDER: every failure path is exercised BEFORE the success path. A monitor whose
  alarm has never fired is decoration, and this hook's failure modes are silent by
  construction (async hooks discard output and exit codes).

.NOTES
  Author: Lodestone <lodestone@smoothcurves.nexus>
  Collaborator: Lupo
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$hook = Join-Path $root 'hooks\persist-session-env.ps1'

$script:pass = 0
$script:fail = 0
function Check {
    param([string] $Name, $Got, $Want)
    if ("$Got" -eq "$Want") { $script:pass++; Write-Host "  PASS  $Name" -ForegroundColor Green }
    else { $script:fail++; Write-Host "  FAIL  $Name -- got '$Got' wanted '$Want'" -ForegroundColor Red }
}

Write-Host "`n=== SessionStart hook (doorbell capture) ===" -ForegroundColor Cyan

if (-not (Test-Path $hook)) { Write-Host '  hook not present'; exit 0 }

$rt = Join-Path $env:TEMP ('hooktest-' + [Guid]::NewGuid().ToString('N').Substring(0, 8))
$null = New-Item -ItemType Directory -Force -Path $rt

# Built by a real serializer. A hand-built JSON string containing backslashes has
# been the bug in this suite twice, and in the hook's own first test once.
$payloadFile = Join-Path $rt 'payload.json'
$payload = @{
    session_id      = 'abc-123'
    transcript_path = (Join-Path 'D:\fake' 'y.jsonl')
    cwd             = 'D:\fake'
    source          = 'startup'
} | ConvertTo-Json -Compress
Set-Content -Path $payloadFile -Value $payload -Encoding ascii

$badFile = Join-Path $rt 'bad.json'
Set-Content -Path $badFile -Value '{not json at all' -Encoding ascii

$TEST_SOCKET = '\\.\pipe\LOCAL\cc-msg-TESTONLY'
$TEST_TOKEN  = 'deadbeefdeadbeefdeadbeefdeadbeef'

function Invoke-Hook {
    # Runs the hook as a real child PROCESS with real stdin, which is how Claude
    # Code invokes it. Piping into `& script.ps1` binds PIPELINE input instead and
    # the script sees nothing -- that mistake made the hook look half-broken.
    param([string] $PayloadPath, [string] $Socket, [string] $Token)
    $psi = New-Object Diagnostics.ProcessStartInfo
    $psi.FileName  = 'powershell.exe'
    $psi.Arguments = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + $hook + '" -RuntimeDir "' + $rt + '"'
    $psi.RedirectStandardInput  = $true
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError  = $true
    $psi.UseShellExecute = $false
    if ($Socket) { $psi.EnvironmentVariables['CLAUDE_CODE_MESSAGING_SOCKET'] = $Socket }
    else { $null = $psi.EnvironmentVariables.Remove('CLAUDE_CODE_MESSAGING_SOCKET') }
    if ($Token)  { $psi.EnvironmentVariables['CLAUDE_CODE_MESSAGING_TOKEN'] = $Token }
    else { $null = $psi.EnvironmentVariables.Remove('CLAUDE_CODE_MESSAGING_TOKEN') }

    $p = [Diagnostics.Process]::Start($psi)
    $p.StandardInput.Write((Get-Content $PayloadPath -Raw))
    $p.StandardInput.Close()
    $out = $p.StandardOutput.ReadToEnd()
    $err = $p.StandardError.ReadToEnd()
    $p.WaitForExit()
    [pscustomobject]@{ StdOut = $out; StdErr = $err; Exit = $p.ExitCode }
}

$sessionJson = Join-Path $rt 'session.json'
$hookLog     = Join-Path $rt 'session-hook.log'

# --- FAILURE PATH 1: no doorbell in the environment ---------------------------
Remove-Item $sessionJson -ErrorAction SilentlyContinue
$null = Invoke-Hook $payloadFile $null $null
Check 'no doorbell -> writes NO session.json' (Test-Path $sessionJson) 'False'
$log = Get-Content $hookLog -Raw
Check 'and names WHICH variable is missing'   ($log -like '*socket=MISSING*') 'True'
Check 'and does not claim the doorbell is broken' ($log -like '*NOT proof*') 'True'

# --- FAILURE PATH 2: malformed payload ----------------------------------------
# Must NOT be reported as an absent payload. The first version caught both into
# $payload = $null, so bad JSON looked exactly like no stdin while the success
# line still printed.
$null = Invoke-Hook $badFile $TEST_SOCKET $TEST_TOKEN
$log2 = Get-Content $hookLog -Raw
Check 'malformed payload reported as MALFORMED' ($log2 -like '*NOT valid JSON*') 'True'
Check 'and it still captured the doorbell'      (Test-Path $sessionJson) 'True'

# --- SUCCESS PATH -------------------------------------------------------------
Remove-Item $sessionJson -ErrorAction SilentlyContinue
$r = Invoke-Hook $payloadFile $TEST_SOCKET $TEST_TOKEN
Check 'doorbell present -> writes session.json' (Test-Path $sessionJson) 'True'
# stdout from a SessionStart hook is INJECTED INTO THE SESSION as context. A token
# printed here would put a live credential into a transcript.
Check 'hook prints NOTHING on success'          ([string]::IsNullOrWhiteSpace($r.StdOut)) 'True'
Check 'hook exits 0'                            $r.Exit 0

$sj = Get-Content $sessionJson -Raw | ConvertFrom-Json
Check 'captured session id from stdin'          $sj.sessionId 'abc-123'
Check 'captured transcript path'                ($sj.transcriptPath -like '*y.jsonl') 'True'
Check 'captured the socket'                     $sj.socket $TEST_SOCKET
Check 'token IS in the file'                    $sj.token.Length 32

$log3 = Get-Content $hookLog -Raw
Check 'token is NOT in the log'                 ($log3 -notlike '*deadbeef*') 'True'
Check 'log records the token LENGTH instead'    ($log3 -like '*tokenLen=32*') 'True'

Check 'session.json ACL inheritance is off'     ((Get-Acl $sessionJson).AreAccessRulesProtected) 'True'

Remove-Item $rt -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "`n  $script:pass passed, $script:fail failed" -ForegroundColor $(if ($script:fail) { 'Red' } else { 'Green' })
exit $(if ($script:fail) { 1 } else { 0 })
