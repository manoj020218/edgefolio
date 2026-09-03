@echo off
setlocal

echo =================================================
echo  EDGEFOLIO - Admin Password Recovery
echo =================================================
echo.
echo This is a fallback for support use only. If the admin
echo saved their recovery code, use "Forgot password?" on
echo the sign-in screen instead - it does not require this tool.
echo.

set /p ADMIN_EMAIL="Admin email on this install: "
if "%ADMIN_EMAIL%"=="" (
  echo No email entered. Aborting.
  goto :end
)

set ELECTRON_RUN_AS_NODE=1
"%~dp0..\EDGEFOLIO.exe" "%~dp0app.asar\scripts\reset-admin-password.js" --email "%ADMIN_EMAIL%"

:end
echo.
pause
