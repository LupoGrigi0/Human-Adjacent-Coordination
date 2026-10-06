@echo off
REM MCP Coordination System - Local Development Startup
REM Created by: claude-code-MCP-ServerSpecialist-2025-08-19-1600

echo.
echo 🚀 Starting MCP Coordination System (Local Development)
echo    📍 Access: http://localhost:3000
echo    🔒 Mode: Development (localhost only)
echo.

cd /d "%~dp0.."
npm run start:server

pause