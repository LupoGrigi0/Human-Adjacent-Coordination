#!/bin/bash
#
# RunPod Complete Environment Setup Script
# Sets up persistent home directory, Node.js (18 & 20), SSH, GitHub, VS Code integration
# Author: claude-code-MCP-Nexus-2025-09-08
# Updated with correct Node.js and Claude Code installation steps
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
# Step 1: Set up Persistent Root Home Directory
# ============================================================================
log "📁 Setting up persistent root home directory..."

# Check for persistent volumes - /projects is the standard RunPod mount
PERSISTENT_HOME=""
if [ -d "/projects" ]; then
    PERSISTENT_HOME="/projects/root-home"
    log "Using /projects for persistent storage (RunPod standard)"
elif [ -d "/runpod-volume" ]; then
    PERSISTENT_HOME="/runpod-volume/root-home"
    log "Using /runpod-volume for cross-pod persistence"
elif [ -d "/workspace" ]; then
    PERSISTENT_HOME="/workspace/root-home"
    log "Using /workspace for persistence"
else
    error "No persistent volume found! Please ensure /projects, /runpod-volume, or /workspace is mounted"
fi

# Create persistent home structure
mkdir -p "$PERSISTENT_HOME"
mkdir -p "$PERSISTENT_HOME/.ssh"
mkdir -p "$PERSISTENT_HOME/.claude"
mkdir -p "$PERSISTENT_HOME/projects"
mkdir -p "$PERSISTENT_HOME/.nvm"
mkdir -p "$PERSISTENT_HOME/.local"

# Backup current root data to persistent volume
log "Backing up current root data..."
if [ -d "/root/.ssh" ] && [ "$(ls -A /root/.ssh 2>/dev/null)" ]; then
    cp -a /root/.ssh/* "$PERSISTENT_HOME/.ssh/" 2>/dev/null || true
fi

if [ -d "/root/.claude" ] && [ "$(ls -A /root/.claude 2>/dev/null)" ]; then
    cp -a /root/.claude/* "$PERSISTENT_HOME/.claude/" 2>/dev/null || true
fi

# Copy any other important root files
cp -a /root/.bashrc "$PERSISTENT_HOME/" 2>/dev/null || true
cp -a /root/.profile "$PERSISTENT_HOME/" 2>/dev/null || true

# Update /etc/passwd to change root's home directory
log "Updating root home directory in /etc/passwd..."
sed -i "s|^root:x:0:0:root:/root:|root:x:0:0:root:$PERSISTENT_HOME:|" /etc/passwd

# Verify the change
NEW_HOME=$(getent passwd root | cut -d: -f6)
log "Root home directory updated to: $NEW_HOME"

# Update current session's HOME environment variable
export HOME="$PERSISTENT_HOME"
cd "$HOME"

# Add HOME export to persistent bashrc
echo "export HOME=\"$PERSISTENT_HOME\"" >> "$PERSISTENT_HOME/.bashrc"
echo "cd \"\$HOME\"" >> "$PERSISTENT_HOME/.bashrc"

# Create compatibility symlinks
rm -rf /root/.ssh /root/.claude /root/projects 2>/dev/null || true
ln -sf "$PERSISTENT_HOME/.ssh" /root/.ssh
ln -sf "$PERSISTENT_HOME/.claude" /root/.claude
ln -sf "$PERSISTENT_HOME/projects" /root/projects

# Set proper permissions
chmod 700 "$PERSISTENT_HOME/.ssh"
chmod 600 "$PERSISTENT_HOME/.ssh"/* 2>/dev/null || true

log "✅ Persistent root home directory configured at $PERSISTENT_HOME"

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
    python3-venv

log "✅ System prerequisites installed"

# ============================================================================
# Step 3: Install Node.js and NPM (Corrected Method)
# ============================================================================
log "🟢 Installing Node.js and NPM..."

# Install Node.js and NPM via apt first (provides basic Node.js)
apt-get install -y nodejs npm

# Install NVM (Node Version Manager) for multiple Node.js versions
log "Installing NVM for Node.js version management..."
export NVM_DIR="$PERSISTENT_HOME/.nvm"
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/master/install.sh | bash

# Load NVM into current session
source "$NVM_DIR/nvm.sh"
source "$NVM_DIR/bash_completion"

# Add NVM loading to bashrc
cat >> "$PERSISTENT_HOME/.bashrc" << 'EOF'

# Load NVM
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"
EOF

# Install Node.js 20.17.0 (latest stable for MCP)
log "Installing Node.js 20.17.0..."
nvm install 20.17.0
nvm use 20.17.0
nvm alias default 20.17.0

# Install Node.js 18 for Claude Code compatibility (optional)
log "Installing Node.js 18 for Claude Code compatibility..."
nvm install 18
nvm use 20.17.0  # Switch back to 20 as default

# Update npm to latest
npm install -g npm@latest

# Verify installations
log "Node.js versions installed:"
nvm list
log "Current Node.js: $(node --version)"
log "Current NPM: $(npm --version)"

log "✅ Node.js and NPM installed successfully"

# ============================================================================
# Step 4: Install Claude Code (Corrected Method)
# ============================================================================
log "🤖 Installing Claude Code..."

# Install Claude Code globally via NPM (correct method)
npm install -g @anthropic-ai/claude-code

# Verify installation
claude --version || warn "Claude Code may need additional configuration"

log "✅ Claude Code installed via NPM"

# ============================================================================
# Step 5: Configure SSH for GitHub
# ============================================================================
log "🔑 Configuring SSH for GitHub..."

# Generate SSH key if none exists
if [ ! -f "$PERSISTENT_HOME/.ssh/id_ed25519" ]; then
    log "Generating new SSH key for GitHub..."
    ssh-keygen -t ed25519 -f "$PERSISTENT_HOME/.ssh/id_ed25519" -N "" -C "runpod-$(date +%Y%m%d)"
fi

# Configure SSH for GitHub
cat > "$PERSISTENT_HOME/.ssh/config" << 'EOF'
Host github.com
    HostName github.com
    User git
    IdentityFile ~/.ssh/id_ed25519
    IdentitiesOnly yes
    AddKeysToAgent yes
EOF

chmod 600 "$PERSISTENT_HOME/.ssh/config"

# Display public key for user to add to GitHub
log "🔑 Your SSH public key (add this to GitHub):"
echo "======================================"
cat "$PERSISTENT_HOME/.ssh/id_ed25519.pub"
echo "======================================"

log "✅ SSH configured for GitHub"

# ============================================================================
# Step 6: Install GitHub CLI
# ============================================================================
log "📱 Installing GitHub CLI..."

curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null
apt-get update -y
apt-get install -y gh

log "✅ GitHub CLI installed"

# ============================================================================
# Step 7: Set up VS Code Remote Configuration
# ============================================================================
log "💻 Configuring VS Code Remote access..."

# Ensure SSH server is running
systemctl enable ssh
systemctl start ssh

# Create VS Code settings for projects
mkdir -p "$PERSISTENT_HOME/projects/.vscode"
cat > "$PERSISTENT_HOME/projects/.vscode/settings.json" << 'EOF'
{
    "terminal.integrated.defaultProfile.linux": "bash",
    "terminal.integrated.cwd": "~/projects",
    "files.watcherExclude": {
        "**/node_modules/**": true,
        "**/logs/**": true
    },
    "search.exclude": {
        "**/node_modules": true,
        "**/logs": true
    }
}
EOF

