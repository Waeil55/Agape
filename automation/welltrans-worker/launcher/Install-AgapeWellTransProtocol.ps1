$ErrorActionPreference = 'Stop'
$launcherPath = Join-Path $PSScriptRoot 'Start-AgapeWellTrans.ps1'
if (-not (Test-Path -LiteralPath $launcherPath)) {
  throw "Launcher was not found at $launcherPath"
}

$protocolKey = 'HKCU:\Software\Classes\agape-welltrans'
New-Item -Path $protocolKey -Force | Out-Null
Set-Item -Path $protocolKey -Value 'URL:Agape WellTrans Worker'
New-ItemProperty -Path $protocolKey -Name 'URL Protocol' -Value '' -PropertyType String -Force | Out-Null
New-Item -Path "$protocolKey\DefaultIcon" -Force | Out-Null
Set-Item -Path "$protocolKey\DefaultIcon" -Value 'powershell.exe,0'
New-Item -Path "$protocolKey\shell\open\command" -Force | Out-Null
$command = "powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$launcherPath`" -ProtocolUrl `"%1`""
Set-Item -Path "$protocolKey\shell\open\command" -Value $command

Write-Host 'Agape WellTrans background-agent protocol installed successfully.' -ForegroundColor Green
