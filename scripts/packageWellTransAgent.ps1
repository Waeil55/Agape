$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$workerRoot = Join-Path $repositoryRoot 'automation\welltrans-worker'
$outputRoot = Join-Path $repositoryRoot 'public\welltrans-agent'
$stagingRoot = Join-Path $env:TEMP "agape-welltrans-agent-package-$PID"
$archivePath = Join-Path $outputRoot 'agape-welltrans-agent.zip'

New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null
New-Item -ItemType Directory -Path $stagingRoot -Force | Out-Null
try {
  $packageRoot = Join-Path $stagingRoot 'agape-welltrans-agent'
  New-Item -ItemType Directory -Path $packageRoot -Force | Out-Null
  Copy-Item -LiteralPath (Join-Path $workerRoot 'src') -Destination $packageRoot -Recurse
  Copy-Item -LiteralPath (Join-Path $workerRoot 'launcher') -Destination $packageRoot -Recurse
  foreach ($file in @(
    'package.json',
    'package-lock.json',
    'README.md',
    'README-FIRST.txt',
    'Install-Agent.cmd'
  )) {
    Copy-Item -LiteralPath (Join-Path $workerRoot $file) -Destination (Join-Path $packageRoot $file)
  }
  if (Test-Path -LiteralPath $archivePath) {
    Remove-Item -LiteralPath $archivePath -Force
  }
  Compress-Archive -LiteralPath $packageRoot -DestinationPath $archivePath -CompressionLevel Optimal
  $packageMetadata = Get-Content -LiteralPath (Join-Path $workerRoot 'package.json') -Raw | ConvertFrom-Json
  $archiveHash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
  $manifestJson = @{
    version = $packageMetadata.version
    sha256 = $archiveHash
    file = 'agape-welltrans-agent.zip'
    publishedAt = [DateTime]::UtcNow.ToString('o')
  } | ConvertTo-Json
  $utf8WithoutBom = New-Object Text.UTF8Encoding($false)
  [IO.File]::WriteAllText(
    (Join-Path $outputRoot 'version.json'),
    $manifestJson,
    $utf8WithoutBom
  )
} finally {
  if (Test-Path -LiteralPath $stagingRoot) {
    $resolvedStaging = (Resolve-Path -LiteralPath $stagingRoot).Path
    $resolvedTemp = (Resolve-Path -LiteralPath $env:TEMP).Path
    if ($resolvedStaging.StartsWith($resolvedTemp, [StringComparison]::OrdinalIgnoreCase)) {
      Remove-Item -LiteralPath $resolvedStaging -Recurse -Force
    }
  }
}

& (Join-Path $PSScriptRoot 'buildWellTransAgentSetup.ps1') | Out-Null
Write-Output $archivePath
