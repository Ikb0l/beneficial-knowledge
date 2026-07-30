param(
  [string]$DbHost = "localhost",
  [int]$DbPort = 5432,
  [string]$DbName = "nakama",
  [string]$DbUser = "postgres",
  [string]$DbPassword = "",
  [string]$MigrationsDir = (Join-Path $PSScriptRoot "..\migrations")
)

if (-not $DbPassword) {
  $DbPassword = $env:POSTGRES_PASSWORD
}
if (-not $DbPassword) {
  $DbPassword = "localdb"
}

$psql = Get-Command psql -ErrorAction SilentlyContinue
if (-not $psql) {
  throw "psql command not found. Install PostgreSQL client tools or run migrations via Docker."
}

$resolvedDir = Resolve-Path $MigrationsDir -ErrorAction Stop
$migrationFiles = Get-ChildItem -Path $resolvedDir -Filter *.sql | Sort-Object Name
if (-not $migrationFiles -or $migrationFiles.Count -eq 0) {
  throw "No migration files found in $resolvedDir"
}

$env:PGPASSWORD = $DbPassword
try {
  foreach ($file in $migrationFiles) {
    Write-Host "Applying app migration $($file.Name)..."
    & $psql.Path -h $DbHost -p $DbPort -U $DbUser -d $DbName -v ON_ERROR_STOP=1 -f $file.FullName
    if ($LASTEXITCODE -ne 0) {
      throw "Migration failed: $($file.Name)"
    }
  }
} finally {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}

Write-Host "All app migrations applied successfully."
