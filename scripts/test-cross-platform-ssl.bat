@echo off
REM Cross-Platform SSL Certificate Test Suite
REM Author: claude-code-Certificate-Specialist-2025-09-03
REM
REM Comprehensive testing of mkcert certificate solution

setlocal enabledelayedexpansion

echo.
echo ==========================================
echo  Cross-Platform SSL Certificate Test
echo  Validation Suite
echo ==========================================
echo.

REM Get directories
set "SCRIPT_DIR=%~dp0"
set "PROJECT_DIR=%SCRIPT_DIR%..\"
set "CERTS_DIR=%PROJECT_DIR%certs"
set "SRC_DIR=%PROJECT_DIR%src"

echo [INFO] Running certificate validation tests...
echo [INFO] Project Directory: %PROJECT_DIR%
echo [INFO] Certificates Directory: %CERTS_DIR%
echo.

REM Test 1: Check if mkcert is installed
echo ==========================================
echo  TEST 1: mkcert Installation
echo ==========================================
echo.

mkcert -version >nul 2>&1
if errorlevel 1 (
    echo [FAIL] mkcert not installed
    echo [INFO] Run: choco install mkcert
    set "test1=FAIL"
) else (
    echo [PASS] mkcert is installed
    mkcert -version
    set "test1=PASS"
)
echo.

REM Test 2: Check certificate files
echo ==========================================
echo  TEST 2: Certificate Files
echo ==========================================
echo.

set "test2=PASS"

if exist "%CERTS_DIR%\localhost.pem" (
    echo [PASS] Server certificate exists: localhost.pem
) else (
    echo [FAIL] Server certificate missing: localhost.pem
    set "test2=FAIL"
)

if exist "%CERTS_DIR%\localhost-key.pem" (
    echo [PASS] Server private key exists: localhost-key.pem
) else (
    echo [FAIL] Server private key missing: localhost-key.pem
    set "test2=FAIL"
)

if exist "%CERTS_DIR%\mkcert-ca-cert.pem" (
    echo [PASS] CA certificate exists: mkcert-ca-cert.pem
) else (
    echo [FAIL] CA certificate missing: mkcert-ca-cert.pem
    set "test2=FAIL"
)
echo.

REM Test 3: Certificate validity
echo ==========================================
echo  TEST 3: Certificate Validity
echo ==========================================
echo.

if exist "%CERTS_DIR%\localhost.pem" (
    echo [INFO] Checking certificate details...
    openssl x509 -in "%CERTS_DIR%\localhost.pem" -noout -dates -subject -issuer 2>nul && (
        echo [PASS] Certificate is valid and readable
        set "test3=PASS"
    ) || (
        echo [FAIL] Certificate validation failed
        set "test3=FAIL"
    )
    
    echo.
    echo [INFO] Certificate Subject Alternative Names:
    openssl x509 -in "%CERTS_DIR%\localhost.pem" -noout -text | findstr "DNS:\|IP Address:" 2>nul || echo [WARN] Could not read SAN extensions
) else (
    echo [FAIL] Certificate file not found for validation
    set "test3=FAIL"
)
echo.

REM Test 4: Network configuration
echo ==========================================
echo  TEST 4: Network Configuration
echo ==========================================
echo.

echo [INFO] Detecting network configuration...
for /f "tokens=2 delims=:" %%i in ('ipconfig ^| findstr /i "IPv4 Address"') do (
    for /f "tokens=1 delims= " %%j in ("%%i") do (
        set "LOCAL_IP=%%j"
        echo [INFO] Local IP Address: !LOCAL_IP!
        goto :ip_found
    )
)

:ip_found
if defined LOCAL_IP (
    echo [PASS] Network IP detected: %LOCAL_IP%
    set "test4=PASS"
) else (
    echo [FAIL] Could not detect local IP address
    set "test4=FAIL"
)
echo.

REM Test 5: Port availability
echo ==========================================
echo  TEST 5: Port Availability
echo ==========================================
echo.

echo [INFO] Checking if port 3444 is available...
netstat -an | findstr ":3444 " >nul 2>&1
if errorlevel 1 (
    echo [PASS] Port 3444 is available
    set "test5=PASS"
) else (
    echo [WARN] Port 3444 is in use (server may be running)
    netstat -an | findstr ":3444 "
    set "test5=WARN"
)
echo.

REM Test 6: SSL Server compatibility
echo ==========================================
echo  TEST 6: SSL Server Compatibility
echo ==========================================
echo.

if exist "%SRC_DIR%\sse-server.js" (
    echo [PASS] SSE server found: %SRC_DIR%\sse-server.js
    
    REM Check if server has mkcert support
    findstr "mkcert" "%SRC_DIR%\sse-server.js" >nul 2>&1 && (
        echo [PASS] Server has mkcert integration
    ) || (
        echo [WARN] Server may not have mkcert integration
    )
    
    set "test6=PASS"
) else (
    echo [FAIL] SSE server not found
    set "test6=FAIL"
)
echo.

