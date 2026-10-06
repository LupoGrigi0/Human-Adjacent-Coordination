# RunPod Setup Guide for MCP Coordination System
*Complete documentation for setting up the Human-Adjacent Coordination system on RunPod*

## 📋 Overview
This guide provides step-by-step instructions for setting up the Human-Adjacent Coordination system on a new RunPod instance with persistent storage and proper port configuration.

## ✅ Corrected Installation Methods

Based on real-world testing, these are the **verified working methods**:

### **Node.js Installation (Corrected)**
```bash
# Step 1: Install basic Node.js and NPM via apt
apt update
apt install nodejs npm

# Step 2: Install NVM for version management
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/master/install.sh | bash

# Step 3: Reload bashrc to enable NVM
source ~/.bashrc

# Step 4: Install Node.js 20.17.0 (latest stable for MCP)
nvm install 20.17.0
nvm use 20.17.0
```

### **Claude Code Installation (Corrected)**
```bash
# Install Claude Code globally via NPM (not pipx)
npm install -g @anthropic-ai/claude-code
```

### **Persistent Storage (Corrected)**
- **Primary Mount Point**: `/projects` (RunPod standard)
- **Alternative**: `/runpod-volume` (cross-pod persistence)
- **Root Home Directory**: Moved to persistent volume

## 🚀 RunPod Configuration Requirements

### **1. Pod Setup**
- **Template**: Any Linux template with Docker support
- **GPU**: Not required for MCP server
- **Storage**: Persistent volume mounted at `/projects`

### **2. Network Ports (Direct TCP)**
- **Port 3444**: HTTPS MCP Server (maps to external port)
- **Port 22**: SSH access
- **Port 3000**: HTTP fallback (optional)

### **3. External Access Ports**
Based on RunPod configuration:
- SSH: `ssh root@213.173.105.105 -p 16153`
- MCP HTTPS: `https://213.173.105.105:16154/health`

## 📜 Automated Setup Script

### **Quick Installation**
```bash
# Clone the repository
git clone https://github.com/lupo/Human-Adjacent-Coordination.git
cd Human-Adjacent-Coordination

# Run the automation script
chmod +x scripts/runpod-setup-automation.sh
./scripts/runpod-setup-automation.sh
```

### **What the Script Does**
1. **Sets up persistent root home directory** on `/projects/root-home`
2. **Installs Node.js** via apt + NVM for version management
3. **Installs Claude Code** via NPM globally
4. **Configures SSH** for GitHub authentication
5. **Creates MCP startup scripts** for HTTPS server
6. **Sets up environment management** utilities

## 📂 File Structure After Setup

```
/projects/root-home/          # Persistent root home directory
├── .ssh/                     # SSH keys and configuration
├── .claude/                  # Claude Code sessions
├── .nvm/                     # Node Version Manager
├── projects/                 # Development projects
├── start-mcp-https.sh        # MCP server startup script
├── check-status.sh           # Environment status checker
└── setup-environment.sh     # Environment loader
```

## 🎯 Post-Setup Steps

### **1. GitHub Authentication**
```bash
# Add SSH key to GitHub
cat ~/.ssh/id_ed25519.pub
# Copy and add to GitHub.com > Settings > SSH and GPG keys

# Authenticate GitHub CLI
gh auth login
```

### **2. Clone MCP Project**
```bash
cd ~/projects
git clone git@github.com:lupo/Human-Adjacent-Coordination.git
```

### **3. Start MCP Server**
```bash
# Start HTTPS MCP server on port 3444
~/start-mcp-https.sh
```

### **4. Test External Access**
```bash
# Health check (replace port with your external port)
curl -k https://213.173.105.105:16154/health
```

## 🔧 Utility Scripts

### **Environment Management**
```bash
# Load environment (automatically done via bashrc)
source ~/setup-environment.sh

# Check system status
~/check-status.sh

# Check MCP server health
~/check-mcp-health.sh
```

### **MCP Server Management**
```bash
# Start MCP HTTPS server
~/start-mcp-https.sh

# Check if server is running
pgrep -f sse-server

# View server logs
cd ~/projects/Human-Adjacent-Coordination
tail -f logs/sse-server.log
```

## 🐛 Common Issues & Solutions

### **Node.js Version Issues**
```bash
# If Node.js version is wrong
nvm use 20.17.0
nvm alias default 20.17.0

# Verify version
node --version  # Should show v20.17.0
```

### **Claude Code Command Not Found**
```bash
# Reinstall Claude Code
npm install -g @anthropic-ai/claude-code

# Check installation
claude --version
```

### **MCP Server Not Accessible Externally**
```bash
# Check if bound to all interfaces
ss -tlnp | grep 3444
# Should show 0.0.0.0:3444, not 127.0.0.1:3444

# Restart with correct binding
HOST=0.0.0.0 SSE_PORT=3444 node src/sse-server.js
```

### **SSH Key Issues**
```bash
# Generate new SSH key if needed
ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519 -N ""

# Test GitHub connection
ssh -T git@github.com
```

## 🌐 External Domain Configuration (SmoothCurves.nexus)

### **DNS Setup**
1. **Point domain to RunPod IP**: `213.173.105.105`
2. **Use external port**: Configure for port `16154` (maps to internal 3444)
3. **SSL certificates**: Let's Encrypt for production domain

### **Production Deployment**
```bash
# Install certbot for Let's Encrypt
apt install certbot

# Generate certificate for domain
certbot certonly --standalone -d SmoothCurves.nexus

# Update MCP server to use domain certificate
# (Modify src/sse-server.js SSL certificate paths)
```

## 📊 Performance & Monitoring

### **Resource Requirements**
- **RAM**: 2GB minimum, 4GB recommended
- **CPU**: 2 cores minimum for concurrent AI instances
- **Storage**: 50GB minimum for persistent volume
- **Network**: Stable internet for AI coordination

### **Monitoring Commands**
```bash
# System resources
htop

# Network connections
ss -tulnp

# MCP server processes
ps aux | grep sse-server

# Storage usage
df -h /projects
```

## 🎉 Success Criteria

Your setup is complete when:
- ✅ **External health check responds**: `https://213.173.105.105:16154/health`
- ✅ **Claude Code installed**: `claude --version`
- ✅ **Node.js 20.17.0 active**: `node --version`
- ✅ **GitHub authentication works**: `gh auth status`
- ✅ **MCP server runs**: Server logs show successful startup
- ✅ **Persistent storage works**: Files survive pod restarts

---

*This guide reflects lessons learned from actual RunPod deployments and corrects earlier documentation errors.*

**Key Corrections Made:**
- Node.js installation via `apt` + NVM (not direct source installation)
- Claude Code via `npm` global install (not pipx)
- Persistent storage at `/projects` (RunPod standard mount point)
- External port mapping understanding (16154 → 3444)

*Generated by claude-code-MCP-Nexus-2025-09-08*