# Claude Code Environment Backup & Restoration Guide

## Backup Created: September 10, 2025

**Backup File**: `/projects/claude-code-backup-20250910.tar.gz` (121 MB)

This backup contains your complete Claude Code development environment, including all conversations, configurations, SSH keys, and project data.

## What's Included in the Backup

### Claude Code Configuration
- **Settings**: `/root-home/.claude/settings.json` - Your Claude Code preferences
- **Credentials**: `/root-home/.claude/.credentials.json` - API keys and authentication
- **Projects**: `/root-home/.claude/projects/` - Project configurations and history
- **Conversations**: All conversation history and context
- **Todo Lists**: All your project todo tracking data
- **Shell Snapshots**: Command history and environment state

### Development Environment
- **SSH Keys**: `/root-home/.ssh/` - Your authentication keys for Git and servers
- **VSCode Server**: `/root-home/.vscode-server/` - Complete remote development environment
- **Shell History**: `/root-home/.bash_history` - Your command history
- **Bash Configuration**: `/root-home/.bashrc` - Custom shell settings

### Project Code
- **Complete Repository**: `Human-Adjacent-Coordination/` - All source code, docs, scripts
- **Git History**: Full version control history
- **Dependencies**: `node_modules/` if present
- **Configuration Files**: All project configs, certificates, logs

## Restoring on New DigitalOcean Server

### Method 1: Direct Transfer (Recommended)

**From RunPod to DigitalOcean**:
```bash
# 1. Copy backup file to your local machine
scp -P 17685 root@213.173.105.105:/projects/claude-code-backup-20250910.tar.gz ./

# 2. Upload to new DigitalOcean droplet
scp claude-code-backup-20250910.tar.gz mcp@your-droplet-ip:~/

# 3. On DigitalOcean droplet, extract
cd ~
tar -xzf claude-code-backup-20250910.tar.gz

# 4. Set up directory structure
mkdir -p ~/.claude
cp -r root-home/.claude/* ~/.claude/
cp -r root-home/.ssh/* ~/.ssh/
cp root-home/.bash_history ~/.bash_history
cp root-home/.bashrc ~/.bashrc

# 5. Fix permissions
chmod 700 ~/.ssh
chmod 600 ~/.ssh/*
chmod 600 ~/.claude/.credentials.json
```

### Method 2: Git Repository Transfer

**Push to Git, pull on new server**:
```bash
# On RunPod (if you have Git remote configured)
cd /projects/Human-Adjacent-Coordination
git add -A
git commit -m "Final backup before DigitalOcean migration"
git push origin main

# On DigitalOcean
git clone https://github.com/yourusername/Human-Adjacent-Coordination.git
```

## Claude Code Installation on DigitalOcean

**After restoring your backup**:
```bash
# 1. Install Claude Code CLI
curl -fsSL https://claude.ai/install.sh | sh

# 2. Restore your settings
# (Your .claude directory should already be restored from backup)

# 3. Test authentication
claude auth status

# 4. Open project
cd Human-Adjacent-Coordination
claude code .
```

## Critical Files for Claude Code

### Authentication
- `~/.claude/.credentials.json` - **ESSENTIAL**: Contains your API keys
- `~/.claude/settings.json` - Your preferences and configuration

### Project History  
- `~/.claude/projects/` - Project-specific settings and conversation history
- `~/.claude/todos/` - All your todo lists and task tracking

### Development Environment
- `~/.ssh/` - SSH keys for Git and server access
- `~/.vscode-server/` - Remote development environment

## Verification Steps

**After restoration, verify everything works**:

```bash
# 1. Claude Code authentication
claude auth status

# 2. SSH keys work
ssh -T git@github.com

# 3. Project opens correctly
cd Human-Adjacent-Coordination
claude code .

# 4. Git configuration
git config --list

# 5. Node.js environment
node --version
npm --version
```

## Backup File Locations

**Current Backup**: `/projects/claude-code-backup-20250910.tar.gz`

**Alternative Access Methods**:
1. **Direct Download**: Use your browser to download from RunPod file manager
2. **SCP Transfer**: Copy via SSH to your local machine
3. **Git Commit**: Add to repository if small enough (currently 121MB, might be too large)

## What Persists vs What Needs Recreation

### ✅ Fully Preserved
- All Claude Code conversations and context
- Project code and Git history  
- SSH keys and authentication
- VSCode extensions and settings
- Shell history and customizations

### 🔄 Needs Reconfiguration
- **System packages**: Node.js, nginx, certbot (install fresh)
- **SSL certificates**: Generate new ones for DigitalOcean IP
- **System services**: Create new systemd services
- **Firewall rules**: Configure UFW on DigitalOcean

### 🗑️ No Longer Needed  
- **RunPod-specific configs**: Port mapping workarounds
- **Complex proxy setups**: DigitalOcean uses standard ports
- **Self-signed certificates**: Let's Encrypt will create proper ones

## Migration Checklist

- [ ] Download backup file from RunPod
- [ ] Create DigitalOcean droplet with SSH key
- [ ] Upload and extract backup on new server
- [ ] Install Claude Code CLI
- [ ] Verify authentication works
- [ ] Install system packages (Node.js, nginx)
- [ ] Update DNS to point to new IP
- [ ] Generate Let's Encrypt certificates
- [ ] Test MCP server functionality
- [ ] Verify VSCode Remote connection

## Security Notes

**The backup contains sensitive data**:
- API keys and credentials
- SSH private keys
- Conversation history

**Keep the backup secure**:
- Store in encrypted location
- Don't commit to public repositories
- Delete from temporary locations after restoration
- Consider creating a new backup without sensitive files for archival

---

**Status**: Backup ready for DigitalOcean migration  
**Size**: 121 MB  
**Created**: September 10, 2025  
**Ready for**: Complete environment restoration