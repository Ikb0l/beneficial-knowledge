param(
  [string]$Domain = '',
  [switch]$PrepareOnly
)

$ErrorActionPreference = 'Stop'

$root = $PSScriptRoot
if (-not $root) {
  $root = Split-Path -Parent $MyInvocation.MyCommand.Path
}

$projectRoot = Split-Path -Parent $root
Set-Location $projectRoot

$deployScript = Join-Path $root 'deploy-production.ps1'
$deployArgs = @('-ExecutionPolicy', 'Bypass', '-File', $deployScript)
if (-not [string]::IsNullOrWhiteSpace($Domain)) {
  $deployArgs += @('-Domain', $Domain.Trim())
}
if ($PrepareOnly) {
  $deployArgs += '-PrepareOnly'
}

powershell @deployArgs
if ($LASTEXITCODE -ne 0) {
  throw 'Production deployment failed.'
}

if ($PrepareOnly) {
  Write-Host 'PrepareOnly mode enabled. Telegram tunnel was not started.'
  exit 0
}

Write-Host 'Starting Telegram tunnel for production client (http://localhost:80)...'
$command = "cd '$projectRoot'; " +
  "`$env:TELEGRAM_TUNNEL_ORIGIN='http://localhost:80'; " +
  "npm run tunnel:telegram"
Start-Process powershell -ArgumentList @('-NoProfile', '-Command', $command)

Write-Host 'Telegram tunnel launched in a new PowerShell process.'
