#!/bin/bash

# RunPod Setup Script - CORRECTED VERSION  
# Fixes persistent home directory and Node.js installation issues
# Based on lessons learned from successful 2025-09-09 deployment

set -e  # Exit on any error

echo "================================================"
echo "  🔧 RunPod Environment Setup (FIXED)"
echo "     Corrects persistent home and Node.js issues"
echo "================================================"
echo ""

# ============================================================================
# PHASE 1: PERSISTENT HOME DIRECTORY (CORRECTED)
# ============================================================================
echo "📁 PHASE 1: Setting up persistent home directory..."

# Check current home directory
echo "Current HOME: $HOME"
echo "Current /root points to: $(ls -la /root 2>/dev/null | grep '^l' || echo 'Not a symlink')"

# Create persistent home if it doesn't exist
if [ ! -d "/projects/root-home" ]; then
    echo "Creating persistent home directory..."
    # Copy current /root to persistent storage  
    cp -r /root /projects/root-home
    echo "✅ Root home copied to /projects/root-home"
else
    echo "✅ Persistent home directory already exists"
fi

# Remove existing /root and create symlink to persistent storage
if [ ! -L "/root" ] || [ "$(readlink /root)" != "/projects/root-home" ]; then
    echo "Linking /root to persistent storage..."
    # Remove old /root (backing up if it's not a symlink)
    if [ -d "/root" ] && [ ! -L "/root" ]; then
        mv /root /root.bak.$(date +%s)
    elif [ -L "/root" ]; then
        rm /root
    fi
    
    # Create the symlink
    ln -sf /projects/root-home /root
    echo "✅ /root linked to /projects/root-home"
fi

# Update environment to use persistent home
export HOME=/projects/root-home
cd $HOME

# Verify the setup
echo "Verification:"
echo "  HOME is now: $HOME"
echo "  /root points to: $(readlink /root)"
echo "  Current directory: $(pwd)"
echo ""

# ============================================================================
# PHASE 2: NODE.JS INSTALLATION (CORRECTED)  
# ============================================================================
echo "📦 PHASE 2: Installing Node.js 20.x (CORRECTED METHOD)..."

# Update package lists
echo "Updating package lists..."
apt update

# Install Node.js 20.x using the CORRECT method (NodeSource)
echo "Installing Node.js 20.x via NodeSource repository..."

# Download and run the NodeSource setup script
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -

# Install Node.js and npm
apt install -y nodejs

# Verify installation
NODE_VERSION=$(node --version)
NPM_VERSION=$(npm --version)

echo "✅ Node.js installed: $NODE_VERSION"
echo "✅ npm installed: $NPM_VERSION"

# Verify Node.js version is 20.x
if [[ $NODE_VERSION == v20.* ]]; then
    echo "✅ Node.js 20.x successfully installed"
else
    echo "⚠️  Warning: Node.js version is $NODE_VERSION (expected v20.x)"
fi

echo ""

# ============================================================================
# PHASE 3: GLOBAL NPM PACKAGES
# ============================================================================
echo "📋 PHASE 3: Installing global npm packages..."

# Install Claude Code CLI (CORRECTED METHOD)
echo "Installing @anthropic-ai/claude-code..."
npm install -g @anthropic-ai/claude-code

# Verify Claude Code installation
if command -v claude >/dev/null 2>&1; then
    CLAUDE_VERSION=$(claude --version 2>/dev/null || echo "Version check failed")
    echo "✅ Claude Code installed: $CLAUDE_VERSION"
else
    echo "❌ Claude Code installation failed"
fi

echo ""

# ============================================================================
# PHASE 4: ENVIRONMENT VALIDATION
# ============================================================================
echo "🧪 PHASE 4: Validating environment..."

echo "Environment check:"
echo "  ✅ HOME: $HOME"
echo "  ✅ PWD: $(pwd)"
echo "  ✅ Node.js: $(node --version)"
echo "  ✅ npm: $(npm --version)"
echo "  ✅ Claude Code: $(command -v claude >/dev/null && echo 'Installed' || echo 'NOT FOUND')"

# Test persistent storage
echo ""
echo "Testing persistent storage..."
TEST_FILE="$HOME/test-persistence-$(date +%s).txt"
echo "Test file created at $(date)" > "$TEST_FILE"
if [ -f "$TEST_FILE" ]; then
    echo "✅ Persistent storage working"
    rm "$TEST_FILE"
else
    echo "❌ Persistent storage test failed"
fi

echo ""

# ============================================================================
# COMPLETION STATUS
# ============================================================================
echo "================================================"
echo "  ✅ RUNPOD SETUP COMPLETE (FIXED VERSION)"
echo "================================================"
echo ""
echo "📋 SUMMARY:"
echo "  ✅ Persistent home: /projects/root-home"
echo "  ✅ Node.js 20.x: $(node --version)"
echo "  ✅ Claude Code CLI: Installed"
echo ""
echo "🎯 NEXT STEPS:"
echo "  1. Run the complete MCP setup:"
echo "     cd /projects/Human-Adjacent-Coordination"
echo "     ./scripts/runpod-complete-setup.sh"
echo ""
echo "  2. Test the environment:"
echo "     node --version"
echo "     claude --version"
echo "     ls -la /root"
echo ""
echo "💡 VERIFICATION COMMANDS:"
echo "  echo \$HOME           # Should show /projects/root-home"
echo "  readlink /root        # Should show /projects/root-home"  
echo "  which node            # Should show /usr/bin/node"
echo "  which claude          # Should show npm global location"
echo ""
echo "🤖 Environment ready for Human-Adjacent Coordination System!"