log "✅ VS Code Remote configuration ready"

# ============================================================================
# Step 8: Create MCP Server Startup Scripts
# ============================================================================
log "📂 Setting up MCP server scripts..."

# Create startup script for MCP HTTPS server
cat > "$PERSISTENT_HOME/start-mcp-https.sh" << 'EOF'
#!/bin/bash
# MCP HTTPS Server Startup Script
# Runs on port 3444 with proper external binding

cd ~/projects/Human-Adjacent-Coordination

# Load NVM and use Node.js 20
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm use 20.17.0

# Start MCP server with production settings
NODE_ENV=production \
HOST=0.0.0.0 \
SSE_PORT=3444 \
node src/sse-server.js
EOF

chmod +x "$PERSISTENT_HOME/start-mcp-https.sh"

# Create health check script
cat > "$PERSISTENT_HOME/check-mcp-health.sh" << 'EOF'
#!/bin/bash
echo "🏥 MCP Server Health Check"
echo "=========================="
echo "Local HTTPS: $(curl -k -s https://localhost:3444/health | jq -r '.status' 2>/dev/null || echo 'Not responding')"
echo "External Port: Check https://213.173.105.105:16154/health"
echo "Processes: $(pgrep -f sse-server | wc -l) MCP servers running"
echo "Node.js version: $(node --version 2>/dev/null || echo 'Not found')"
echo "=========================="
EOF

chmod +x "$PERSISTENT_HOME/check-mcp-health.sh"

log "✅ MCP server scripts created"

# ============================================================================
# Step 9: Create Environment Configuration
# ============================================================================
log "⚙️ Creating environment configuration..."

# Create environment setup script
cat > "$PERSISTENT_HOME/setup-environment.sh" << 'EOF'
#!/bin/bash
# Environment setup for each session

# Load NVM
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"

# Use Node.js 20 by default
nvm use 20.17.0 >/dev/null 2>&1 || true

# Set working directory
cd ~/projects

