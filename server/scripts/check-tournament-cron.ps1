$ErrorActionPreference = 'Stop'

$hostName = $env:NAKAMA_HOST
$port = $env:NAKAMA_PORT
$key = $env:NAKAMA_HTTP_KEY

if (-not $hostName) { $hostName = 'localhost' }
if (-not $port) { $port = '7350' }
if (-not $key) {
  Write-Error 'NAKAMA_HTTP_KEY is required'
}

$base = "http://$hostName`:$port/v2/rpc"
$rpcList = @(
  '_cron_tournament_status_sync',
  '_cron_tournament_noshow_check',
  '_cron_tournament_reminders',
  '_cron_notification_cleanup'
)

foreach ($rpc in $rpcList) {
  $url = "$base/$rpc`?http_key=$key"
  try {
    $response = Invoke-RestMethod -Method Post -Uri $url -Body '""' -ContentType 'application/json' -TimeoutSec 15
    $success = $response.success
    if ($null -eq $success -and $response.payload) {
      try {
        $payloadObj = $response.payload | ConvertFrom-Json
        $success = $payloadObj.success
      } catch {
        $success = $null
      }
    }
    if ($success -ne $true) {
      throw "RPC $rpc did not return success=true"
    }
    Write-Host "OK: $rpc"
  } catch {
    Write-Error "FAILED: $rpc - $($_.Exception.Message)"
  }
}
