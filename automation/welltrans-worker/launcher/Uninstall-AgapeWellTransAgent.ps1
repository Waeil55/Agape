param(
  [switch]$RemoveEncryptedSession
)

$ErrorActionPreference = 'Stop'
$installRoot = Join-Path $env:LOCALAPPDATA 'AgapeCare\WellTransAgent'
$secretRoot = Join-Path $env:USERPROFILE 'AgapeSecrets'
$lockPath = Join-Path $secretRoot 'welltrans-worker.pid'
$protocolKey = 'HKCU:\Software\Classes\agape-welltrans'

if (Test-Path -LiteralPath $lockPath) {
  $ownerPid = 0
  [void][int]::TryParse((Get-Content -LiteralPath $lockPath -Raw).Trim(), [ref]$ownerPid)
  if ($ownerPid -gt 0) {
    $ownerProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$ownerPid" -ErrorAction SilentlyContinue
    if ($ownerProcess.CommandLine -match 'Start-AgapeWellTrans\.ps1') {
      Stop-Process -Id $ownerPid -ErrorAction SilentlyContinue
    }
  }
}
if (Test-Path -LiteralPath $protocolKey) {
  Remove-Item -LiteralPath $protocolKey -Recurse -Force
}
if (Test-Path -LiteralPath $installRoot) {
  $resolvedInstallRoot = (Resolve-Path -LiteralPath $installRoot).Path
  $expectedParent = (Resolve-Path -LiteralPath (Join-Path $env:LOCALAPPDATA 'AgapeCare')).Path
  if (-not $resolvedInstallRoot.StartsWith($expectedParent, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to remove unexpected path $resolvedInstallRoot"
  }
  Remove-Item -LiteralPath $resolvedInstallRoot -Recurse -Force
}
if ($RemoveEncryptedSession) {
  $sessionPath = Join-Path $secretRoot 'welltrans-session.enc'
  if (Test-Path -LiteralPath $sessionPath) {
    Remove-Item -LiteralPath $sessionPath -Force
  }
}

Write-Host 'Agape WellTrans Agent uninstalled. The DPAPI-protected enrollment credential was preserved.' -ForegroundColor Green
