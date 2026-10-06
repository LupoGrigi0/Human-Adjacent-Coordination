@echo off
REM MCP Coordination System - Server Testing Script
REM Created by: claude-code-MCP-ServerSpecialist-2025-08-19-1600

echo.
echo 🧪 Testing MCP Coordination System Server
echo.

echo 📡 Testing Health Endpoint...
curl -s http://localhost:3000/health
echo.
echo.

echo 📚 Testing API Overview...
curl -s http://localhost:3000/
echo.
echo.

echo 🚀 Testing Bootstrap Function...
curl -s -X POST http://localhost:3000/api/mcp/bootstrap -H "Content-Type: application/json" -d "{\"role\":\"COO\",\"instanceId\":\"test-instance\"}"
echo.
echo.

echo ✅ Server testing complete!
echo    If you see JSON responses above, the server is working correctly.
echo.

pause