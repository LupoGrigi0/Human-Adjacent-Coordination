@echo off
REM Cross-Platform mkcert Certificate Setup for Windows Server
REM Author: claude-code-Certificate-Specialist-2025-09-03
REM
REM This script sets up mkcert certificates for local network MCP testing
REM Supports Windows server accessible from Mac/Android on different subnets

setlocal enabledelayedexpansion

echo.
echo ==========================================
echo  MCP Cross-Platform Certificate Setup
echo  Windows Server (mkcert)
echo ==========================================
echo.

REM Get the directory where this script is located
set "SCRIPT_DIR=%~dp0"
set "PROJECT_DIR=%SCRIPT_DIR%..\"
set "CERTS_DIR=%PROJECT_DIR%certs"

echo [INFO] Script Directory: %SCRIPT_DIR%
echo [INFO] Project Directory: %PROJECT_DIR%
echo [INFO] Certificates Directory: %CERTS_DIR%
echo.

REM Create certificates directory
if not exist "%CERTS_DIR%" (
    echo [INFO] Creating certificates directory...
    mkdir "%CERTS_DIR%"
)

REM Check if mkcert is installed
echo [INFO] Checking if mkcert is installed...
mkcert -version >nul 2>&1
if errorlevel 1 (
    echo [WARN] mkcert not found. Installing via Chocolatey...
    
    REM Check if Chocolatey is installed
    choco -v >nul 2>&1
    if errorlevel 1 (
        echo [ERROR] Chocolatey not found. Please install Chocolatey first:
        echo         https://chocolatey.org/install
        echo.
        echo         Or install mkcert manually:
        echo         https://github.com/FiloSottile/mkcert#installation
        pause
        exit /b 1
    )
    
    echo [INFO] Installing mkcert...
    choco install mkcert -y
    if errorlevel 1 (
        echo [ERROR] Failed to install mkcert via Chocolatey
        echo [INFO] Please install mkcert manually from: https://github.com/FiloSottile/mkcert#installation
        pause
        exit /b 1
    )
    
    echo [INFO] mkcert installed successfully!
    echo.
) else (
    echo [INFO] mkcert is already installed
    mkcert -version
    echo.
)

REM Auto-detect local IP address
echo [INFO] Auto-detecting local IP address...
for /f "tokens=2 delims=:" %%i in ('ipconfig ^| findstr /i "IPv4 Address"') do (
    for /f "tokens=1 delims= " %%j in ("%%i") do (
        set "LOCAL_IP=%%j"
        goto :ip_found
    )
)

:ip_found
if not defined LOCAL_IP (
    echo [ERROR] Could not auto-detect IP address
    set /p LOCAL_IP="Please enter your local IP address: "
)

echo [INFO] Using local IP address: %LOCAL_IP%
echo.

REM Install local CA
echo [INFO] Installing mkcert local Certificate Authority...
mkcert -install
if errorlevel 1 (
    echo [ERROR] Failed to install local CA
    pause
    exit /b 1
)
echo [INFO] Local CA installed successfully!
echo.

REM Generate certificates for localhost and local IP
echo [INFO] Generating certificates for localhost and %LOCAL_IP%...
cd /d "%CERTS_DIR%"
mkcert localhost 127.0.0.1 %LOCAL_IP%
if errorlevel 1 (
    echo [ERROR] Failed to generate certificates
    pause
    exit /b 1
)

REM Rename certificates to expected names
if exist "localhost+2.pem" (
    echo [INFO] Renaming certificate files...
    move "localhost+2.pem" "localhost.pem" >nul
    move "localhost+2-key.pem" "localhost-key.pem" >nul
    echo [INFO] Certificates renamed:
    echo         - localhost.pem (certificate)
    echo         - localhost-key.pem (private key)
) else if exist "localhost+1.pem" (
    move "localhost+1.pem" "localhost.pem" >nul
    move "localhost+1-key.pem" "localhost-key.pem" >nul
    echo [INFO] Certificates renamed for localhost+1
) else (
    echo [WARN] Certificate files have unexpected names, please check:
    dir *.pem
)
echo.

