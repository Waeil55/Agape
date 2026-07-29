$ErrorActionPreference = 'Stop'
$Host.UI.RawUI.WindowTitle = 'Agape WellTrans Worker'

$workerDirectory = Split-Path -Parent $PSScriptRoot
$secretDirectory = Join-Path $env:USERPROFILE 'AgapeSecrets'
$credentialPath = Join-Path $secretDirectory 'agape-worker-service-account.json'
$logPath = Join-Path $secretDirectory 'welltrans-worker.log'
$lockPath = Join-Path $secretDirectory 'welltrans-worker.pid'

if (Test-Path -LiteralPath $lockPath) {
  $ownerPid = 0
  [void][int]::TryParse((Get-Content -LiteralPath $lockPath -Raw).Trim(), [ref]$ownerPid)
  $ownerProcess = if ($ownerPid -gt 0) { Get-Process -Id $ownerPid -ErrorAction SilentlyContinue } else { $null }
  if ($ownerProcess) {
    Write-Host "The Agape WellTrans Worker is already running in process $ownerPid." -ForegroundColor Yellow
    Read-Host 'Press Enter to close this duplicate window'
    exit 0
  }
  Remove-Item -LiteralPath $lockPath -Force
}

Set-Content -LiteralPath $lockPath -Value $PID -NoNewline
$workerError = $null
try {
  Start-Transcript -Path $logPath -Append | Out-Null

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
  npm run calibrate-run
  if ($LASTEXITCODE -ne 0) { $workerError = "Worker exited with code $LASTEXITCODE." }
} catch {
  $workerError = $_.Exception.Message
} finally {
  Stop-Transcript -ErrorAction SilentlyContinue | Out-Null
  if (Test-Path -LiteralPath $lockPath) {
    $lockOwnerPid = 0
    [void][int]::TryParse((Get-Content -LiteralPath $lockPath -Raw).Trim(), [ref]$lockOwnerPid)
    if ($lockOwnerPid -eq $PID) {
      Remove-Item -LiteralPath $lockPath -Force
    }
  }
}

if ($workerError) {
  Write-Host ''
  Write-Host "The WellTrans worker stopped: $workerError" -ForegroundColor Red
  Write-Host "Details were saved to $logPath" -ForegroundColor Yellow
  Read-Host 'Press Enter to close'
}
