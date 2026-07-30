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

$envOutputFile = '.env.production.ready'

$prepareArgs = @('scripts/prepare-production-env.mjs', '--output', $envOutputFile)
if (-not [string]::IsNullOrWhiteSpace($Domain)) {
  $prepareArgs += @('--domain', $Domain.Trim())
}

Write-Host 'Preparing production environment file...'
node @prepareArgs
if ($LASTEXITCODE -ne 0) {
  throw 'Failed to prepare production environment file.'
}

Write-Host 'Loading generated env vars into current shell for security check...'
Get-Content $envOutputFile | ForEach-Object {
  if ($_ -match '^\s*#' -or [string]::IsNullOrWhiteSpace($_)) {
    return
  }
  if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$') {
    $name = $Matches[1]
    $value = $Matches[2]
    Set-Item -Path ("Env:" + $name) -Value $value
  }
}

Write-Host 'Running production env security check...'
powershell -ExecutionPolicy Bypass -File server/scripts/check-env-security.ps1
if ($LASTEXITCODE -ne 0) {
  throw 'Production env security check failed.'
}

if ($PrepareOnly) {
  Write-Host 'PrepareOnly mode enabled. Skipping build and docker deployment.'
  Write-Host "Env file generated: $envOutputFile"
  exit 0
}

Write-Host 'Building Nakama runtime bundle...'
npm run server:build
if ($LASTEXITCODE -ne 0) {
  throw 'Failed to build server runtime bundle.'
}

function Get-PreparedEnvValue([string]$filePath, [string]$name) {
  if (-not (Test-Path $filePath)) { return '' }
  $line = Get-Content $filePath | Where-Object { $_ -match "^\s*$name=" } | Select-Object -First 1
  if (-not $line) { return '' }
  return ($line -replace "^\s*$name=", '').Trim()
}

$tunnelEnabled = (Get-PreparedEnvValue -filePath $envOutputFile -name 'CLOUDFLARE_TUNNEL_ENABLED').ToLowerInvariant() -eq 'true'
$tunnelToken = Get-PreparedEnvValue -filePath $envOutputFile -name 'CLOUDFLARE_TUNNEL_TOKEN'
if ($tunnelEnabled -and [string]::IsNullOrWhiteSpace($tunnelToken)) {
  throw 'CLOUDFLARE_TUNNEL_ENABLED=true but CLOUDFLARE_TUNNEL_TOKEN is empty.'
}

Write-Host 'Starting production docker stack...'
$composeArgs = @('--env-file', $envOutputFile, '-f', 'docker/docker-compose.prod.yml')
if ($tunnelEnabled) {
  Write-Host 'Cloudflare named tunnel profile enabled.'
  $composeArgs += @('--profile', 'tunnel')
}
$composeArgs += @('up', '-d', '--build')

docker compose @composeArgs
if ($LASTEXITCODE -ne 0) {
  throw 'Failed to deploy docker production stack.'
}

Write-Host 'Production deployment finished successfully.'
Write-Host "Env file used: $envOutputFile"