REM Test 7: Cross-platform scripts
echo ==========================================
echo  TEST 7: Cross-Platform Scripts
echo ==========================================
echo.

if exist "%SCRIPT_DIR%\setup-ssl-mac.sh" (
    echo [PASS] Mac setup script available
) else (
    echo [FAIL] Mac setup script missing
)

if exist "%PROJECT_DIR%\ANDROID_SETUP.md" (
    echo [PASS] Android setup guide available
) else (
    echo [FAIL] Android setup guide missing  
)

if exist "%SCRIPT_DIR%\share-certificates.bat" (
    echo [PASS] Certificate sharing utility available
    set "test7=PASS"
) else (
    echo [FAIL] Certificate sharing utility missing
    set "test7=FAIL"
)
echo.

REM Test 8: Dependencies check
echo ==========================================
echo  TEST 8: Dependencies Check
echo ==========================================
echo.

node --version >nul 2>&1 && (
    echo [PASS] Node.js available: 
    node --version
) || (
    echo [FAIL] Node.js not found
    set "test8=FAIL"
)

npm --version >nul 2>&1 && (
    echo [PASS] npm available:
    npm --version
) || (
    echo [FAIL] npm not found
    set "test8=FAIL"
)

python --version >nul 2>&1 && (
    echo [PASS] Python available (for HTTP server):
    python --version
    set "test8=PASS"
) || (
    echo [INFO] Python not available (optional for file sharing)
    if "%test8%"=="" set "test8=PASS"
)
echo.

REM Generate test report
echo ==========================================
echo  TEST RESULTS SUMMARY
echo ==========================================
echo.

set "total_tests=8"
set "passed=0"
set "failed=0"
set "warnings=0"

if "%test1%"=="PASS" set /a passed+=1
if "%test1%"=="FAIL" set /a failed+=1
if "%test2%"=="PASS" set /a passed+=1
if "%test2%"=="FAIL" set /a failed+=1
if "%test3%"=="PASS" set /a passed+=1
if "%test3%"=="FAIL" set /a failed+=1
if "%test4%"=="PASS" set /a passed+=1
if "%test4%"=="FAIL" set /a failed+=1
if "%test5%"=="PASS" set /a passed+=1
if "%test5%"=="FAIL" set /a failed+=1
if "%test5%"=="WARN" set /a warnings+=1
if "%test6%"=="PASS" set /a passed+=1
if "%test6%"=="FAIL" set /a failed+=1
if "%test7%"=="PASS" set /a passed+=1
if "%test7%"=="FAIL" set /a failed+=1
if "%test8%"=="PASS" set /a passed+=1
if "%test8%"=="FAIL" set /a failed+=1

echo Test 1 - mkcert Installation:     %test1%
echo Test 2 - Certificate Files:       %test2%
echo Test 3 - Certificate Validity:    %test3%
echo Test 4 - Network Configuration:   %test4%
echo Test 5 - Port Availability:       %test5%
echo Test 6 - SSL Server Compatibility: %test6%
echo Test 7 - Cross-Platform Scripts:  %test7%
echo Test 8 - Dependencies Check:      %test8%
echo.
echo SUMMARY: %passed%/%total_tests% tests passed, %failed% failed, %warnings% warnings
echo.

if %failed% GTR 0 (
    echo [RESULT] FAILED - Please fix failing tests before proceeding
    echo.
    echo Common fixes:
    if "%test1%"=="FAIL" echo - Install mkcert: choco install mkcert
    if "%test2%"=="FAIL" echo - Run setup-ssl-windows.bat to generate certificates
    if "%test3%"=="FAIL" echo - Regenerate certificates with setup-ssl-windows.bat
    if "%test4%"=="FAIL" echo - Check network configuration and connectivity
    if "%test6%"=="FAIL" echo - Verify sse-server.js exists and is updated
    echo.
) else (
    echo [RESULT] SUCCESS - All tests passed!
    echo.
    echo ==========================================
    echo  READY FOR CROSS-PLATFORM TESTING
    echo ==========================================
    echo.
    echo Your setup is ready for cross-platform SSL testing:
    echo.
    echo 1. START SERVER:
    echo    cd "%PROJECT_DIR%"
    echo    npm run start:sse
    echo.
    echo 2. TEST LOCALLY:
    echo    Browser: https://localhost:3444/health
    echo.
    echo 3. TEST FROM NETWORK:
    if defined LOCAL_IP (
        echo    Browser: https://%LOCAL_IP%:3444/health
        echo.
        echo 4. SET UP OTHER PLATFORMS:
        echo    Mac: bash setup-ssl-mac.sh %LOCAL_IP%
        echo    Android: Follow ANDROID_SETUP.md guide
        echo    Sharing: Run share-certificates.bat for transfer options
    )
    echo.
)

echo ==========================================
pause