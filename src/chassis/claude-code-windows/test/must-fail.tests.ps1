<#
.SYNOPSIS
  A suite that MUST fail. nightly.ps1 runs it and FAILS the night if it passes:
  a runner that cannot see a failure reports every night green.
  Do not "fix" this file.
#>
Write-Host "  FAIL  deliberate: this suite exists to prove the runner sees a failure"
Write-Host ""
Write-Host "  0 passed, 1 failed"
exit 1
