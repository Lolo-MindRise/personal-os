@echo off
rem Stops personal-os inside WSL.
rem
rem Distribution: wsl.exe uses your DEFAULT WSL distribution. To pin another one,
rem add -d <name> after wsl.exe below (names: run `wsl -l -v` in PowerShell),
rem for example:  wsl.exe -d Ubuntu -- bash -lc "..."
rem
rem APP_DIR is the instance directory inside WSL; change it if you moved it.
set "APP_DIR=$HOME/apps/personal-os"

wsl.exe -- bash -lc "%APP_DIR%/scripts/stop.sh"
if errorlevel 1 goto failed
echo.
echo personal-os stopped.
timeout /t 3 >nul
exit /b 0

:failed
echo.
echo personal-os did not stop. Read the message above.
pause
exit /b 1
