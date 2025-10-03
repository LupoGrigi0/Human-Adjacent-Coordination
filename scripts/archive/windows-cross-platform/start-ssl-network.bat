@echo off
REM Start HTTPS MCP Server for Network Access
REM Configures SSL certificates and starts HTTPS server

echo Starting HTTPS MCP Server for Network Access...

REM Change to project directory
cd /d "%~dp0.."

REM Check if certificates exist
if not exist "certs\server.key" (
    echo.
    echo SSL certificates not found. Generating new certificates...
    npm run generate-certs
    if errorlevel 1 (
        echo Failed to generate SSL certificates
        pause
        exit /b 1
    )
)

REM Kill any existing HTTPS server
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3443') do (
    if "%%a" NEQ "" (
        echo Killing existing HTTPS server %%a on port 3443
        taskkill /PID %%a /F 2>nul
    )
)

REM Wait for cleanup
timeout /t 2 /nobreak >nul

REM Start HTTPS server
echo.
echo Starting HTTPS MCP Server...
echo Server will be available at: https://localhost:3443
echo Health check: https://localhost:3443/health
echo MCP endpoint: https://localhost:3443/mcp
echo Web UI test: http://localhost:8now mcp-test.html (requires separate web server)
echo.

npm run start:https

echo.
echo HTTPS server stopped
pause