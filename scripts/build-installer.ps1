# DraftCoach - Full Installer Build Pipeline
# Builds Tauri app -> NSIS installer -> Premium wrapper with embedded NSIS

param(
    [switch]$SkipTauri,
    [switch]$SkipWrapper
)

$ErrorActionPreference = "Stop"
if ($PSScriptRoot) {
    $Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
} else {
    $Root = (Get-Location).Path
}

$TauriDir     = "$Root\apps\desktop-tauri"
$TauriSrc     = "$TauriDir\src-tauri"
$NsisDir      = "$TauriSrc\target\release\bundle\nsis"
$InstallerDir = "$Root\apps\installer"
$OutputExe    = "$InstallerDir\target\release\DraftCoach_Setup.exe"

Write-Host ""
Write-Host "=== DraftCoach Installer Build Pipeline ===" -ForegroundColor DarkYellow
Write-Host ""

# -- Step 1: Build Tauri + NSIS --
if (-not $SkipTauri) {
    Write-Host "[1/3] Building Tauri application..." -ForegroundColor Cyan

    Push-Location $TauriDir
    try {
        if (-not (Test-Path "node_modules")) {
            Write-Host "  -> Installing frontend dependencies..." -ForegroundColor Gray
            npm install --silent
        }
        Write-Host "  -> Running: npx tauri build" -ForegroundColor Gray
        npx tauri build
        if ($LASTEXITCODE -ne 0) { throw "Tauri build failed" }
    } finally {
        Pop-Location
    }

    $NsisExe = Get-ChildItem "$NsisDir\DraftCoach_*-setup.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $NsisExe) { throw "NSIS installer not found in $NsisDir" }
    $sizeMB = [math]::Round($NsisExe.Length / 1MB, 1)
    Write-Host "  OK: $($NsisExe.Name) - $sizeMB MB" -ForegroundColor Green
} else {
    $NsisExe = Get-ChildItem "$NsisDir\DraftCoach_*-setup.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $NsisExe) { throw "No existing NSIS installer found. Run without -SkipTauri." }
    Write-Host "[1/3] Skipping Tauri build, using: $($NsisExe.Name)" -ForegroundColor Yellow
}

if ($SkipWrapper) {
    Write-Host ""
    Write-Host "Done. NSIS installer at: $($NsisExe.FullName)" -ForegroundColor Green
    exit 0
}

# -- Step 2: Build Premium Wrapper --
Write-Host ""
Write-Host "[2/3] Building premium installer wrapper..." -ForegroundColor Cyan
Write-Host "  -> Embedding: $($NsisExe.Name)" -ForegroundColor Gray

Push-Location $InstallerDir
try {
    if (Test-Path "embedded-setup.exe") { Remove-Item "embedded-setup.exe" -Force }
    cargo build --release
    if ($LASTEXITCODE -ne 0) { throw "Cargo build failed" }
} finally {
    Pop-Location
}

Write-Host "  OK: Wrapper built" -ForegroundColor Green

# -- Step 3: Output --
Write-Host ""
Write-Host "[3/3] Final output:" -ForegroundColor Cyan

$Final = Get-Item $OutputExe
$finalSizeMB = [math]::Round($Final.Length / 1MB, 2)

Write-Host ""
Write-Host "=== BUILD COMPLETE ===" -ForegroundColor Green
Write-Host "  File: $($Final.Name)" -ForegroundColor White
Write-Host "  Size: $finalSizeMB MB" -ForegroundColor White
Write-Host "  Path: $($Final.FullName)" -ForegroundColor Gray

# Copy to dist
$DistDir = "$Root\dist"
if (-not (Test-Path $DistDir)) { New-Item -ItemType Directory -Path $DistDir -Force | Out-Null }
Copy-Item $OutputExe "$DistDir\DraftCoach_Setup.exe" -Force
Write-Host "  Dist: $DistDir\DraftCoach_Setup.exe" -ForegroundColor Gray
Write-Host ""
