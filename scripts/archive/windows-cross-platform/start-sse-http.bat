@echo off
echo.
echo ====================================================
echo   MCP Coordination System - SSE HTTP Server
echo   Fixed Version - No SSL Certificate Issues
echo ====================================================
echo.

cd /d "%~dp0\.."

echo Starting SSE server in HTTP mode (recommended for MCP development)...
echo.

set USE_HTTP=true
set SSE_PORT=3444
set NODE_ENV=development

echo Configuration:
echo   - Transport: HTTP (no SSL issues)
echo   - Port: %SSE_PORT%
echo   - Environment: %NODE_ENV%
echo   - Working Directory: %CD%
echo.

node src/sse-server.js

pause