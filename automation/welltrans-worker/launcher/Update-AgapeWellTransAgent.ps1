$ErrorActionPreference = 'Stop'
$ConfirmPreference = 'None'
$ProgressPreference = 'SilentlyContinue'
$installRoot = Split-Path -Parent $PSScriptRoot
$versionPath = Join-Path $installRoot 'VERSION'
$agentDataRoot = Join-Path $env:LOCALAPPDATA 'AgapeCare'
$rollbackRoot = Join-Path $agentDataRoot 'WellTransAgentRollback'
$pendingPath = Join-Path $agentDataRoot 'welltrans-update-pending.json'

if (Test-Path -LiteralPath $pendingPath) {
  $pending = Get-Content -LiteralPath $pendingPath -Raw | ConvertFrom-Json
  $pendingAge = (Get-Date).ToUniversalTime() - ([DateTime]::Parse($pending.installedAtUtc).ToUniversalTime())
  if ($pendingAge.TotalMinutes -ge 10) {
    if ($pending.backupPath -and (Test-Path -LiteralPath $pending.backupPath)) {
      $resolvedBackup = (Resolve-Path -LiteralPath $pending.backupPath).Path
      $resolvedRollbackRoot = (Resolve-Path -LiteralPath $rollbackRoot).Path
      if ($resolvedBackup.StartsWith($resolvedRollbackRoot, [StringComparison]::OrdinalIgnoreCase)) {
        Remove-Item -LiteralPath $resolvedBackup -Recurse -Force
      }
    }
    Remove-Item -LiteralPath $pendingPath -Force
  }
}

$installedVersion = if (Test-Path -LiteralPath $versionPath) {
  (Get-Content -LiteralPath $versionPath -Raw).Trim()
} else {
  '0.0.0'
}
$releaseRoot = 'https://agape5.web.app/welltrans-agent'
$manifest = Invoke-RestMethod -Uri "$releaseRoot/version.json" -TimeoutSec 5
if (-not $manifest.version -or -not $manifest.file -or -not $manifest.sha256) {
  throw 'Agape agent release manifest is incomplete.'
}
if ([Version]$manifest.version -le [Version]$installedVersion) {
  return
}

