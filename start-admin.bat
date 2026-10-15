@echo off
set PHP_EXE=C:\Users\poseidon\php\php.exe
set ADDRESS=127.0.0.1:8080
cd /d "%~dp0"

rem If start.bat is already running the server, just open the admin panel
netstat -ano | findstr /c:"%ADDRESS%" | findstr /c:"LISTENING" >nul
if %errorlevel%==0 (
    echo AMI Cafe server is already running.
    echo Opening Admin at http://%ADDRESS%/admin.html
    start "" http://%ADDRESS%/admin.html
    exit /b
)

echo Starting AMI Cafe Admin at http://%ADDRESS%/admin.html
echo   Menu:  http://%ADDRESS%/
echo   Admin: http://%ADDRESS%/admin.html
start "" http://%ADDRESS%/admin.html
"%PHP_EXE%" -S %ADDRESS% router.php
