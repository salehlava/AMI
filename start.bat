@echo off
set PHP_EXE=C:\Users\poseidon\php\php.exe
cd /d "%~dp0"
echo Starting AMI Cafe at http://127.0.0.1:8080
echo   Menu:  http://127.0.0.1:8080/
echo   Admin: http://127.0.0.1:8080/admin.html
start "" http://127.0.0.1:8080
"%PHP_EXE%" -S 127.0.0.1:8080 router.php
