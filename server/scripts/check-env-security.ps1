$ErrorActionPreference = 'Stop'

function Get-EnvValue([string]$name) {
  $item = Get-Item -Path "Env:$name" -ErrorAction SilentlyContinue
  if ($null -eq $item) { return '' }
  return [string]$item.Value
}

$required = @(
  'POSTGRES_DB',
  'POSTGRES_USER',
  'POSTGRES_PASSWORD',
  'REDIS_PASSWORD',
  'NAKAMA_SERVER_KEY',
  'NAKAMA_HTTP_KEY',
  'NAKAMA_CONSOLE_USERNAME',
  'NAKAMA_CONSOLE_PASSWORD',
  'NAKAMA_CONSOLE_SIGNING_KEY',
  'NAKAMA_SESSION_ENCRYPTION_KEY',
  'NAKAMA_SESSION_REFRESH_ENCRYPTION_KEY',
  'TELEGRAM_BOT_TOKEN',
  'ADMIN_TELEGRAM_IDS',
  'WEB_AUTH_PEPPER',
  'AI_SECRETS_ENCRYPTION_KEY'
)

$minLen = @{
  'POSTGRES_PASSWORD' = 16
  'REDIS_PASSWORD' = 16
  'NAKAMA_SERVER_KEY' = 32
  'NAKAMA_HTTP_KEY' = 32
  'NAKAMA_CONSOLE_PASSWORD' = 16
  'NAKAMA_CONSOLE_SIGNING_KEY' = 32
  'NAKAMA_SESSION_ENCRYPTION_KEY' = 32
  'NAKAMA_SESSION_REFRESH_ENCRYPTION_KEY' = 32
  'WEB_AUTH_PEPPER' = 32
  'AI_SECRETS_ENCRYPTION_KEY' = 32
}

$weakPatterns = @(
  'changeme',
  'change_me',
  'your_',
  'example',
  'local',
  'dev_',
  'password',
  'admin123',
  '123456',
  'qwerty',
  'test'
)

$missing = @()
$weak = @()
$short = @()

foreach ($name in $required) {
  $value = (Get-EnvValue $name).Trim()
  if ([string]::IsNullOrWhiteSpace($value)) {
    $missing += $name
    continue
  }

  if ($minLen.ContainsKey($name)) {
    $requiredLen = [int]$minLen[$name]
    if ($value.Length -lt $requiredLen) {
      $short += "$name (<$requiredLen chars)"
    }
  }

  $valueLower = $value.ToLowerInvariant()
  foreach ($pattern in $weakPatterns) {
    if ($valueLower.Contains($pattern)) {
      $weak += "$name (contains '$pattern')"
      break
    }
  }
}

if ((Get-EnvValue 'ALLOW_INSECURE_TELEGRAM_AUTH').Trim().ToLowerInvariant() -eq 'true') {
  $weak += 'ALLOW_INSECURE_TELEGRAM_AUTH must be false'
}

if ($missing.Count -eq 0 -and $short.Count -eq 0 -and $weak.Count -eq 0) {
  Write-Host 'Environment security check: OK'
  exit 0
}

if ($missing.Count -gt 0) {
  Write-Host ('Missing required env vars: ' + ($missing -join ', '))
}
if ($short.Count -gt 0) {
  Write-Host ('Values too short: ' + ($short -join ', '))
}
if ($weak.Count -gt 0) {
  Write-Host ('Weak or insecure values: ' + ($weak -join ', '))
}

exit 1
