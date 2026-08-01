param(
  [string]$ProtocolUrl = ''
)

$ErrorActionPreference = 'Stop'
$ConfirmPreference = 'None'
$ProgressPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Security
try { $Host.UI.RawUI.WindowTitle = 'Agape WellTrans Agent' } catch {}

$workerDirectory = Split-Path -Parent $PSScriptRoot
$secretDirectory = Join-Path $env:USERPROFILE 'AgapeSecrets'
$protectedCredentialPath = Join-Path $secretDirectory 'agape-worker-service-account.protected'
$federatedCredentialPath = Join-Path $secretDirectory 'agape-worker-wif.json'
$runtimeDirectory = Join-Path $env:LOCALAPPDATA 'AgapeCare\Runtime'
$runtimeCredentialPath = Join-Path $runtimeDirectory "welltrans-credential-$PID.json"
$requestedDatePath = Join-Path $runtimeDirectory 'requested-service-date.txt'
$requestedScopePath = Join-Path $runtimeDirectory 'requested-sync-scope.json'
$wellTransCredentialPath = Join-Path $secretDirectory 'welltrans-login.vault'
$logPath = Join-Path $secretDirectory 'welltrans-worker.log'
$lockPath = Join-Path $secretDirectory 'welltrans-worker.pid'
$agentDataRoot = Join-Path $env:LOCALAPPDATA 'AgapeCare'
$rollbackRoot = Join-Path $agentDataRoot 'WellTransAgentRollback'
$pendingUpdatePath = Join-Path $agentDataRoot 'welltrans-update-pending.json'
$workerProcess = $null
$versionPath = Join-Path $workerDirectory 'VERSION'
$releaseManifestUrl = 'https://agape5.web.app/welltrans-agent/version.json'
$installedVersion = if (Test-Path -LiteralPath $versionPath) {
  (Get-Content -LiteralPath $versionPath -Raw).Trim()
} else {
  '0.0.0'
}
$upgradeRequired = $false
try {
  $releaseManifest = Invoke-RestMethod -Uri "${releaseManifestUrl}?cache=$([DateTime]::UtcNow.Ticks)" -TimeoutSec 5
  $upgradeRequired = $releaseManifest.version -and
    ([Version]$releaseManifest.version -gt [Version]$installedVersion)
} catch {
  $upgradeRequired = $false
}

# Download and integrity-check the new release without interrupting an open
# human review. The new files become active only when a safe session starts.
if ($upgradeRequired) {
  $updater = Join-Path $PSScriptRoot 'Update-AgapeWellTransAgent.ps1'
  if (Test-Path -LiteralPath $updater) {
    & $updater
  }
}

$requestedDateMatch = [Regex]::Match(
  [Uri]::UnescapeDataString($ProtocolUrl),
  '(?:[?&])date=(\d{4}-\d{2}-\d{2})(?:&|$)'
)
if ($requestedDateMatch.Success) {
  New-Item -ItemType Directory -Path $runtimeDirectory -Force | Out-Null
  Set-Content -LiteralPath $requestedDatePath -Value $requestedDateMatch.Groups[1].Value -NoNewline
}
$decodedProtocolUrl = [Uri]::UnescapeDataString($ProtocolUrl)
$requestedScopeMatch = [Regex]::Match($decodedProtocolUrl, '(?:[?&])scope=(all|driver)(?:&|$)')
$requestedDriverMatch = [Regex]::Match($decodedProtocolUrl, '(?:[?&])driverId=([^&]{1,200})(?:&|$)')
if ($requestedDateMatch.Success -and $requestedScopeMatch.Success) {
  $scopeType = $requestedScopeMatch.Groups[1].Value
  $scopeDriverId = if ($scopeType -eq 'driver' -and $requestedDriverMatch.Success) {
    $requestedDriverMatch.Groups[1].Value.Trim()
  } else { '' }
  if ($scopeType -eq 'driver' -and -not $scopeDriverId) {
    throw 'The driver-only WellTrans request did not contain a driver ID.'
  }
  @{
    serviceDate = $requestedDateMatch.Groups[1].Value
    type = $scopeType
    driverId = $scopeDriverId
    requestedAtUtc = [DateTime]::UtcNow.ToString('o')
  } | ConvertTo-Json | Set-Content -LiteralPath $requestedScopePath -Encoding UTF8
}

