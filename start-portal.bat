@echo off
title Portal Operator Presentasi Canva
cls
echo ========================================================
echo       MEMULAI PORTAL OPERATOR PRESENTASI CANVA
echo ========================================================
echo.

node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js belum terinstall atau belum masuk PATH!
    echo Silakan install Node.js terlebih dahulu dari https://nodejs.org
    pause
    exit /b
)

if not exist node_modules (
    echo [INFO] Menginstall dependensi paket terlebih dahulu...
    call npm install
)

echo [INFO] Menjalankan server aplikasi...
start http://localhost:3333/admin
start http://localhost:3333/projector
node server.js

pause