echo "🚀 Environment loaded successfully!"
echo "Available Node.js versions:"
nvm list 2>/dev/null || echo "NVM not loaded"
echo "Current Node.js: $(node --version 2>/dev/null || echo 'Not found')"
echo "Current NPM: $(npm --version 2>/dev/null || echo 'Not found')"
echo "Claude Code: $(claude --version 2>/dev/null || echo 'Not configured')"
echo "GitHub CLI: $(gh --version 2>/dev/null | head -1 || echo 'Not found')"
echo "Working directory: $(pwd)"
EOF

# Update bashrc to automatically load environment
cat >> "$PERSISTENT_HOME/.bashrc" << 'EOF'

# Auto-load environment setup
if [ -f "$HOME/setup-environment.sh" ]; then
    source "$HOME/setup-environment.sh"
fi
EOF

chmod +x "$PERSISTENT_HOME/setup-environment.sh"

log "✅ Environment configuration created"

# ============================================================================
# Step 10: Create Status Check Script
# ============================================================================
log "📊 Creating status check script..."

cat > "$PERSISTENT_HOME/check-status.sh" << 'EOF'
#!/bin/bash
echo "🔍 RunPod Environment Status Check"
echo "=================================="
echo "📁 Persistent Storage:"
if [ -d "/projects" ]; then
    echo "   Projects volume: $(df -h /projects | tail -1)"
fi
if [ -d "/runpod-volume" ]; then
    echo "   Cross-pod volume: $(df -h /runpod-volume | tail -1)"
fi
echo "🏠 Home Directory: $HOME"
echo "🟢 Node.js: $(node --version 2>/dev/null || echo 'Not installed')"
echo "📦 NPM: $(npm --version 2>/dev/null || echo 'Not installed')"
echo "📱 GitHub CLI: $(gh --version 2>/dev/null | head -1 || echo 'Not installed')"
echo "🤖 Claude Code: $(claude --version 2>/dev/null || echo 'Not configured')"
echo "🔑 SSH Key: $([ -f $HOME/.ssh/id_ed25519.pub ] && echo 'Present' || echo 'Missing')"
echo "📂 Projects: $(ls -la $HOME/projects 2>/dev/null | wc -l) items"
echo "🌐 Network Ports: $(ss -tlnp 2>/dev/null | grep -E ':(3444|3000|8000|8080|80)' | wc -l) services listening"
echo "🎯 MCP Server: $(pgrep -f sse-server >/dev/null && echo 'Running' || echo 'Stopped')"
echo "=================================="
EOF

chmod +x "$PERSISTENT_HOME/check-status.sh"

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
echo "   cd ~/projects"
echo "   git clone git@github.com:lupo/Human-Adjacent-Coordination.git"
echo ""
echo "4. 🏃 START THE MCP SERVER:"
echo "   ~/start-mcp-https.sh"
echo ""
echo "5. ✅ CHECK ENVIRONMENT STATUS:"
echo "   ~/check-status.sh"
echo ""
echo "6. 🏥 CHECK MCP HEALTH:"
echo "   ~/check-mcp-health.sh"
echo ""
echo "=================================================================================="
echo "📁 PERSISTENT STORAGE LOCATIONS:"
echo "   - Home Directory: $PERSISTENT_HOME"
echo "   - Projects: ~/projects/ -> $PERSISTENT_HOME/projects/"
echo "   - SSH Keys: ~/.ssh/ -> $PERSISTENT_HOME/.ssh/"
echo "   - Claude Sessions: ~/.claude/ -> $PERSISTENT_HOME/.claude/"
echo ""
echo "🔧 UTILITY SCRIPTS (in your home directory):"
echo "   - Environment: source ~/setup-environment.sh"
echo "   - MCP HTTPS Server: ~/start-mcp-https.sh"
echo "   - Status Check: ~/check-status.sh"
echo "   - MCP Health: ~/check-mcp-health.sh"
echo ""
echo "🌐 EXTERNAL ACCESS:"
echo "   - HTTPS MCP Server: https://213.173.105.105:16154/health"
echo "   - SSH Access: ssh root@213.173.105.105 -p 16153"
echo ""
echo "=================================================================================="
echo "🎓 CORRECTED INSTALLATION METHODS USED:"
echo "   - Node.js: apt install nodejs npm + NVM for version management"
echo "   - Claude Code: npm install -g @anthropic-ai/claude-code"
echo "   - Persistent storage: /projects (RunPod standard)"
echo ""
echo "=================================================================================="
echo -e "${NC}"

# Load the environment for this session
source "$PERSISTENT_HOME/setup-environment.sh"

log "🎊 All done! Your RunPod environment is ready for MCP development!"
log "Root home directory is now: $HOME"
log "Start a new shell with: exec bash"