# The encrypted credential vault is hosted separately from the browser worker.
# It therefore remains reachable when an older review window must stay open to
# protect unsaved human-reviewed rows. This process has no Firebase credential
# and cannot stage trips or click Apply.
try {
  New-Item -ItemType Directory -Path $runtimeDirectory -Force | Out-Null
  New-Item -ItemType Directory -Path $secretDirectory -Force | Out-Null
  $settingsHostEntry = Join-Path $workerDirectory 'src\welltrans.settings-host.js'
  $settingsHostPidPath = Join-Path $runtimeDirectory 'welltrans-settings-host.pid'
  $settingsNodeExecutable = Join-Path $workerDirectory 'runtime\node\node.exe'
  if (-not (Test-Path -LiteralPath $settingsNodeExecutable)) {
    $settingsNodeExecutable = (Get-Command node.exe -ErrorAction Stop).Source
  }
  $env:WELLTRANS_SESSION_KEY = [Environment]::GetEnvironmentVariable('WELLTRANS_SESSION_KEY', 'User')
  $env:WELLTRANS_CREDENTIAL_FILE = $wellTransCredentialPath
  $env:AGAPE_LOCAL_SETTINGS_PORT = '43127'
  $env:AGAPE_LOCAL_SETTINGS_ORIGINS = 'https://agape5.web.app'
  if (-not $env:WELLTRANS_SESSION_KEY) {
    throw 'The local encryption key is not configured.'
  }
  if (-not (Test-Path -LiteralPath $settingsHostEntry)) {
    throw 'The secure local settings component is missing.'
  }

  $settingsHostProcess = $null
  if (Test-Path -LiteralPath $settingsHostPidPath) {
    $settingsHostPid = 0
    [void][int]::TryParse((Get-Content -LiteralPath $settingsHostPidPath -Raw).Trim(), [ref]$settingsHostPid)
    if ($settingsHostPid -gt 0) {
      $settingsHostProcess = Get-Process -Id $settingsHostPid -ErrorAction SilentlyContinue
      $settingsHostCommand = Get-CimInstance Win32_Process -Filter "ProcessId=$settingsHostPid" -ErrorAction SilentlyContinue
      if (-not $settingsHostCommand -or $settingsHostCommand.CommandLine -notmatch 'welltrans\.settings-host\.js') {
        $settingsHostProcess = $null
      }
    }
  }
  $settingsHostIsStale = $settingsHostProcess -and (Test-Path -LiteralPath $versionPath) -and
    ((Get-Item -LiteralPath $versionPath).LastWriteTimeUtc -gt $settingsHostProcess.StartTime.ToUniversalTime())
  if ($settingsHostIsStale) {
    Stop-Process -Id $settingsHostProcess.Id -Force -ErrorAction SilentlyContinue
    $settingsHostProcess = $null
  }
  if (-not $settingsHostProcess) {
    $settingsHostProcess = Start-Process -FilePath $settingsNodeExecutable `
      -ArgumentList "`"$settingsHostEntry`"" -WindowStyle Hidden -PassThru
    Set-Content -LiteralPath $settingsHostPidPath -Value $settingsHostProcess.Id -NoNewline
  }
} catch {
  Add-Content -LiteralPath $logPath -Value "[$([DateTime]::Now.ToString('o'))] Secure local settings service unavailable: $($_.Exception.Message)"
}

