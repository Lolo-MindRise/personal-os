@echo off
rem Starts personal-os inside WSL and opens it in the default browser.
rem Put a shortcut to this file on the desktop (README, "Run your real instance").
rem
rem Distribution: wsl.exe uses your DEFAULT WSL distribution. To pin another one,
rem add -d <name> after each wsl.exe below (names: run `wsl -l -v` in PowerShell),
rem for example:  wsl.exe -d Ubuntu -- bash -lc "..."
rem
rem APP_DIR is the instance directory inside WSL; change it if you moved it.
set "APP_DIR=$HOME/apps/personal-os"

wsl.exe -- bash -lc "%APP_DIR%/scripts/start.sh"
if errorlevel 1 goto failed

set "PORT="
for /f "usebackq delims=" %%P in (`wsl.exe -- bash -lc "%APP_DIR%/scripts/start.sh --port" ^| findstr /r "^[0-9][0-9]*$"`) do set "PORT=%%P"
if not defined PORT goto failed
start "" "http://localhost:%PORT%"
exit /b 0

:failed
echo.
echo personal-os did not start. Read the message above, fix it and try again.
pause
exit /b 1
