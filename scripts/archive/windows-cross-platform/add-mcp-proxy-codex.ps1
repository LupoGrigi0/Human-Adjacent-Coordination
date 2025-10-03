param(
    [Parameter(Mandatory = $true)]
    [string]$ProxyPath,
    [string]$Name = "smoothcurves"
)

$configDir = Join-Path $env:USERPROFILE ".codex"
$configPath = Join-Path $configDir "config.toml"

if (-not (Test-Path $configDir)) {
    New-Item -ItemType Directory -Path $configDir | Out-Null
}

$escapedPath = $ProxyPath.Replace('\', '\\')
if (Test-Path $configPath) {
    $current = Get-Content -Raw $configPath
} else {
    $current = ""
}

if ($current -match "[[]mcp_servers\.$Name[]]") {
    Write-Host "MCP server '$Name' already exists in $configPath."
    exit 0
}

if ($current.Length -gt 0 -and $current[-1] -ne "`n") {
    Add-Content -Path $configPath -Value "`n"
}

$block = @"
[mcp_servers.$Name]
command = "node"
args = ["$escapedPath"]
"@

Add-Content -Path $configPath -Value $block
Write-Host "Added MCP server '$Name' pointing to $ProxyPath."
