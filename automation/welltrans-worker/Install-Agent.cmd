@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0launcher\Install-AgapeWellTransAgent.ps1"
if errorlevel 1 (
  echo Installation could not be completed.
  echo Details: %USERPROFILE%\AgapeSecrets\welltrans-agent-install.log
  pause
  exit /b 1
)
echo Agape WellTrans Agent installed successfully.
pause