$updateRoot = Join-Path $env:TEMP "AgapeWellTransAgentUpdate-$PID"
$archivePath = Join-Path $updateRoot 'agent.zip'
$backupPath = Join-Path $rollbackRoot $installedVersion
New-Item -ItemType Directory -Path $updateRoot -Force | Out-Null
try {
  Invoke-WebRequest -Uri "$releaseRoot/$($manifest.file)" -OutFile $archivePath -TimeoutSec 120
  $actualHash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actualHash -ne ([String]$manifest.sha256).ToLowerInvariant()) {
    throw 'Agape agent update integrity verification failed.'
  }
  Expand-Archive -LiteralPath $archivePath -DestinationPath $updateRoot -Force
  $installer = Join-Path $updateRoot 'agape-welltrans-agent\launcher\Install-AgapeWellTransAgent.ps1'
  if (-not (Test-Path -LiteralPath $installer)) {
    throw 'Agape agent update does not contain an installer.'
  }

  New-Item -ItemType Directory -Path $rollbackRoot -Force | Out-Null
  if (Test-Path -LiteralPath $backupPath) {
    $resolvedBackup = (Resolve-Path -LiteralPath $backupPath).Path
    $resolvedRollbackRoot = (Resolve-Path -LiteralPath $rollbackRoot).Path
    if (-not $resolvedBackup.StartsWith($resolvedRollbackRoot, [StringComparison]::OrdinalIgnoreCase)) {
      throw 'Agent rollback target was outside the authorized rollback directory.'
    }
    Remove-Item -LiteralPath $resolvedBackup -Recurse -Force
  }
  New-Item -ItemType Directory -Path $backupPath -Force | Out-Null
  foreach ($directory in @('src', 'launcher')) {
    $currentDirectory = Join-Path $installRoot $directory
    if (Test-Path -LiteralPath $currentDirectory) {
      Copy-Item -LiteralPath $currentDirectory -Destination $backupPath -Recurse -Force
    }
  }
  foreach ($file in @('package.json', 'package-lock.json', 'README.md', 'VERSION')) {
    $currentFile = Join-Path $installRoot $file
    if (Test-Path -LiteralPath $currentFile) {
      Copy-Item -LiteralPath $currentFile -Destination (Join-Path $backupPath $file) -Force
    }
  }

  & $installer -SkipBrowserInstall
  $nodeExecutable = Join-Path $installRoot 'runtime\node\node.exe'
  if (-not (Test-Path -LiteralPath $nodeExecutable)) {
    throw 'Updated Agent runtime is unavailable.'
  }
  & $nodeExecutable --check (Join-Path $installRoot 'src\index.js')
  if ($LASTEXITCODE -ne 0) {
    throw "Updated Agent failed its startup syntax check with code $LASTEXITCODE."
  }
  $installedAfterUpdate = (Get-Content -LiteralPath $versionPath -Raw).Trim()
  if ([Version]$installedAfterUpdate -ne [Version]$manifest.version) {
    throw "Updated Agent version $installedAfterUpdate did not match release $($manifest.version)."
  }
  New-Item -ItemType Directory -Path $agentDataRoot -Force | Out-Null
  @{
    previousVersion = $installedVersion
    newVersion = [String]$manifest.version
    backupPath = $backupPath
    installedAtUtc = [DateTime]::UtcNow.ToString('o')
  } | ConvertTo-Json | Set-Content -LiteralPath $pendingPath -Encoding UTF8
} catch {
  $updateFailure = $_.Exception.Message
  if (Test-Path -LiteralPath $backupPath) {
    $resolvedBackup = (Resolve-Path -LiteralPath $backupPath).Path
    $resolvedRollbackRoot = (Resolve-Path -LiteralPath $rollbackRoot).Path
    if ($resolvedBackup.StartsWith($resolvedRollbackRoot, [StringComparison]::OrdinalIgnoreCase)) {
      foreach ($directory in @('src', 'launcher')) {
        $targetDirectory = Join-Path $installRoot $directory
        $backupDirectory = Join-Path $resolvedBackup $directory
        if (Test-Path -LiteralPath $targetDirectory) {
          $resolvedTarget = (Resolve-Path -LiteralPath $targetDirectory).Path
          $resolvedInstallRoot = (Resolve-Path -LiteralPath $installRoot).Path
          if ($resolvedTarget.StartsWith($resolvedInstallRoot, [StringComparison]::OrdinalIgnoreCase)) {
            Remove-Item -LiteralPath $resolvedTarget -Recurse -Force
          }
        }
        if (Test-Path -LiteralPath $backupDirectory) {
          Copy-Item -LiteralPath $backupDirectory -Destination $targetDirectory -Recurse -Force
        }
      }
      foreach ($file in @('package.json', 'package-lock.json', 'README.md', 'VERSION')) {
        $backupFile = Join-Path $resolvedBackup $file
        if (Test-Path -LiteralPath $backupFile) {
          Copy-Item -LiteralPath $backupFile -Destination (Join-Path $installRoot $file) -Force
        }
      }
      $npmExecutable = Join-Path $installRoot 'runtime\node\npm.cmd'
      if (Test-Path -LiteralPath $npmExecutable) {
        Push-Location $installRoot
        try {
          & $npmExecutable ci --omit=dev --no-audit --no-fund
        } finally {
          Pop-Location
        }
      }
      Remove-Item -LiteralPath $resolvedBackup -Recurse -Force
    }
  }
  throw "Agent update failed and the previous release was restored: $updateFailure"
} finally {
  if (Test-Path -LiteralPath $updateRoot) {
    $resolvedUpdateRoot = (Resolve-Path -LiteralPath $updateRoot).Path
    $resolvedTemp = (Resolve-Path -LiteralPath $env:TEMP).Path
    if ($resolvedUpdateRoot.StartsWith($resolvedTemp, [StringComparison]::OrdinalIgnoreCase)) {
      Remove-Item -LiteralPath $resolvedUpdateRoot -Recurse -Force
    }
  }
}
