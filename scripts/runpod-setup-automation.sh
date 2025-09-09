#!/bin/bash
#
# RunPod Complete Environment Setup Script
# Sets up persistent home directory, Node.js (both 18 & 20), SSH, GitHub, VS Code integration
# Author: claude-code-MCP-Nexus-2025-09-08
#

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[WARNING] $1${NC}"
}

error() {
    echo -e "${RED}[ERROR] $1${NC}"
    exit 1
}

log "🚀 Starting RunPod Complete Environment Setup"

# ============================================================================
# Step 1: Set up Persistent Home Directory on Volume
# ============================================================================
log "📁 Setting up persistent home directory..."

# Check if volume is mounted
if [ ! -d "/workspace" ]; then
    error "No persistent volume found at /workspace. Please attach a RunPod volume first!"
fi

# Create persistent home structure
mkdir -p /workspace/persistent-home
mkdir -p /workspace/persistent-home/.ssh
mkdir -p /workspace/persistent-home/.claude
mkdir -p /workspace/persistent-home/projects

# Backup current home if it exists
if [ -d "/root/.ssh" ]; then
    log "Backing up existing SSH keys..."
    cp -r /root/.ssh/* /workspace/persistent-home/.ssh/ 2>/dev/null || true
fi

if [ -d "/root/.claude" ]; then
    log "Backing up existing Claude Code sessions..."
    cp -r /root/.claude/* /workspace/persistent-home/.claude/ 2>/dev/null || true
fi

# Create symlinks for persistent home
rm -rf /root/.ssh /root/.claude /root/projects 2>/dev/null || true
ln -sf /workspace/persistent-home/.ssh /root/.ssh
ln -sf /workspace/persistent-home/.claude /root/.claude
ln -sf /workspace/persistent-home/projects /root/projects

# Set proper permissions
chmod 700 /root/.ssh
chmod 600 /root/.ssh/* 2>/dev/null || true

log "✅ Persistent home directory configured"

# ============================================================================
# Step 2: Update System & Install Prerequisites
# ============================================================================
log "📦 Updating system and installing prerequisites..."

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y \
    curl \
    wget \
    gnupg \
    lsb-release \
    software-properties-common \
    apt-transport-https \
    ca-certificates \
    build-essential \
    git \
    unzip \
    jq \
    tree \
    htop \
    python3 \
    python3-pip \
    python3-venv \
    pipx

log "✅ System prerequisites installed"

# ============================================================================
# Step 3: Install Multiple Node.js Versions (18 & 20)
# ============================================================================
log "🟢 Installing Node.js versions 18 and 20..."

# Install NVM for version management
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
export NVM_DIR="/root/.nvm"
source "$NVM_DIR/nvm.sh"
source "$NVM_DIR/bash_completion"

# Install Node.js 18 (for Claude Code)
nvm install 18
nvm use 18
npm install -g npm@latest

# Install Node.js 20 (for MCP)
nvm install 20
nvm use 20
npm install -g npm@latest

# Set Node 20 as default
nvm alias default 20

# Also install system-wide Node 20 for production
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Verify installations
log "Node.js versions installed:"
nvm list
/usr/bin/node --version
npm --version

log "✅ Node.js 18 & 20 installed successfully"

# ============================================================================
# Step 4: Configure SSH for GitHub
# ============================================================================
log "🔑 Configuring SSH for GitHub..."

# Generate SSH key if none exists
if [ ! -f "/root/.ssh/id_ed25519" ]; then
    log "Generating new SSH key for GitHub..."
    ssh-keygen -t ed25519 -f /root/.ssh/id_ed25519 -N "" -C "runpod-$(date +%Y%m%d)"
fi

# Configure SSH for GitHub
cat > /root/.ssh/config << 'EOF'
Host github.com
    HostName github.com
    User git
    IdentityFile ~/.ssh/id_ed25519
    IdentitiesOnly yes
    AddKeysToAgent yes
EOF

chmod 600 /root/.ssh/config

# Display public key for user to add to GitHub
log "🔑 Your SSH public key (add this to GitHub):"
echo "======================================"
cat /root/.ssh/id_ed25519.pub
echo "======================================"

log "✅ SSH configured for GitHub"

# ============================================================================
# Step 5: Install GitHub CLI
# ============================================================================
log "📱 Installing GitHub CLI..."

curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null
apt-get update -y
apt-get install -y gh

log "✅ GitHub CLI installed"

# ============================================================================
# Step 6: Install Claude Code (pipx method)
# ============================================================================
log "🤖 Installing Claude Code..."

# Install Claude Code via pipx
pipx install claude-code

# Add pipx to PATH
echo 'export PATH="/root/.local/bin:$PATH"' >> /root/.bashrc

# Verify installation
/root/.local/bin/claude --version || warn "Claude Code may need manual configuration"

log "✅ Claude Code installed"

# ============================================================================
# Step 7: Set up VS Code Remote Configuration
# ============================================================================
log "💻 Configuring VS Code Remote access..."

# Ensure SSH server is running
systemctl enable ssh
systemctl start ssh

# Create VS Code settings for the workspace
mkdir -p /workspace/.vscode
cat > /workspace/.vscode/settings.json << 'EOF'
{
    "terminal.integrated.defaultProfile.linux": "bash",
    "terminal.integrated.cwd": "/workspace",
    "files.watcherExclude": {
        "**/node_modules/**": true
    },
    "search.exclude": {
        "**/node_modules": true,
        "**/logs": true
    }
}
EOF

