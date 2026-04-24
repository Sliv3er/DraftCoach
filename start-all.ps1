# DraftCoach One-Click Start Script
# Run this to start all services

$ErrorActionPreference = "Continue"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  DraftCoach - Starting All Services" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# ── Check MongoDB ──
Write-Host "[1/4] Checking MongoDB..." -ForegroundColor Yellow
$mongoRunning = Get-Process mongod -ErrorAction SilentlyContinue
if ($mongoRunning) {
    Write-Host "  ✓ MongoDB already running (PID: $($mongoRunning.Id))" -ForegroundColor Green
} else {
    Write-Host "  ⚠ MongoDB not running, attempting to start..." -ForegroundColor Yellow
    if (Test-Path "C:\MongoDB\mongodb-win32-x86_64-windows-7.0.14\bin\mongod.exe") {
        Start-Process -FilePath "C:\MongoDB\mongodb-win32-x86_64-windows-7.0.14\bin\mongod.exe" -ArgumentList "--dbpath", "C:\MongoDB\data", "--port", "27017", "--bind_ip", "127.0.0.1" -WindowStyle Hidden
        Start-Sleep 3
        Write-Host "  ✓ MongoDB started" -ForegroundColor Green
    } else {
        Write-Host "  ✗ MongoDB not found at C:\MongoDB" -ForegroundColor Red
    }
}

# ── Start Backend ──
Write-Host "[2/4] Starting Backend..." -ForegroundColor Yellow
$backendPath = "C:\Users\n3tgg\.openclaw2\workspace\DraftCoach\apps\backend"
if (Test-Path "$backendPath\package.json") {
    Push-Location $backendPath
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$backendPath'; npm run dev" -WindowStyle Normal -PassThru -RedirectStandardOutput "$env:TEMP\backend.log"
    Write-Host "  ✓ Backend starting on port 3210..." -ForegroundColor Green
    Pop-Location
} else {
    Write-Host "  ✗ Backend not found at $backendPath" -ForegroundColor Red
}

# ── Start Billing Service ──
Write-Host "[3/4] Starting Billing Service..." -ForegroundColor Yellow
$billingPath = "C:\Users\n3tgg\.openclaw2\workspace\DraftCoach\apps\billing"
if (Test-Path "$billingPath\package.json") {
    Push-Location $billingPath
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$billingPath'; npm run dev" -WindowStyle Normal -PassThru -RedirectStandardOutput "$env:TEMP\billing.log"
    Write-Host "  ✓ Billing service starting on port 3211..." -ForegroundColor Green
    Pop-Location
} else {
    Write-Host "  ✗ Billing service not found at $billingPath" -ForegroundColor Red
}

# ── Start Web ──
Write-Host "[4/4] Starting Web Frontend..." -ForegroundColor Yellow
$webPath = "C:\Users\n3tgg\.openclaw2\workspace\DraftCoach\apps\web"
if (Test-Path "$webPath\package.json") {
    Push-Location $webPath
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$webPath'; npm run dev" -WindowStyle Normal -PassThru -RedirectStandardOutput "$env:TEMP\web.log"
    Write-Host "  ✓ Web starting on port 3000..." -ForegroundColor Green
    Pop-Location
} else {
    Write-Host "  ✗ Web not found at $webPath" -ForegroundColor Red
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  All services started!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  - Backend:    http://localhost:3210" -ForegroundColor White
Write-Host "  - Billing:    http://localhost:3211" -ForegroundColor White
Write-Host "  - Web:        http://localhost:3000" -ForegroundColor White
Write-Host "  - Billing UI: http://localhost:3000/billing" -ForegroundColor White
Write-Host ""
Write-Host "Press any key to exit (services will keep running)..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")