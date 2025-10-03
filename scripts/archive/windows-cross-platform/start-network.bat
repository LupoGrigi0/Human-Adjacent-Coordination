@echo off
REM MCP Coordination System - Network Access Startup
REM Created by: claude-code-MCP-ServerSpecialist-2025-08-19-1600

echo.
echo 🌐 Starting MCP Coordination System (Network Access)
echo    📍 Local Access: http://localhost:3000
echo    📍 Network Access: http://192.168.0.171:3000
echo    🔒 Mode: Production (network accessible)
echo.
echo ⚠️  Make sure router port forwarding is configured!
echo    See NETWORK_CONFIGURATION.md for details
echo.

cd /d "%~dp0.."
set HOST=0.0.0.0
set NODE_ENV=production
npm run start:server

pause