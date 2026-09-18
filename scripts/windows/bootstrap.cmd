@echo off
REM ---------------------------------------------------------------
REM DSH plugin compatibility testenv bootstrap (Windows 11)
REM
REM   bootstrap.cmd                 - auto-pick install method, full toolchain
REM   bootstrap.cmd -Method Zip     - no admin, install under %LOCALAPPDATA%
REM   bootstrap.cmd -WithRepo       - toolchain + clone/build/mount compat profile
REM   bootstrap.cmd -WhatIf         - print what would happen, change nothing
REM   bootstrap.cmd -h              - full help
REM
REM All arguments are passed through to setup-dsh-testenv.ps1 unchanged.
REM
REM NOTE: this file is deliberately pure ASCII. cmd.exe reads .bat/.cmd
REM using the console codepage, so UTF-8 text here would be mojibake on a
REM non-UTF-8 system, and a UTF-8 BOM would corrupt the first line.
REM ---------------------------------------------------------------
setlocal
set "PS1=%~dp0setup-dsh-testenv.ps1"

where powershell >nul 2>nul
if errorlevel 1 (
  echo [FAIL] powershell.exe not found - unexpected on Windows 11.
  exit /b 1
)

if /i "%~1"=="-h" goto help
if /i "%~1"=="--help" goto help
if /i "%~1"=="/?" goto help
goto run

:help
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Help '%PS1%' -Detailed"
exit /b 0

:run
powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" %*
set "RC=%ERRORLEVEL%"
echo.
if "%RC%"=="0" (echo [OK] toolchain ready, exit code 0) else (echo [FAIL] exit code %RC% - see FAIL lines above)
endlocal & exit /b %RC%
