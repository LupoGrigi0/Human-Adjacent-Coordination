@echo off
REM Cross-Platform Certificate Sharing Utility
REM Author: claude-code-Certificate-Specialist-2025-09-03
REM
REM Helps share mkcert certificates with Mac/Android devices

setlocal enabledelayedexpansion

echo.
echo ==========================================
echo  MCP Certificate Sharing Utility
echo  Windows to Mac/Android Transfer
echo ==========================================
echo.

REM Get directories
set "SCRIPT_DIR=%~dp0"
set "PROJECT_DIR=%SCRIPT_DIR%..\"
set "CERTS_DIR=%PROJECT_DIR%certs"

echo [INFO] Certificates Directory: %CERTS_DIR%
echo.

REM Check if certificates exist
if not exist "%CERTS_DIR%\localhost.pem" (
    echo [ERROR] mkcert certificates not found!
    echo [INFO] Please run setup-ssl-windows.bat first
    pause
    exit /b 1
)

if not exist "%CERTS_DIR%\mkcert-ca-cert.pem" (
    echo [ERROR] CA certificate not found!
    echo [INFO] Please run setup-ssl-windows.bat first
    pause
    exit /b 1
)

REM Auto-detect local IP
echo [INFO] Detecting local IP address...
for /f "tokens=2 delims=:" %%i in ('ipconfig ^| findstr /i "IPv4 Address"') do (
    for /f "tokens=1 delims= " %%j in ("%%i") do (
        set "LOCAL_IP=%%j"
        goto :ip_found
    )
)

:ip_found
if not defined LOCAL_IP set "LOCAL_IP=192.168.0.171"

echo [INFO] Local IP Address: %LOCAL_IP%
echo.

REM Display certificate information
echo ==========================================
echo  CERTIFICATE INFORMATION
echo ==========================================
echo.
echo Generated certificates:
dir "%CERTS_DIR%\*.pem" /b
echo.

echo Certificate Details:
type "%CERTS_DIR%\cert-info.txt" 2>nul || echo [INFO] Run setup-ssl-windows.bat to generate cert-info.txt
echo.

REM Show sharing options
echo ==========================================
echo  CERTIFICATE SHARING OPTIONS
echo ==========================================
echo.
echo Choose transfer method:
echo 1. Start HTTP file server (recommended)
echo 2. Create network share
echo 3. Show manual copy instructions
echo 4. Generate QR code for easy transfer
echo 5. Exit
echo.

set /p choice="Enter choice (1-5): "

if "%choice%"=="1" goto :http_server
if "%choice%"=="2" goto :network_share
if "%choice%"=="3" goto :manual_copy
if "%choice%"=="4" goto :qr_code
if "%choice%"=="5" goto :exit
goto :invalid_choice

:http_server
echo.
echo [INFO] Starting HTTP file server for certificate sharing...
echo [INFO] Certificates will be available at:
echo         http://%LOCAL_IP%:8000/mkcert-ca-cert.pem
echo.
echo [INFO] On Mac/Android devices:
echo         1. Open browser and navigate to http://%LOCAL_IP%:8000
echo         2. Click on mkcert-ca-cert.pem to download
echo         3. Follow platform-specific installation guides
echo.
echo [INFO] Press Ctrl+C to stop the server when transfer is complete
echo.

cd /d "%CERTS_DIR%"

REM Try Python first, then Node.js, then fallback
python -m http.server 8000 2>nul || (
    node -e "const http=require('http'),fs=require('fs'),path=require('path');http.createServer((req,res)=>{const file=path.join(__dirname,req.url);if(fs.existsSync(file)&&fs.statSync(file).isFile()){res.writeHead(200,{'Content-Type':'application/x-pem-file'});fs.createReadStream(file).pipe(res)}else{res.writeHead(200,{'Content-Type':'text/html'});res.end('<h1>MCP Certificates</h1><a href=\"mkcert-ca-cert.pem\">Download mkcert-ca-cert.pem</a>')}}).listen(8000,()=>console.log('Server at http://%LOCAL_IP%:8000'))" 2>nul || (
        echo [ERROR] Neither Python nor Node.js available for HTTP server
        echo [INFO] Please install Python or use another transfer method
        pause
        exit /b 1
    )
)
goto :end

