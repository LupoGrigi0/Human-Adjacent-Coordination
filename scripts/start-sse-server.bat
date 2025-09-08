@echo off
REM Start SSE-based MCP Server for Official MCP Streamable HTTP Protocol
REM Implements Server-Sent Events with SSL certificates
REM Enhanced for Claude Code & Claude Desktop compatibility

echo Starting SSE MCP Server (Official MCP Streamable HTTP)...
echo.

REM Set development environment variables for SSL compatibility
set NODE_ENV=development
set NODE_TLS_REJECT_UNAUTHORIZED=0
echo 🛠️  Development SSL Configuration:
echo    NODE_ENV=development
echo    NODE_TLS_REJECT_UNAUTHORIZED=0
echo    Ready for Claude Code ^& Claude Desktop connections
echo.

REM Change to project directory
cd /d "%~dp0.."

REM Kill any existing SSE server on port 3444
echo Checking for existing SSE server on port 3444...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3444') do (
    if "%%a" NEQ "" (
        echo Killing existing SSE server process %%a on port 3444
        taskkill /PID %%a /F 2>nul
    )
)

REM Also kill any Node.js processes running sse-server.js
echo Checking for existing sse-server.js processes...
for /f "tokens=2" %%a in ('tasklist /FI "IMAGENAME eq node.exe" /FO TABLE ^| findstr node.exe') do (
    for /f "tokens=*" %%b in ('wmic process where "ProcessId=%%a" get CommandLine /value 2^>nul ^| findstr "sse-server.js"') do (
        echo Killing existing sse-server process %%a
        taskkill /PID %%a /F 2>nul
    )
)

REM Wait for process cleanup
echo Waiting for cleanup...
timeout /t 2 /nobreak >nul

REM Check if SSL certificates exist
echo.
echo 🔐 Checking SSL certificates for Node.js client compatibility...
if not exist "certs\server.key" (
    echo.
    echo ⚠️  SSL certificates not found. They will be generated automatically.
    echo 📁 Certificate location: certs\server.key and certs\server.crt
    echo 🔧 Enhanced certificates with Node.js client support will be created
) else (
    echo ✅ SSL certificates found: certs\server.key and certs\server.crt
    echo 📝 Certificate regeneration available with: del /q certs\*.*
)

REM Ensure uuid dependency is available (required for session management)
echo.
echo Checking dependencies...
if not exist "node_modules\uuid" (
    echo Installing uuid dependency for session management...
    npm install uuid
    if errorlevel 1 (
        echo ❌ Failed to install uuid dependency
        echo Please run: npm install uuid
        pause
        exit /b 1
    )
)

REM Start SSE MCP server
echo.
echo 🌊 Starting SSE-based MCP Server...
echo.
echo 📡 Server Details:
echo    - Protocol: MCP Streamable HTTP with SSE
echo    - Port: 3444 (HTTPS)
echo    - Health: https://localhost:3444/health
echo    - MCP POST: https://localhost:3444/mcp
echo    - SSE Stream: GET https://localhost:3444/mcp
echo    - Web Test UI: https://localhost:3444/ui/sse-test.html
echo.
echo 🔐 SSL Notes:
echo    - Self-signed certificates with Node.js client compatibility
echo    - Development mode disables SSL verification for localhost
echo    - Claude Code ^& Claude Desktop should connect without errors
echo    - Browser may show security warning (click Advanced ^> Proceed)
echo    - Use HTTPS URLs only - HTTP will not work
echo.
echo 🎯 Ready for:
echo    - Claude Code HTTP MCP connections (claude.ai/code)
echo    - Claude Desktop HTTP transport configuration
echo    - Browser-based SSE testing with security bypass
echo    - MCP protocol compliance validation
echo    - Real-time streaming event monitoring
echo.
echo 🔗 Claude Desktop MCP Configuration:
echo    {
echo      "mcpServers": {
echo        "coordination-system": {
echo          "command": "node",
echo          "args": ["./claude-desktop-http-client.js"],
echo          "env": { 
echo            "MCP_SERVER_URL": "https://localhost:3444/mcp",
echo            "NODE_TLS_REJECT_UNAUTHORIZED": "0"
echo          }
echo        }
echo      }
echo    }
echo.
echo 🛑 Press Ctrl+C to stop the server
echo.

node src/sse-server.js

REM Handle server exit
echo.
if errorlevel 1 (
    echo ❌ SSE MCP server failed to start
    echo.
    echo 💡 Troubleshooting SSL Issues:
    echo    1. Check if port 3444 is available
    echo    2. Verify OpenSSL is installed for certificate generation
    echo    3. Ensure all dependencies are installed: npm install
    echo    4. Check logs folder for detailed error information
    echo    5. For Claude Code/Desktop SSL errors:
    echo       - Verify NODE_TLS_REJECT_UNAUTHORIZED=0 is set
    echo       - Regenerate certificates: del /q certs\*.* ^& restart
    echo       - Check certificate extensions include serverAuth
    echo.
    echo 🔧 Alternative configurations:
    echo    Different port: SET SSE_PORT=3444 ^& %~0
    echo    Strict SSL:     SET SSL_STRICT=true ^& %~0
    echo    Production:     SET NODE_ENV=production ^& %~0
    echo.
) else (
    echo ✅ SSE MCP server stopped normally
)

echo.
echo Server session ended
pause