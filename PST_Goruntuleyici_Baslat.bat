@echo off
chcp 65001 > nul
title PST Görüntüleyici Pro
color 0b

echo ========================================================
echo       PST GORUNTULEYICI PRO (OUTLOOK GEREKTIRMEZ)
echo ========================================================
echo.
echo [1/3] Calisma dizini ayarlaniyor...
cd /d "%~dp0"

echo [2/3] Bagimliliklar kontrol ediliyor...
if not exist "node_modules" (
    echo Gerekli kutuphaneler yukleniyor, lutfen bekleyin...
    call npm install
)

echo [3/3] PST Sunucusu baslatiliyor...
echo.
echo ========================================================
echo  Uygulama basariyla baslatildi!
echo  Tarayiciniz acilmazsa su adresi acin: http://localhost:3800
echo  Uygulamayi kapatmak icin bu pencereyi kapatabilirsiniz.
echo ========================================================
echo.

start http://localhost:3800
node --max-old-space-size=8192 server.js

pause