if (Test-Path -LiteralPath $lockPath) {
  $ownerPid = 0
  [void][int]::TryParse((Get-Content -LiteralPath $lockPath -Raw).Trim(), [ref]$ownerPid)
  $ownerProcess = if ($ownerPid -gt 0) { Get-Process -Id $ownerPid -ErrorAction SilentlyContinue } else { $null }
  if ($ownerProcess) {
    $installedFilesChangedWhileRunning = (Test-Path -LiteralPath $versionPath) -and
      ((Get-Item -LiteralPath $versionPath).LastWriteTimeUtc -gt $ownerProcess.StartTime.ToUniversalTime())
    $replacementRequired = $upgradeRequired -or $installedFilesChangedWhileRunning
    $processes = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue
    $descendantIds = New-Object 'System.Collections.Generic.HashSet[int]'
    [void]$descendantIds.Add([int]$ownerPid)
    $foundDescendant = $true
    while ($foundDescendant) {
      $foundDescendant = $false
      foreach ($process in $processes) {
        if ($descendantIds.Contains([int]$process.ParentProcessId) -and
            -not $descendantIds.Contains([int]$process.ProcessId)) {
          [void]$descendantIds.Add([int]$process.ProcessId)
          $foundDescendant = $true
        }
      }
    }

    $browserProcesses = @($descendantIds |
      ForEach-Object { Get-Process -Id $_ -ErrorAction SilentlyContinue } |
      Where-Object {
        $_.ProcessName -match '^(chrome|chromium)$'
      })
    $visibleBrowser = $browserProcesses |
      Where-Object { $_.MainWindowHandle -ne 0 } |
      Select-Object -First 1

    if ($visibleBrowser) {
      Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class AgapeWindowFocus {
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
}
'@
      [AgapeWindowFocus]::ShowWindow($visibleBrowser.MainWindowHandle, 9) | Out-Null
      [AgapeWindowFocus]::SetForegroundWindow($visibleBrowser.MainWindowHandle) | Out-Null
      exit 0
    }

    $workerNode = $descendantIds |
      ForEach-Object { Get-CimInstance Win32_Process -Filter "ProcessId=$_" -ErrorAction SilentlyContinue } |
      Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -match 'src\\index\.js' } |
      Select-Object -First 1
    $ownerAgeSeconds = ((Get-Date) - $ownerProcess.StartTime).TotalSeconds
    # A newly launched worker may need a few seconds before Chromium owns a
    # top-level window. Once that grace period expires, a worker whose entire
    # Chromium tree has no window is stale: the operator has already lost the
    # review surface, so keeping the orphaned Node supervisor prevents every
    # later Fill request from reopening WellTrans. Replace only this validated
    # Agape process tree. A visible review window is always focused above and
    # is never terminated, preserving all unapplied edits.
    if ($workerNode -and -not $replacementRequired) {
      if ($ownerAgeSeconds -lt 30) { exit 0 }
      Add-Content -LiteralPath $logPath -Value (
        "[$([DateTime]::Now.ToString('o'))] Replacing stale Agent session: " +
        "$($browserProcesses.Count) Chromium process(es), no operator window."
      )
      $replacementRequired = $true
    }

    if (-not $replacementRequired -and $ownerAgeSeconds -lt 60) { exit 0 }

    # Replace only this validated Agape process tree when no review browser is
    # visible. An update never discards unsaved human-review edits and never
    # clicks Apply or Close.
    $descendantIds |
      Where-Object { $_ -ne $ownerPid } |
      Sort-Object -Descending |
      ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
    Stop-Process -Id $ownerPid -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 500
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

  New-Item -ItemType Directory -Path $runtimeDirectory -Force | Out-Null
  if (Test-Path -LiteralPath $federatedCredentialPath) {
    $federatedConfig = Get-Content -LiteralPath $federatedCredentialPath -Raw | ConvertFrom-Json
    if ($federatedConfig.type -ne 'external_account') {
      throw 'The enrolled Workload Identity configuration is not an external_account credential.'
    }
    if ($federatedConfig.credential_source.executable) {
      throw 'Executable-sourced Workload Identity configurations are not permitted by the Agape Agent.'
    }
    if ($federatedConfig.audience -notmatch 'workloadIdentityPools') {
      throw 'The enrolled Workload Identity audience is invalid.'
    }
    $env:GOOGLE_APPLICATION_CREDENTIALS = $federatedCredentialPath
    $env:AGAPE_WORKER_CREDENTIAL_MODE = 'workload_identity_federation'
  } elseif (Test-Path -LiteralPath $protectedCredentialPath) {
    $protectedBytes = [IO.File]::ReadAllBytes($protectedCredentialPath)
    $credentialBytes = [System.Security.Cryptography.ProtectedData]::Unprotect(
      $protectedBytes,
      $null,
      [System.Security.Cryptography.DataProtectionScope]::CurrentUser
    )
    [IO.File]::WriteAllBytes($runtimeCredentialPath, $credentialBytes)
    $env:GOOGLE_APPLICATION_CREDENTIALS = $runtimeCredentialPath
    $env:AGAPE_WORKER_CREDENTIAL_MODE = 'legacy_dpapi_service_account'
  } else {
    throw 'This computer is not enrolled. Install a Workload Identity external-account configuration or contact an Agape administrator.'
  }
  $env:GOOGLE_CLOUD_PROJECT = 'agape-95c9f'
  $env:WELLTRANS_SESSION_KEY = [Environment]::GetEnvironmentVariable('WELLTRANS_SESSION_KEY', 'User')
  $env:WELLTRANS_SESSION_FILE = [Environment]::GetEnvironmentVariable('WELLTRANS_SESSION_FILE', 'User')
  $env:WELLTRANS_PORTAL_URL = [Environment]::GetEnvironmentVariable('WELLTRANS_PORTAL_URL', 'User')
  $env:WELLTRANS_ALLOWED_HOSTS = [Environment]::GetEnvironmentVariable('WELLTRANS_ALLOWED_HOSTS', 'User')
  $env:WELLTRANS_CREDENTIAL_FILE = $wellTransCredentialPath
  $env:AGAPE_LOCAL_SETTINGS_PORT = '43127'
  $env:AGAPE_LOCAL_SETTINGS_ORIGINS = 'https://agape5.web.app'
  $env:WELLTRANS_ENABLE_WRITES = 'true'
  $env:WELLTRANS_REQUEST_FILE = $requestedDatePath
  $env:WELLTRANS_SCOPE_FILE = $requestedScopePath
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
  do {
    $workerStartedAt = Get-Date
    $workerProcess = Start-Process -FilePath $nodeExecutable -ArgumentList "`"$workerEntry`"" -NoNewWindow -PassThru
    # Materialize the native process handle immediately. Windows PowerShell
    # 5.1 can lose the exit-code handle when a short-lived worker exits before
    # it is first observed, producing a null ExitCode and preventing the
    # supervisor from honoring the safe-session restart signal (42).
    [void]$workerProcess.Handle
    # A pending release is healthy once its worker remains alive for a full
    # minute. Clear the rollback marker while it is running; otherwise a later
    # intentional clean-session restart can be misclassified as startup
    # failure and silently restore the previous (unsafe) launcher.
    while (-not $workerProcess.HasExited) {
      if (((Get-Date) - $workerStartedAt).TotalSeconds -ge 60 -and
          (Test-Path -LiteralPath $pendingUpdatePath)) {
        try {
          $healthyUpdate = Get-Content -LiteralPath $pendingUpdatePath -Raw | ConvertFrom-Json
          if ($healthyUpdate.backupPath -and (Test-Path -LiteralPath $healthyUpdate.backupPath)) {
            $resolvedHealthyBackup = (Resolve-Path -LiteralPath $healthyUpdate.backupPath).Path
            $resolvedRollbackRoot = (Resolve-Path -LiteralPath $rollbackRoot).Path
            if ($resolvedHealthyBackup.StartsWith($resolvedRollbackRoot, [StringComparison]::OrdinalIgnoreCase)) {
              Remove-Item -LiteralPath $resolvedHealthyBackup -Recurse -Force
            }
          }
        } catch {
          Add-Content -LiteralPath $logPath -Value "[$([DateTime]::Now.ToString('o'))] Healthy release cleanup deferred: $($_.Exception.Message)"
        }
        Remove-Item -LiteralPath $pendingUpdatePath -Force
      }
      Start-Sleep -Milliseconds 500
      $workerProcess.Refresh()
    }
    $workerProcess.WaitForExit()
    $workerProcess.Refresh()
    $workerExitCode = $workerProcess.ExitCode
    if ($workerExitCode -eq 42) {
      Add-Content -LiteralPath $logPath -Value "[$([DateTime]::Now.ToString('o'))] Clean review session restart requested."
      $updater = Join-Path $PSScriptRoot 'Update-AgapeWellTransAgent.ps1'
      if (Test-Path -LiteralPath $updater) {
        & $updater
      }
      $workerProcess = $null
    }
  } while ($workerExitCode -eq 42)
  if ($workerProcess.ExitCode -ne 0) {
    $workerError = "Agent exited with code $($workerProcess.ExitCode)."
    $workerRuntimeSeconds = ((Get-Date) - $workerStartedAt).TotalSeconds
    if ($workerRuntimeSeconds -lt 180 -and (Test-Path -LiteralPath $pendingUpdatePath)) {
      try {
        $pendingUpdate = Get-Content -LiteralPath $pendingUpdatePath -Raw | ConvertFrom-Json
        if (-not $pendingUpdate.backupPath -or -not (Test-Path -LiteralPath $pendingUpdate.backupPath)) {
          throw 'The last-known-good Agent backup is unavailable.'
        }
        $resolvedBackup = (Resolve-Path -LiteralPath $pendingUpdate.backupPath).Path
        $resolvedRollbackRoot = (Resolve-Path -LiteralPath $rollbackRoot).Path
        if (-not $resolvedBackup.StartsWith($resolvedRollbackRoot, [StringComparison]::OrdinalIgnoreCase)) {
          throw 'The Agent rollback backup was outside the authorized directory.'
        }
        foreach ($directory in @('src', 'launcher')) {
          $targetDirectory = Join-Path $workerDirectory $directory
          $backupDirectory = Join-Path $resolvedBackup $directory
          if (Test-Path -LiteralPath $targetDirectory) {
            $resolvedTarget = (Resolve-Path -LiteralPath $targetDirectory).Path
            $resolvedWorkerRoot = (Resolve-Path -LiteralPath $workerDirectory).Path
            if (-not $resolvedTarget.StartsWith($resolvedWorkerRoot, [StringComparison]::OrdinalIgnoreCase)) {
              throw 'The Agent rollback target was outside the installation directory.'
            }
            Remove-Item -LiteralPath $resolvedTarget -Recurse -Force
          }
          Copy-Item -LiteralPath $backupDirectory -Destination $targetDirectory -Recurse -Force
        }
        foreach ($file in @('package.json', 'package-lock.json', 'README.md', 'VERSION')) {
          $backupFile = Join-Path $resolvedBackup $file
          if (Test-Path -LiteralPath $backupFile) {
            Copy-Item -LiteralPath $backupFile -Destination (Join-Path $workerDirectory $file) -Force
          }
        }
        $npmExecutable = Join-Path $workerDirectory 'runtime\node\npm.cmd'
        Push-Location $workerDirectory
        try {
          & $npmExecutable ci --omit=dev --no-audit --no-fund
          if ($LASTEXITCODE -ne 0) {
            throw "Dependency rollback failed with code $LASTEXITCODE."
          }
        } finally {
          Pop-Location
        }
        Remove-Item -LiteralPath $pendingUpdatePath -Force
        Remove-Item -LiteralPath $resolvedBackup -Recurse -Force
        $workerError = "Agent $($pendingUpdate.newVersion) failed its startup health window and was rolled back to $($pendingUpdate.previousVersion). Start it again."
      } catch {
        $workerError = "$workerError Automatic rollback failed: $($_.Exception.Message)"
      }
    }
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