log "✅ VS Code Remote configuration ready"

# ============================================================================
# Step 8: Clone MCP Project and Set Up
# ============================================================================
log "📂 Setting up MCP project..."

cd /root/projects

# Clone the MCP project (you'll need to authenticate first)
log "Note: You'll need to run 'gh auth login' to authenticate GitHub CLI"

# Create startup script for MCP server
cat > /workspace/start-mcp-https.sh << 'EOF'
#!/bin/bash
cd /workspace/persistent-home/projects/Human-Adjacent-Coordination
PATH="/usr/bin:$PATH" NODE_ENV=production HOST=0.0.0.0 SSE_PORT=3444 /usr/bin/node src/sse-server.js
EOF

chmod +x /workspace/start-mcp-https.sh

log "✅ MCP project setup ready"

# ============================================================================
# Step 9: Create Environment Configuration
# ============================================================================
log "⚙️ Creating environment configuration..."

# Create environment setup script
cat > /workspace/setup-environment.sh << 'EOF'
#!/bin/bash
# Environment setup for each session

# Load NVM
export NVM_DIR="/root/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"

# Add pipx to PATH
export PATH="/root/.local/bin:$PATH"

# Set working directory
cd /root/projects

echo "Environment loaded successfully!"
echo "Node.js versions available:"
nvm list
echo "Current Node.js: $(node --version)"
echo "Claude Code: $(/root/.local/bin/claude --version)"
echo "GitHub CLI: $(gh --version | head -1)"
EOF

# Add to bashrc for automatic loading
echo "source /workspace/setup-environment.sh" >> /root/.bashrc

chmod +x /workspace/setup-environment.sh

log "✅ Environment configuration created"

# ============================================================================
# Step 10: Create Status Check Script
# ============================================================================
log "📊 Creating status check script..."

cat > /workspace/check-status.sh << 'EOF'
#!/bin/bash
echo "🔍 RunPod Environment Status Check"
echo "=================================="
echo "📁 Persistent Storage: $(df -h /workspace | tail -1)"
echo "🟢 Node.js System: $(/usr/bin/node --version)"
echo "📱 GitHub CLI: $(gh --version | head -1)"
echo "🤖 Claude Code: $(/root/.local/bin/claude --version 2>/dev/null || echo 'Not configured')"
echo "🔑 SSH Key: $([ -f /root/.ssh/id_ed25519.pub ] && echo 'Present' || echo 'Missing')"
echo "📂 Projects: $(ls -la /root/projects 2>/dev/null | wc -l) items"
echo "🌐 Network Ports: $(ss -tlnp | grep -E ':(3444|3000|8000|8080|80)' | wc -l) services listening"
echo "=================================="
EOF

chmod +x /workspace/check-status.sh

log "✅ Status check script created"

# ============================================================================
# Final Steps and Instructions
# ============================================================================
log "🎉 Setup Complete! Next Steps:"

echo -e "${BLUE}"
echo "=================================================================================="
echo "🚀 RUNPOD ENVIRONMENT SETUP COMPLETE!"
echo "=================================================================================="
echo ""
echo "📋 NEXT STEPS TO COMPLETE SETUP:"
echo ""
echo "1. 🔑 ADD SSH KEY TO GITHUB:"
echo "   - Copy the SSH public key displayed above"
echo "   - Go to GitHub.com > Settings > SSH and GPG keys > New SSH key"
echo "   - Paste the key and save"
echo ""
echo "2. 🔐 AUTHENTICATE GITHUB CLI:"
echo "   gh auth login"
echo ""
echo "3. 📂 CLONE YOUR MCP PROJECT:"
echo "   cd /root/projects"
echo "   git clone git@github.com:lupo/Human-Adjacent-Coordination.git"
echo ""
echo "4. 🏃 START THE MCP SERVER:"
echo "   /workspace/start-mcp-https.sh"
echo ""
echo "5. ✅ CHECK ENVIRONMENT STATUS:"
echo "   /workspace/check-status.sh"
echo ""
echo "=================================================================================="
echo "📁 PERSISTENT STORAGE LOCATIONS:"
echo "   - Home Directory: /workspace/persistent-home/"
echo "   - Projects: /root/projects/ -> /workspace/persistent-home/projects/"
echo "   - SSH Keys: /root/.ssh/ -> /workspace/persistent-home/.ssh/"
echo "   - Claude Sessions: /root/.claude/ -> /workspace/persistent-home/.claude/"
echo ""
echo "🔧 UTILITY SCRIPTS:"
echo "   - Environment: source /workspace/setup-environment.sh"
echo "   - MCP HTTPS Server: /workspace/start-mcp-https.sh"
echo "   - Status Check: /workspace/check-status.sh"
echo ""
echo "🌐 PORT CONFIGURATION FOR RUNPOD:"
echo "   - TCP Port 3444 (HTTPS MCP Server)"
echo "   - TCP Port 22 (SSH)"
echo "   - Optional: TCP Ports 80, 8000, 8080 (HTTP)"
echo ""
echo "=================================================================================="
echo -e "${NC}"

# Load the environment for this session
source /workspace/setup-environment.sh

log "🎊 All done! Your RunPod environment is ready for MCP development!"