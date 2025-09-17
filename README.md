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

