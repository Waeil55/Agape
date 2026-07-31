param(
  [switch]$SkipBrowserInstall
)

$ErrorActionPreference = 'Stop'
$ConfirmPreference = 'None'
$ProgressPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Security
$agentVersion = '3.6.3'
$sourceRoot = Split-Path -Parent $PSScriptRoot
$installRoot = Join-Path $env:LOCALAPPDATA 'AgapeCare\WellTransAgent'
$secretRoot = Join-Path $env:USERPROFILE 'AgapeSecrets'
$credentialPath = Join-Path $secretRoot 'agape-worker-service-account.json'
$protectedCredentialPath = Join-Path $secretRoot 'agape-worker-service-account.protected'
$federatedCredentialPath = Join-Path $secretRoot 'agape-worker-wif.json'
$sessionPath = Join-Path $secretRoot 'welltrans-session.enc'
$installLog = Join-Path $secretRoot 'welltrans-agent-install.log'
$runtimeRoot = Join-Path $installRoot 'runtime'
$nodeRoot = Join-Path $runtimeRoot 'node'
$nodeExecutable = Join-Path $nodeRoot 'node.exe'

New-Item -ItemType Directory -Path $installRoot -Force | Out-Null
New-Item -ItemType Directory -Path $secretRoot -Force | Out-Null
Start-Transcript -Path $installLog -Append | Out-Null