REM Get mkcert CA root directory
echo [INFO] Getting mkcert CA root directory...
for /f "tokens=*" %%i in ('mkcert -CAROOT') do set "CAROOT=%%i"
echo [INFO] CA Root Directory: %CAROOT%
echo.

REM Copy CA certificate for sharing with other platforms
echo [INFO] Copying CA certificate for cross-platform sharing...
if exist "%CAROOT%\rootCA.pem" (
    copy "%CAROOT%\rootCA.pem" "%CERTS_DIR%\mkcert-ca-cert.pem" >nul
    echo [INFO] CA certificate copied to: %CERTS_DIR%\mkcert-ca-cert.pem
) else (
    echo [ERROR] CA certificate not found at: %CAROOT%\rootCA.pem
)
echo.

REM Create certificate info file
echo [INFO] Creating certificate information file...
echo # mkcert Certificate Information > "%CERTS_DIR%\cert-info.txt"
echo Generated: %date% %time% >> "%CERTS_DIR%\cert-info.txt"
echo Local IP: %LOCAL_IP% >> "%CERTS_DIR%\cert-info.txt"
echo CA Root: %CAROOT% >> "%CERTS_DIR%\cert-info.txt"
echo. >> "%CERTS_DIR%\cert-info.txt"
echo Certificates: >> "%CERTS_DIR%\cert-info.txt"
echo - localhost.pem (public certificate) >> "%CERTS_DIR%\cert-info.txt"
echo - localhost-key.pem (private key) >> "%CERTS_DIR%\cert-info.txt"
echo - mkcert-ca-cert.pem (CA certificate for other platforms) >> "%CERTS_DIR%\cert-info.txt"
echo.

REM Display certificate details
echo [INFO] Verifying generated certificates...
if exist "%CERTS_DIR%\localhost.pem" (
    echo [SUCCESS] Certificate files generated successfully:
    dir "%CERTS_DIR%\*.pem" /b
    echo.
    
    REM Show certificate details
    echo [INFO] Certificate Subject Alternative Names:
    openssl x509 -in "%CERTS_DIR%\localhost.pem" -noout -text | findstr "DNS:\|IP Address:" 2>nul
    echo.
) else (
    echo [ERROR] Certificate generation failed - files not found
    pause
    exit /b 1
)

REM Network sharing instructions
echo ==========================================
echo  CROSS-PLATFORM SETUP INSTRUCTIONS
echo ==========================================
echo.
echo 1. WINDOWS SERVER SETUP COMPLETE!
echo    - mkcert CA installed locally
echo    - Certificates generated for localhost and %LOCAL_IP%
echo    - Server certificates ready for HTTPS
echo.
echo 2. MAC CLIENT SETUP:
echo    - Copy mkcert-ca-cert.pem to your Mac
echo    - Run: bash setup-ssl-mac.sh %LOCAL_IP%
echo    - Test connection: curl https://%LOCAL_IP%:3444/health
echo.
echo 3. ANDROID CLIENT SETUP:
echo    - Copy mkcert-ca-cert.pem to Android device
echo    - Follow ANDROID_SETUP.md instructions
echo    - Install certificate via Settings ^> Security
echo.
echo 4. SERVER STARTUP:
echo    - The SSE server will automatically use these certificates
echo    - Start with: npm run start:sse
echo    - Access via: https://%LOCAL_IP%:3444
echo.
echo ==========================================
echo  CERTIFICATE FILES READY
echo ==========================================
echo.
echo Generated in: %CERTS_DIR%
echo - localhost.pem (server certificate)
echo - localhost-key.pem (server private key)  
echo - mkcert-ca-cert.pem (CA cert for clients)
echo - cert-info.txt (setup information)
echo.

echo [SUCCESS] Windows mkcert setup complete!
echo.
echo To start the MCP server with HTTPS:
echo   cd /d "%PROJECT_DIR%"
echo   npm run start:sse
echo.
echo The server will be accessible from:
echo - Windows: https://localhost:3444
echo - Network: https://%LOCAL_IP%:3444
echo.

pause