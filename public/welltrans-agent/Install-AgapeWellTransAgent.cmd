@echo off
setlocal
set "AGAPE_INSTALL_TEMP=%TEMP%\AgapeWellTransAgentInstall"
if not exist "%AGAPE_INSTALL_TEMP%" mkdir "%AGAPE_INSTALL_TEMP%"
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; $base='https://agape5.web.app/welltrans-agent'; $manifest=Invoke-RestMethod -Uri ($base + '/version.json'); Invoke-WebRequest -Uri ($base + '/' + $manifest.file) -OutFile '%AGAPE_INSTALL_TEMP%\agent.zip'; $actual=(Get-FileHash -LiteralPath '%AGAPE_INSTALL_TEMP%\agent.zip' -Algorithm SHA256).Hash.ToLowerInvariant(); if($actual -ne $manifest.sha256){ throw 'Agent package integrity verification failed.' }; Expand-Archive -LiteralPath '%AGAPE_INSTALL_TEMP%\agent.zip' -DestinationPath '%AGAPE_INSTALL_TEMP%' -Force; & '%AGAPE_INSTALL_TEMP%\agape-welltrans-agent\launcher\Install-AgapeWellTransAgent.ps1'"
if errorlevel 1 (
  echo Installation could not be completed. See %USERPROFILE%\AgapeSecrets\welltrans-agent-install.log
  pause
  exit /b 1
)
echo Agape WellTrans Agent installed successfully. You can close this window.
pause