try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  foreach ($directory in @('src', 'launcher')) {
    $source = Join-Path $sourceRoot $directory
    if (-not (Test-Path -LiteralPath $source)) {
      throw "Agent package is incomplete: $directory is missing."
    }
    Copy-Item -LiteralPath $source -Destination $installRoot -Recurse -Force
  }
  foreach ($file in @('package.json', 'package-lock.json', 'README.md')) {
    Copy-Item -LiteralPath (Join-Path $sourceRoot $file) -Destination (Join-Path $installRoot $file) -Force
  }

  if (-not (Test-Path -LiteralPath $federatedCredentialPath)) {
    $downloads = Join-Path $env:USERPROFILE 'Downloads'
    $federatedCandidate = Get-ChildItem -LiteralPath $downloads -Filter 'agape-worker-wif.json' -File -ErrorAction SilentlyContinue |
      Sort-Object LastWriteTime -Descending |
      Select-Object -First 1
    if ($federatedCandidate) {
      $federatedConfig = Get-Content -LiteralPath $federatedCandidate.FullName -Raw | ConvertFrom-Json
      if ($federatedConfig.type -ne 'external_account') {
        throw 'agape-worker-wif.json is not a valid external-account credential configuration.'
      }
      if ($federatedConfig.credential_source.executable) {
        throw 'Executable-sourced Workload Identity configurations are not permitted by the Agape Agent.'
      }
      if ($federatedConfig.audience -notmatch 'workloadIdentityPools') {
        throw 'agape-worker-wif.json does not contain a valid Workload Identity Pool audience.'
      }
      Copy-Item -LiteralPath $federatedCandidate.FullName -Destination $federatedCredentialPath -Force
    }
  }
  if (-not (Test-Path -LiteralPath $federatedCredentialPath) -and
      -not (Test-Path -LiteralPath $protectedCredentialPath) -and
      -not (Test-Path -LiteralPath $credentialPath)) {
    $downloads = Join-Path $env:USERPROFILE 'Downloads'
    $candidate = Get-ChildItem -LiteralPath $downloads -Filter 'agape-95c9f-firebase-adminsdk-*.json' -File -ErrorAction SilentlyContinue |
      Sort-Object LastWriteTime -Descending |
      Select-Object -First 1
    if ($candidate) {
      Copy-Item -LiteralPath $candidate.FullName -Destination $credentialPath -Force
    }
  }
  if (-not (Test-Path -LiteralPath $federatedCredentialPath) -and
      -not (Test-Path -LiteralPath $protectedCredentialPath) -and
      -not (Test-Path -LiteralPath $credentialPath)) {
    throw "This computer is not enrolled. Preferred: place agape-worker-wif.json in Downloads. Legacy fallback: place the service-account file at $credentialPath."
  }
  if (Test-Path -LiteralPath $credentialPath) {
    $credentialBytes = [IO.File]::ReadAllBytes($credentialPath)
    $protectedBytes = [System.Security.Cryptography.ProtectedData]::Protect(
      $credentialBytes,
      $null,
      [System.Security.Cryptography.DataProtectionScope]::CurrentUser
    )
    [IO.File]::WriteAllBytes($protectedCredentialPath, $protectedBytes)
    Remove-Item -LiteralPath $credentialPath -Force
  }

  $sessionKey = [Environment]::GetEnvironmentVariable('WELLTRANS_SESSION_KEY', 'User')
  if (-not $sessionKey) {
    $keyBytes = New-Object byte[] 32
    [Security.Cryptography.RandomNumberGenerator]::Fill($keyBytes)
    $sessionKey = [Convert]::ToBase64String($keyBytes)
    [Environment]::SetEnvironmentVariable('WELLTRANS_SESSION_KEY', $sessionKey, 'User')
  }
  [Environment]::SetEnvironmentVariable('WELLTRANS_SESSION_FILE', $sessionPath, 'User')
  [Environment]::SetEnvironmentVariable('WELLTRANS_PORTAL_URL', 'https://tripspark.welltransnemt.com/', 'User')
  [Environment]::SetEnvironmentVariable('WELLTRANS_ALLOWED_HOSTS', 'tripspark.welltransnemt.com', 'User')

  if (-not (Test-Path -LiteralPath $nodeExecutable)) {
    $nodeArchitecture = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } else { 'x64' }
    $nodeReleaseRoot = 'https://nodejs.org/download/release/latest-v22.x'
    $nodeStage = Join-Path $env:TEMP "AgapeNodeRuntime-$PID"
    $nodeArchive = Join-Path $nodeStage 'node.zip'
    New-Item -ItemType Directory -Path $nodeStage -Force | Out-Null
    try {
      $checksums = (Invoke-WebRequest -Uri "$nodeReleaseRoot/SHASUMS256.txt" -UseBasicParsing -TimeoutSec 30).Content
      $checksumMatch = [Regex]::Match(
        $checksums,
        "(?m)^([a-f0-9]{64})\s+(node-v[0-9.]+-win-$nodeArchitecture\.zip)$"
      )
      if (-not $checksumMatch.Success) {
        throw "The official Node.js checksum list did not contain a Windows $nodeArchitecture runtime."
      }
      $expectedNodeHash = $checksumMatch.Groups[1].Value.ToLowerInvariant()
      $nodeArchiveName = $checksumMatch.Groups[2].Value
      Invoke-WebRequest -Uri "$nodeReleaseRoot/$nodeArchiveName" -OutFile $nodeArchive -UseBasicParsing -TimeoutSec 180
      $actualNodeHash = (Get-FileHash -LiteralPath $nodeArchive -Algorithm SHA256).Hash.ToLowerInvariant()
      if ($actualNodeHash -ne $expectedNodeHash) {
        throw 'The downloaded Node.js runtime failed integrity verification.'
      }
      Expand-Archive -LiteralPath $nodeArchive -DestinationPath $nodeStage -Force
      $expandedNodeRoot = Get-ChildItem -LiteralPath $nodeStage -Directory -Filter 'node-v*-win-*' |
        Select-Object -First 1
      if (-not $expandedNodeRoot) {
        throw 'The downloaded Node.js runtime could not be opened.'
      }
      New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
      if (Test-Path -LiteralPath $nodeRoot) {
        Remove-Item -LiteralPath $nodeRoot -Recurse -Force
      }
      Move-Item -LiteralPath $expandedNodeRoot.FullName -Destination $nodeRoot
    } finally {
      if (Test-Path -LiteralPath $nodeStage) {
        $resolvedNodeStage = (Resolve-Path -LiteralPath $nodeStage).Path
        $resolvedTemp = (Resolve-Path -LiteralPath $env:TEMP).Path
        if ($resolvedNodeStage.StartsWith($resolvedTemp, [StringComparison]::OrdinalIgnoreCase)) {
          Remove-Item -LiteralPath $resolvedNodeStage -Recurse -Force
        }
      }
    }
  }

  $npmExecutable = Join-Path $nodeRoot 'npm.cmd'
  $npxExecutable = Join-Path $nodeRoot 'npx.cmd'
  if (-not (Test-Path -LiteralPath $npmExecutable) -or -not (Test-Path -LiteralPath $npxExecutable)) {
    throw 'The private Agape Node.js runtime is incomplete.'
  }

  Push-Location $installRoot
  try {
    & $npmExecutable ci --omit=dev --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw "npm installation failed with code $LASTEXITCODE." }
    if (-not $SkipBrowserInstall) {
      & $npxExecutable playwright install chromium
      if ($LASTEXITCODE -ne 0) { throw "Chromium installation failed with code $LASTEXITCODE." }
    }
  } finally {
    Pop-Location
  }

  $launcherPath = Join-Path $installRoot 'launcher\Start-AgapeWellTrans.ps1'
  $protocolKey = 'HKCU:\Software\Classes\agape-welltrans'
  New-Item -Path $protocolKey -Force | Out-Null
  Set-Item -Path $protocolKey -Value 'URL:Agape WellTrans Background Agent'
  New-ItemProperty -Path $protocolKey -Name 'URL Protocol' -Value '' -PropertyType String -Force | Out-Null
  New-Item -Path "$protocolKey\DefaultIcon" -Force | Out-Null
  Set-Item -Path "$protocolKey\DefaultIcon" -Value 'powershell.exe,0'
  New-Item -Path "$protocolKey\shell\open\command" -Force | Out-Null
  $command = "powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$launcherPath`" -ProtocolUrl `"%1`""
  Set-Item -Path "$protocolKey\shell\open\command" -Value $command

  Set-Content -LiteralPath (Join-Path $installRoot 'VERSION') -Value $agentVersion -NoNewline
  & icacls.exe $secretRoot /inheritance:r /grant:r "$env:USERNAME`:(OI)(CI)F" | Out-Null
  Write-Host "Agape WellTrans Agent $agentVersion installed successfully." -ForegroundColor Green
} finally {
  Stop-Transcript -ErrorAction SilentlyContinue | Out-Null
}