:network_share
echo.
echo [INFO] Network sharing instructions:
echo.
echo Windows File Sharing Setup:
echo 1. Right-click on "%CERTS_DIR%" folder
echo 2. Select "Give access to" > "Specific people"
echo 3. Add "Everyone" with "Read" permissions
echo 4. Click "Share"
echo.
echo Network path will be: \\%COMPUTERNAME%\%CERTS_DIR:~3%
echo Or: \\%LOCAL_IP%\%CERTS_DIR:~3%
echo.
echo Mac Access:
echo 1. Open Finder > Go > Connect to Server
echo 2. Enter: smb://%LOCAL_IP%
echo 3. Navigate to shared folder and copy mkcert-ca-cert.pem
echo.
pause
goto :end

:manual_copy
echo.
echo [INFO] Manual certificate copy instructions:
echo.
echo Certificate Location: %CERTS_DIR%
echo.
echo FOR MAC:
echo 1. Copy mkcert-ca-cert.pem to Mac via USB, email, or cloud storage
echo 2. Run: bash setup-ssl-mac.sh %LOCAL_IP%
echo 3. Test: curl https://%LOCAL_IP%:3444/health
echo.
echo FOR ANDROID:
echo 1. Copy mkcert-ca-cert.pem to Android device
echo 2. Follow ANDROID_SETUP.md instructions
echo 3. Install via Settings > Security > Install certificates
echo 4. Test: Browse to https://%LOCAL_IP%:3444/health
echo.
echo FOR OTHER DEVICES:
echo 1. Copy mkcert-ca-cert.pem to target device
echo 2. Install as trusted CA certificate
echo 3. Verify connection to https://%LOCAL_IP%:3444
echo.
pause
goto :end

:qr_code
echo.
echo [INFO] QR Code generation requires additional tools
echo.

REM Try to find a QR code generator
where qrencode >nul 2>&1 && (
    echo [INFO] Generating QR code for CA certificate download...
    qrencode -o "%CERTS_DIR%\cert-download-qr.png" "http://%LOCAL_IP%:8000/mkcert-ca-cert.pem"
    echo [INFO] QR code saved to: %CERTS_DIR%\cert-download-qr.png
    echo [INFO] Start HTTP server first, then scan QR code on mobile devices
) || (
    echo [INFO] QR code generator not available
    echo [INFO] Install qrencode: choco install qrencode
    echo.
    echo [INFO] Alternative - Manual QR code:
    echo         Create QR code for: http://%LOCAL_IP%:8000/mkcert-ca-cert.pem
    echo         Use online QR generator: https://www.qr-code-generator.com/
)
echo.
pause
goto :end

:invalid_choice
echo [ERROR] Invalid choice. Please select 1-5.
goto :start

:exit
echo.
echo [INFO] Certificate sharing utility exited
goto :end

:end
echo.
echo ==========================================
echo  NEXT STEPS SUMMARY
echo ==========================================
echo.
echo Windows Server Ready:
echo - Certificates: %CERTS_DIR%
echo - Server URL: https://%LOCAL_IP%:3444
echo - Start server: npm run start:sse
echo.
echo Mac Setup:
echo - Copy mkcert-ca-cert.pem to Mac
echo - Run: bash setup-ssl-mac.sh %LOCAL_IP%
echo.
echo Android Setup:
echo - Copy mkcert-ca-cert.pem to Android
echo - Follow ANDROID_SETUP.md guide
echo.
echo Test Connection:
echo - Browser: https://%LOCAL_IP%:3444/health
echo - Should show JSON without certificate warnings
echo.
pause