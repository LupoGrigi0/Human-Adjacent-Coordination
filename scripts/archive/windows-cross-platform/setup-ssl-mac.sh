#!/bin/bash

# Cross-Platform mkcert Certificate Setup for Mac Client
# Author: claude-code-Certificate-Specialist-2025-09-03
#
# This script installs the Windows server's mkcert CA certificate on Mac
# Enables secure HTTPS connections to Windows MCP server

set -e

echo
echo "=========================================="
echo " MCP Cross-Platform Certificate Setup"
echo " Mac Client (mkcert CA Installation)"
echo "=========================================="
echo

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
CERTS_DIR="$PROJECT_DIR/certs"

echo "[INFO] Script Directory: $SCRIPT_DIR"
echo "[INFO] Project Directory: $PROJECT_DIR" 
echo "[INFO] Certificates Directory: $CERTS_DIR"
echo

# Parse command line arguments
WINDOWS_SERVER_IP=""
if [ $# -gt 0 ]; then
    WINDOWS_SERVER_IP="$1"
    echo "[INFO] Windows Server IP: $WINDOWS_SERVER_IP"
else
    echo "[WARN] No Windows server IP provided"
    echo "[INFO] Usage: $0 [WINDOWS_SERVER_IP]"
    echo "[INFO] Example: $0 192.168.0.171"
    echo
    read -p "Enter Windows server IP address: " WINDOWS_SERVER_IP
fi

if [ -z "$WINDOWS_SERVER_IP" ]; then
    echo "[ERROR] Windows server IP is required"
    exit 1
fi

echo "[INFO] Target Windows Server: $WINDOWS_SERVER_IP"
echo

# Check if Homebrew is installed
echo "[INFO] Checking if Homebrew is installed..."
if ! command -v brew &> /dev/null; then
    echo "[ERROR] Homebrew not found. Please install Homebrew first:"
    echo "        /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
    echo
    exit 1
else
    echo "[INFO] Homebrew found: $(brew --version | head -1)"
fi
echo

# Check if mkcert is installed
echo "[INFO] Checking if mkcert is installed..."
if ! command -v mkcert &> /dev/null; then
    echo "[INFO] Installing mkcert via Homebrew..."
    brew install mkcert
    if [ $? -ne 0 ]; then
        echo "[ERROR] Failed to install mkcert"
        exit 1
    fi
    echo "[INFO] mkcert installed successfully!"
else
    echo "[INFO] mkcert is already installed: $(mkcert -version)"
fi
echo

# Check if CA certificate exists
CA_CERT_FILE="$CERTS_DIR/mkcert-ca-cert.pem"
if [ ! -f "$CA_CERT_FILE" ]; then
    echo "[ERROR] CA certificate not found: $CA_CERT_FILE"
    echo
    echo "Please ensure you have:"
    echo "1. Run setup-ssl-windows.bat on the Windows server"
    echo "2. Copied the generated mkcert-ca-cert.pem file to this Mac"
    echo "3. Placed it in: $CERTS_DIR/"
    echo
    echo "Alternative: Copy CA certificate from Windows server:"
    echo "  scp user@$WINDOWS_SERVER_IP:path/to/mcp-coordination-system/certs/mkcert-ca-cert.pem \"$CA_CERT_FILE\""
    echo
    exit 1
fi

echo "[INFO] Found CA certificate: $CA_CERT_FILE"

# Display CA certificate info
echo "[INFO] CA Certificate Details:"
openssl x509 -in "$CA_CERT_FILE" -noout -subject -issuer -dates 2>/dev/null || {
    echo "[WARN] Could not read certificate details (OpenSSL not available or certificate format issue)"
}
echo

# Install the CA certificate using mkcert
echo "[INFO] Installing CA certificate with mkcert..."
CAROOT_DIR="$(mkcert -CAROOT)"
echo "[INFO] mkcert CA Root Directory: $CAROOT_DIR"

# Create CAROOT directory if it doesn't exist
if [ ! -d "$CAROOT_DIR" ]; then
    echo "[INFO] Creating mkcert CA root directory..."
    mkdir -p "$CAROOT_DIR"
fi

# Copy the Windows CA certificate to the Mac's mkcert directory
echo "[INFO] Copying CA certificate to mkcert directory..."
cp "$CA_CERT_FILE" "$CAROOT_DIR/rootCA.pem"

# Also copy the key if available (usually not needed for client trust)
CA_KEY_FILE="$CERTS_DIR/mkcert-ca-key.pem"
if [ -f "$CA_KEY_FILE" ]; then
    echo "[INFO] Copying CA private key..."
    cp "$CA_KEY_FILE" "$CAROOT_DIR/rootCA-key.pem"
fi

# Install the CA certificate in the system trust store
echo "[INFO] Installing CA certificate in system trust store..."
mkcert -install
if [ $? -ne 0 ]; then
    echo "[ERROR] Failed to install CA certificate"
    exit 1
fi

echo "[SUCCESS] CA certificate installed successfully!"
echo

# Test connection to Windows server
echo "[INFO] Testing HTTPS connection to Windows server..."
SERVER_URL="https://$WINDOWS_SERVER_IP:3444/health"

echo "[INFO] Testing connection to: $SERVER_URL"
if command -v curl &> /dev/null; then
    echo "[INFO] Using curl to test connection..."
    
    # First test with certificate verification
    echo "[TEST] Testing with certificate verification..."
    if curl -f -s -m 10 "$SERVER_URL" > /dev/null; then
        echo "[SUCCESS] HTTPS connection successful with certificate verification!"
        
        # Get server response
        echo "[INFO] Server response:"
        curl -s -m 10 "$SERVER_URL" | jq . 2>/dev/null || curl -s -m 10 "$SERVER_URL"
    else
        echo "[WARN] HTTPS connection failed with certificate verification"
        echo "[INFO] This might be normal if the Windows server isn't running"
        
        # Test basic connectivity
        echo "[TEST] Testing basic connectivity to $WINDOWS_SERVER_IP:3444..."
        if nc -z -w5 "$WINDOWS_SERVER_IP" 3444 2>/dev/null; then
            echo "[INFO] Port 3444 is open, but HTTPS handshake failed"
            echo "[INFO] The Windows server might not be using the mkcert certificates yet"
        else
            echo "[INFO] Cannot connect to $WINDOWS_SERVER_IP:3444"
            echo "[INFO] Ensure the Windows MCP server is running"
        fi
    fi
else
    echo "[WARN] curl not available for testing"
    echo "[INFO] You can test manually with: curl $SERVER_URL"
fi
echo

# Verification and instructions
echo "=========================================="
echo " MAC CLIENT SETUP COMPLETE"
echo "=========================================="
echo
echo "[SUCCESS] mkcert CA certificate installed on Mac!"
echo
echo "Certificate Details:"
echo "- CA Root Directory: $CAROOT_DIR"
echo "- Windows Server IP: $WINDOWS_SERVER_IP"
echo "- MCP Server URL: https://$WINDOWS_SERVER_IP:3444"
echo
echo "Next Steps:"
echo "1. Ensure Windows MCP server is running with HTTPS"
echo "2. Test connection: curl https://$WINDOWS_SERVER_IP:3444/health"
echo "3. Use in MCP client configuration:"
echo "   {\"command\": \"node\", \"args\": [\"claude-desktop-http-client.js\"], \"transport\": {\"type\": \"stdio\"}, \"env\": {\"MCP_SERVER_URL\": \"https://$WINDOWS_SERVER_IP:3444\"}}"
echo
echo "Troubleshooting:"
echo "- If connection fails, verify Windows firewall allows port 3444"
echo "- Check Windows server is using mkcert certificates"
echo "- Verify network connectivity between Mac and Windows"
echo
echo "=========================================="
echo

# Optional: Create a test script for easy validation
TEST_SCRIPT="$SCRIPT_DIR/test-windows-connection.sh"
echo "[INFO] Creating connection test script: $TEST_SCRIPT"
cat > "$TEST_SCRIPT" << EOF
#!/bin/bash
# Test connection to Windows MCP server
# Generated by setup-ssl-mac.sh

WINDOWS_SERVER_IP="$WINDOWS_SERVER_IP"
SERVER_URL="https://\$WINDOWS_SERVER_IP:3444"

echo "Testing connection to Windows MCP Server..."
echo "URL: \$SERVER_URL/health"
echo

if curl -f -s -m 10 "\$SERVER_URL/health" > /dev/null; then
    echo "[SUCCESS] Connection successful!"
    echo "Server response:"
    curl -s -m 10 "\$SERVER_URL/health" | jq . 2>/dev/null || curl -s -m 10 "\$SERVER_URL/health"
else
    echo "[FAILED] Connection failed"
    echo "Check that:"
    echo "1. Windows MCP server is running"
    echo "2. Port 3444 is accessible"
    echo "3. Firewall allows connections"
fi
EOF

chmod +x "$TEST_SCRIPT"
echo "[INFO] Test script created: $TEST_SCRIPT"
echo "[INFO] Run it with: bash $TEST_SCRIPT"
echo

echo "[SUCCESS] Mac mkcert setup complete!"
echo "Ready to connect to Windows MCP server at https://$WINDOWS_SERVER_IP:3444"