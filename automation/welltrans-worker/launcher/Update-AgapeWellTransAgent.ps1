$ErrorActionPreference = 'Stop'
$installRoot = Split-Path -Parent $PSScriptRoot
$versionPath = Join-Path $installRoot 'VERSION'
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
  & $installer -SkipBrowserInstall
} finally {
  if (Test-Path -LiteralPath $updateRoot) {
    $resolvedUpdateRoot = (Resolve-Path -LiteralPath $updateRoot).Path
    $resolvedTemp = (Resolve-Path -LiteralPath $env:TEMP).Path
    if ($resolvedUpdateRoot.StartsWith($resolvedTemp, [StringComparison]::OrdinalIgnoreCase)) {
      Remove-Item -LiteralPath $resolvedUpdateRoot -Recurse -Force
    }
  }
}
