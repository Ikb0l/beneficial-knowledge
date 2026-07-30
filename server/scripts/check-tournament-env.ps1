$ErrorActionPreference = 'Stop'

$required = @(
  'NAKAMA_HTTP_KEY'
)

$recommended = @(
  'ADMIN_TELEGRAM_IDS',
  'ADMIN_LOGIN_TOKEN',
  'TELEGRAM_BOT_TOKEN',
  'NAKAMA_HOST',
  'NAKAMA_PORT'
)

$clientRecommended = @(
  'VITE_NAKAMA_HOST',
  'VITE_NAKAMA_KEY',
  'VITE_NAKAMA_SSL'
)

$missingRequired = @()
foreach ($name in $required) {
  $value = Get-Item -Path "Env:$name" -ErrorAction SilentlyContinue
  if ($null -eq $value -or [string]::IsNullOrWhiteSpace($value.Value)) {
    $missingRequired += $name
  }
}

if ($missingRequired.Count -gt 0) {
  Write-Error ('Missing required env vars: ' + ($missingRequired -join ', '))
} else {
  Write-Host 'Required env vars: OK'
}

$missingRecommended = @()
foreach ($name in $recommended) {
  $value = Get-Item -Path "Env:$name" -ErrorAction SilentlyContinue
  if ($null -eq $value -or [string]::IsNullOrWhiteSpace($value.Value)) {
    $missingRecommended += $name
  }
}

if ($missingRecommended.Count -gt 0) {
  Write-Host ('Missing recommended env vars (server/cron): ' + ($missingRecommended -join ', '))
} else {
  Write-Host 'Recommended env vars (server/cron): OK'
}

$missingClient = @()
foreach ($name in $clientRecommended) {
  $value = Get-Item -Path "Env:$name" -ErrorAction SilentlyContinue
  if ($null -eq $value -or [string]::IsNullOrWhiteSpace($value.Value)) {
    $missingClient += $name
  }
}

if ($missingClient.Count -gt 0) {
  Write-Host ('Missing recommended env vars (client build): ' + ($missingClient -join ', '))
} else {
  Write-Host 'Recommended env vars (client build): OK'
}

if ($missingRequired.Count -gt 0) {
  exit 1
}
