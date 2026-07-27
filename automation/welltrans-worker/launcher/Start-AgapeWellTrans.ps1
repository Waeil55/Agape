$ErrorActionPreference = 'Stop'
$Host.UI.RawUI.WindowTitle = 'Agape WellTrans Worker'

$createdNew = $false
$workerMutex = [Threading.Mutex]::new($true, 'Local\AgapeWellTransWorker', [ref]$createdNew)
if (-not $createdNew) {
  Write-Host 'The Agape WellTrans Worker is already running.' -ForegroundColor Yellow
  Read-Host 'Press Enter to close this duplicate window'
  exit 0
}

$workerDirectory = Split-Path -Parent $PSScriptRoot
$credentialPath = Join-Path $env:USERPROFILE 'AgapeSecrets\agape-worker-service-account.json'

if (-not (Test-Path -LiteralPath $credentialPath)) {
  throw "Agape Firebase credential was not found at $credentialPath"
}

$env:GOOGLE_APPLICATION_CREDENTIALS = $credentialPath
$env:GOOGLE_CLOUD_PROJECT = 'agape-95c9f'
$env:WELLTRANS_SESSION_KEY = [Environment]::GetEnvironmentVariable('WELLTRANS_SESSION_KEY', 'User')
$env:WELLTRANS_SESSION_FILE = [Environment]::GetEnvironmentVariable('WELLTRANS_SESSION_FILE', 'User')
$env:WELLTRANS_PORTAL_URL = [Environment]::GetEnvironmentVariable('WELLTRANS_PORTAL_URL', 'User')
$env:WELLTRANS_ALLOWED_HOSTS = [Environment]::GetEnvironmentVariable('WELLTRANS_ALLOWED_HOSTS', 'User')
$env:WELLTRANS_ENABLE_WRITES = 'true'

if (-not $env:WELLTRANS_SESSION_KEY -or -not $env:WELLTRANS_SESSION_FILE -or -not $env:WELLTRANS_PORTAL_URL) {
  throw 'WellTrans worker configuration is incomplete. Contact an Agape administrator.'
}

Set-Location -LiteralPath $workerDirectory
try {
  npm run calibrate-run

  if ($LASTEXITCODE -ne 0) {
    Write-Host ''
    Write-Host 'The WellTrans worker stopped with an error. Keep this window open for support.' -ForegroundColor Red
    Read-Host 'Press Enter to close'
  }
} finally {
  $workerMutex.ReleaseMutex()
  $workerMutex.Dispose()
}
