param(
  [string]$ProtocolUrl = ''
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
try { $Host.UI.RawUI.WindowTitle = 'Agape WellTrans Agent' } catch {}

$workerDirectory = Split-Path -Parent $PSScriptRoot
$secretDirectory = Join-Path $env:USERPROFILE 'AgapeSecrets'
$protectedCredentialPath = Join-Path $secretDirectory 'agape-worker-service-account.protected'
$runtimeDirectory = Join-Path $env:LOCALAPPDATA 'AgapeCare\Runtime'
$runtimeCredentialPath = Join-Path $runtimeDirectory "welltrans-credential-$PID.json"
$requestedDatePath = Join-Path $runtimeDirectory 'requested-service-date.txt'
$logPath = Join-Path $secretDirectory 'welltrans-worker.log'
$lockPath = Join-Path $secretDirectory 'welltrans-worker.pid'
$workerProcess = $null

$requestedDateMatch = [Regex]::Match(
  [Uri]::UnescapeDataString($ProtocolUrl),
  '(?:[?&])date=(\d{4}-\d{2}-\d{2})(?:&|$)'
)
if ($requestedDateMatch.Success) {
  New-Item -ItemType Directory -Path $runtimeDirectory -Force | Out-Null
  Set-Content -LiteralPath $requestedDatePath -Value $requestedDateMatch.Groups[1].Value -NoNewline
}

if (Test-Path -LiteralPath $lockPath) {
  $ownerPid = 0
  [void][int]::TryParse((Get-Content -LiteralPath $lockPath -Raw).Trim(), [ref]$ownerPid)
  $ownerProcess = if ($ownerPid -gt 0) { Get-Process -Id $ownerPid -ErrorAction SilentlyContinue } else { $null }
  if ($ownerProcess) {
    exit 0
  }
  Remove-Item -LiteralPath $lockPath -Force
}
$workerEntryPattern = [Regex]::Escape((Join-Path $workerDirectory 'src\index.js'))
Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -match $workerEntryPattern } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

Set-Content -LiteralPath $lockPath -Value $PID -NoNewline

Get-ChildItem -LiteralPath $runtimeDirectory -Filter 'welltrans-credential-*.json' -File -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -ne $runtimeCredentialPath } |
  ForEach-Object {
    & icacls.exe $_.FullName /reset /c | Out-Null
    Remove-Item -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue
  }

try {
  $updater = Join-Path $PSScriptRoot 'Update-AgapeWellTransAgent.ps1'
  if (Test-Path -LiteralPath $updater) {
    & $updater
  }
} catch {
  New-Item -ItemType Directory -Path $secretDirectory -Force | Out-Null
  Add-Content -LiteralPath $logPath -Value "[$([DateTime]::Now.ToString('o'))] Automatic update skipped: $($_.Exception.Message)"
}

$workerError = $null
try {
  Start-Transcript -Path $logPath -Append | Out-Null

  if (-not (Test-Path -LiteralPath $protectedCredentialPath)) {
    throw "This computer is not enrolled with an encrypted Agape agent credential."
  }
  New-Item -ItemType Directory -Path $runtimeDirectory -Force | Out-Null
  $protectedBytes = [IO.File]::ReadAllBytes($protectedCredentialPath)
  $credentialBytes = [System.Security.Cryptography.ProtectedData]::Unprotect(
    $protectedBytes,
    $null,
    [System.Security.Cryptography.DataProtectionScope]::CurrentUser
  )
  [IO.File]::WriteAllBytes($runtimeCredentialPath, $credentialBytes)

  $env:GOOGLE_APPLICATION_CREDENTIALS = $runtimeCredentialPath
  $env:GOOGLE_CLOUD_PROJECT = 'agape-95c9f'
  $env:WELLTRANS_SESSION_KEY = [Environment]::GetEnvironmentVariable('WELLTRANS_SESSION_KEY', 'User')
  $env:WELLTRANS_SESSION_FILE = [Environment]::GetEnvironmentVariable('WELLTRANS_SESSION_FILE', 'User')
  $env:WELLTRANS_PORTAL_URL = [Environment]::GetEnvironmentVariable('WELLTRANS_PORTAL_URL', 'User')
  $env:WELLTRANS_ALLOWED_HOSTS = [Environment]::GetEnvironmentVariable('WELLTRANS_ALLOWED_HOSTS', 'User')
  $env:WELLTRANS_ENABLE_WRITES = 'true'
  $env:WELLTRANS_REQUEST_FILE = $requestedDatePath
  $env:WELLTRANS_POLL_MS = '1500'

  if (-not $env:WELLTRANS_SESSION_KEY -or -not $env:WELLTRANS_SESSION_FILE -or -not $env:WELLTRANS_PORTAL_URL) {
    throw 'WellTrans worker configuration is incomplete. Contact an Agape administrator.'
  }

  Set-Location -LiteralPath $workerDirectory
  $nodeExecutable = Join-Path $workerDirectory 'runtime\node\node.exe'
  if (-not (Test-Path -LiteralPath $nodeExecutable)) {
    $nodeExecutable = (Get-Command node.exe -ErrorAction Stop).Source
  }
  $workerEntry = Join-Path $workerDirectory 'src\index.js'
  $workerProcess = Start-Process -FilePath $nodeExecutable -ArgumentList "`"$workerEntry`"" -NoNewWindow -PassThru
  $workerProcess.WaitForExit()
  if ($workerProcess.ExitCode -ne 0) {
    $workerError = "Agent exited with code $($workerProcess.ExitCode)."
  }
} catch {
  $workerError = $_.Exception.Message
} finally {
  if ($workerProcess -and -not $workerProcess.HasExited) {
    Stop-Process -Id $workerProcess.Id -Force -ErrorAction SilentlyContinue
  }
  Stop-Transcript -ErrorAction SilentlyContinue | Out-Null
  if (Test-Path -LiteralPath $runtimeCredentialPath) {
    Remove-Item -LiteralPath $runtimeCredentialPath -Force
  }
  if (Test-Path -LiteralPath $lockPath) {
    $lockOwnerPid = 0
    [void][int]::TryParse((Get-Content -LiteralPath $lockPath -Raw).Trim(), [ref]$lockOwnerPid)
    if ($lockOwnerPid -eq $PID) {
      Remove-Item -LiteralPath $lockPath -Force
    }
  }
}

if ($workerError) {
  Add-Content -LiteralPath $logPath -Value "[$([DateTime]::Now.ToString('o'))] Agent stopped: $workerError"
}
