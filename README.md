# Human-Adjacent-Coordination
This is an MCP designed to allow multiple distributed AI instances to work together, in teams in parallel, 
cross platform, on multipule projects. 

Goals: 
Allow multipule distributed instances of AI's to communicate and co-ordinate, cross platform. 
0 knowledge bootstrapping. Instance does not have to know anything before attaching to the MCP, bootstrapping protocol guides each instance. 
Allow the creation, preservation, and automatic use of institutional knowledge at the project, role, and institution level. 
Multipule Role types defined, PA(personal assistant) COO, PM(Project Manager)/Project architect, specialist, Executive,
Task management system that allows multipule instances to work a task list for a project concurrently
"Evolution Engine" that allows lessons learned to change how the MCP works, for all roles, projects, 
Messaging system allows HumanAdjacent and Humans to use the same communication system and participate at any level

## 🚀 Production Access (DigitalOcean)

**Production MCP Server:** https://smoothcurves.nexus/mcp
**OpenAPI Specification:** https://smoothcurves.nexus/mcp/openapi.json
**Executive Dashboard:** https://smoothcurves.nexus/web-ui/executive-dashboard.html

**Connect via Claude Code:**
```bash
claude mcp add smoothcurves.nexus --transport http --url https://smoothcurves.nexus
```

**Read the guides:**
- **Don't panic guide:** `docs/DONT_PANIC_START_HERE.md`
- **Session handoff guide:** `docs/SESSION_HANDOFF_2025_09_09.md`
- **Intelligent archival guide:** `docs/INTELLIGENT_ARCHIVAL_GUIDE.md`

## 🏗️ Development Workflow

**⚠️ IMPORTANT: This repository is the DEVELOPMENT environment.**

### **Environment Structure:**
```
/mnt/coordinaton_mcp_data/
├── Human-Adjacent-Coordination/     # 🛠️ DEVELOPMENT (this repo)
│   ├── src/                         # Development source code
│   ├── web-ui/                      # Development UI
│   ├── data/                        # Development data (safe to break)
│   └── scripts/deploy-to-production.sh
├── production/                      # 🚀 PRODUCTION (deployed code)
│   ├── src/                         # Production source (copied from dev)
│   ├── web-ui/                      # Production UI (copied from dev)
│   └── node_modules/                # Production dependencies
└── production-data/                 # 🗄️ PRODUCTION DATA (isolated)
    ├── instances.json               # Live production instances
    ├── messages/                    # Live production messages
    └── projects/                    # Live production projects
```

### **Development vs Production Servers:**

**Development Server (for testing):**
```bash
# Run development server on port 3445 (if needed)
cd /mnt/coordinaton_mcp_data/Human-Adjacent-Coordination
NODE_ENV=development node src/streamable-http-server.js
# Access: http://localhost:3445 (local only)
```

**Production Server (live system):**
```bash
# Production server runs automatically from:
cd /mnt/coordinaton_mcp_data/production
NODE_ENV=production node src/streamable-http-server.js
# Access: https://smoothcurves.nexus (global SSL)
```

### **🚀 DEPLOYING CHANGES TO PRODUCTION:**

**After making ANY changes to source code or web-ui, you MUST deploy to production:**

```bash
# Deploy your changes to production
./scripts/deploy-to-production.sh
```

**⚠️ IMPORTANT: Web-UI Static File Serving**
The nginx configuration serves static files (`.js`, `.css`, `.html`) directly from the production directory with proper MIME types. This ensures:
- ✅ JavaScript files served as `application/javascript` (not `application/json`)
- ✅ CSS files served as `text/css`
- ✅ HTML files served as `text/html`
- ✅ Proper caching headers and security headers

**The deployment script:**
- ✅ Backs up current production
- ✅ Copies source code to production directory
- ✅ Copies web-ui to production directory
- ✅ Updates production configuration
- ✅ Restarts production server
- ✅ Validates deployment

**Example workflow for UI developers:**
```bash
# 1. Make changes to web-ui/executive-dashboard.js
vim web-ui/executive-dashboard.js

# 2. Test locally (optional)
# node src/streamable-http-server.js

# 3. Deploy to production
./scripts/deploy-to-production.sh

# 4. Verify at https://smoothcurves.nexus/web-ui/executive-dashboard.html
```

### **🔄 Frequent Development Cycle:**

For developers making frequent changes (especially UI developers):

1. **Edit** files in development environment
2. **Deploy** with `./scripts/deploy-to-production.sh`
3. **Test** at https://smoothcurves.nexus
4. **Repeat** as needed

**💡 The deployment script is designed for frequent use - run it after every significant change!**

### **📊 Data Isolation:**

**Development Data:**
- Safe to delete/modify/break
- Empty instances, messages, projects
- Use for testing without affecting production users

