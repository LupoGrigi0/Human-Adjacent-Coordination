@echo off
REM MCP Inspector Launcher with Fresh Token
REM Kills any existing inspector and starts fresh

echo Starting MCP Inspector with fresh token...

REM Kill any existing Node processes on port 6277
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :6277') do (
    if "%%a" NEQ "" (
        echo Killing existing process %%a on port 6277
        taskkill /PID %%a /F 2>nul
    )
)

REM Wait a moment for cleanup
timeout /t 2 /nobreak >nul

REM Start fresh MCP inspector
echo.
echo Starting fresh MCP inspector...
cd /d "%~dp0.."
npx @modelcontextprotocol/inspector node src/mcp-server.js

echo.
echo MCP Inspector should be running at http://localhost:6277
echo Use the session token displayed above to authenticate
pause