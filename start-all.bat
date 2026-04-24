@echo off
echo ========================================
echo   DraftCoach - One Click Start
echo ========================================
echo.
echo Starting all services...
echo.

REM Start MongoDB if not running
tasklist /FI "IMAGENAME eq mongod.exe" 2>NUL | findstr /I "mongod.exe" >NUL
if %ERRORLEVEL% NEQ 0 (
    echo Starting MongoDB...
    start "MongoDB" "C:\MongoDB\mongodb-win32-x86_64-windows-7.0.14\bin\mongod.exe" --dbpath "C:\MongoDB\data" --port 27017 --bind_ip 127.0.0.1
    timeout /t 3 /nobreak >nul
)

REM Start Backend
echo Starting Backend...
start "DraftCoach Backend" cmd /k "cd /d C:\Users\n3tgg\.openclaw2\workspace\DraftCoach\apps\backend && npm run dev"

REM Start Billing
echo Starting Billing...
start "DraftCoach Billing" cmd /k "cd /d C:\Users\n3tgg\.openclaw2\workspace\DraftCoach\apps\billing && npm run dev"

REM Start Web
echo Starting Web...
start "DraftCoach Web" cmd /k "cd /d C:\Users\n3tgg\.openclaw2\workspace\DraftCoach\apps\web && npm run dev"

echo.
echo ========================================
echo   All services started!
echo ========================================
echo.
echo   - Backend:    http://localhost:3210
echo   - Billing:    http://localhost:3211
echo   - Web:        http://localhost:3000
echo   - Billing UI: http://localhost:3000/billing
echo.
pause