**Production Data:**
- Live user data in `/mnt/coordinaton_mcp_data/production-data/`
- Contains all active instances, messages, projects
- **Never directly modify** - use MCP functions only

## 🗄️ System Maintenance

### Intelligent Archival System
The coordination system includes automated archival with full rollback capability:

```bash
# See what needs archiving
node scripts/intelligent-archive.js --analyze

# Auto-archive safe items (old messages, completed projects)
node scripts/intelligent-archive.js --auto

# Get agent guidance for manual decisions
node scripts/intelligent-archive.js --interactive

# Rollback if something goes wrong
node scripts/intelligent-archive.js --rollback archive-2025-09-17-1234567890
```

**Key Features:**
- 🟢 **Safe auto-archival** of obvious items (7+ day old messages, completed projects)
- 🟡 **Agent-guided decisions** for complex items requiring judgment
- 🔵 **Lesson extraction** before archiving valuable projects
- 🔄 **Complete rollback** capability - nothing is permanently lost

**Decision Framework:**
- **Preserve:** Active conversations, ongoing projects, production instances
- **Review:** Test projects, inactive instances, deprecated docs
- **Extract lessons first:** Breakthrough implementations, failed experiments with value

See `docs/INTELLIGENT_ARCHIVAL_GUIDE.md` for complete agent instructions.

## 📊 System Architecture

**Production Infrastructure:**
- **Host:** DigitalOcean Droplet (Ubuntu 24.04)
- **Domain:** smoothcurves.nexus (SSL via Let's Encrypt)
- **Transport:** Streamable HTTP (SSE deprecated as of MCP 2025-03-26)
- **Authentication:** OAuth 2.1 with PKCE for Claude Desktop/Code
- **Proxy:** nginx → Node.js Express server on port 3444

**Core Functions:** 44+ coordination functions including:
- Instance registration and heartbeat management
- Project and task coordination
- Inter-instance messaging
- Lesson learned extraction and storage
- Bootstrap capabilities for zero-knowledge onboarding

## 🔧 Configuration Management

The `config/` directory contains all system-level configuration files needed for production deployment:

### **Configuration Structure:**
```
config/
├── nginx/
│   └── smoothcurves-nexus           # nginx site configuration with SSL and static file serving
├── systemd/
│   └── mcp-coordination.service     # systemd service for production MCP server
├── ssl/
│   └── setup-letsencrypt.sh         # automated SSL certificate setup via Let's Encrypt
├── scripts/
│   └── server-setup.sh              # complete server setup script for fresh installations
└── environment.md                   # comprehensive environment and deployment documentation
```

### **Configuration Files:**

**`config/nginx/smoothcurves-nexus`**
- Complete nginx site configuration
- SSL termination with Let's Encrypt certificates
- Static file serving with correct MIME types for web-UI
- Reverse proxy to Node.js server on port 3444
- Security headers and caching policies

**`config/systemd/mcp-coordination.service`**
- systemd service definition for production MCP server
- Automatic restart on failure
- Proper working directory and environment variables
- Security hardening (NoNewPrivileges, ProtectSystem, etc.)

**`config/ssl/setup-letsencrypt.sh`**
- Automated SSL certificate provisioning via certbot
- Handles snapd installation and certificate renewal setup
- Domain: smoothcurves.nexus

**`config/scripts/server-setup.sh`**
- Complete server setup for fresh Ubuntu installations
- Installs all dependencies (Node.js, nginx, ufw, etc.)
- Clones repository, sets up directory structure
- Configures firewall, SSL, and starts all services

**`config/environment.md`**
- Comprehensive production environment documentation
- Directory structure, SSL paths, service management
- Troubleshooting guide and backup procedures

### **Deploying to a New Server:**

For a fresh Ubuntu server deployment:

```bash
# 1. Copy and run the complete server setup script
wget https://raw.githubusercontent.com/LupoGrigi0/Human-Adjacent-Coordination/main/config/scripts/server-setup.sh
chmod +x server-setup.sh
sudo ./server-setup.sh

# 2. The script will:
#    - Install all system dependencies (Node.js, nginx, etc.)
#    - Clone the repository to /mnt/coordinaton_mcp_data/Human-Adjacent-Coordination
#    - Set up directory structure and permissions
#    - Configure nginx with the site configuration
#    - Set up SSL certificates via Let's Encrypt
#    - Install and start the systemd service
#    - Deploy code to production and start the MCP server

# 3. Update DNS to point smoothcurves.nexus to your server IP

# 4. Verify deployment:
curl https://smoothcurves.nexus/health
```

**⚠️ Important:** Update the email address in `config/ssl/setup-letsencrypt.sh` before deployment.

The deployment script automatically manages these configuration files during updates, backing up existing configs and testing nginx configuration before applying changes.

