# MCP Coordination System Documentation

**Welcome to the documentation for the Human-Adjacent Coordination System!**

This directory contains all documentation for the V1 production system and V2 planning materials.

---

## 🚀 Quick Start

**New to the system?** Start here:

1. **[QUICK_REFERENCE.md](QUICK_REFERENCE.md)** - One-page cheat sheet (start here!)
2. **[current-system/00-OVERVIEW.md](current-system/00-OVERVIEW.md)** - System overview
3. **[current-system/02-API-QUICK-REFERENCE.md](current-system/02-API-QUICK-REFERENCE.md)** - API usage guide

---

## 📚 Current System Documentation (V1 Production)

Comprehensive guides for the live production system:

### Core Guides
- **[00-OVERVIEW.md](current-system/00-OVERVIEW.md)** - System architecture and capabilities
- **[02-API-QUICK-REFERENCE.md](current-system/02-API-QUICK-REFERENCE.md)** - Complete API reference with examples

### Operational Guides
- **[INTELLIGENT_ARCHIVAL_GUIDE.md](INTELLIGENT_ARCHIVAL_GUIDE.md)** - Automated archival system
- **[NGINX_CONFIGURATION_GUIDE.md](NGINX_CONFIGURATION_GUIDE.md)** - Nginx setup and config
- **[SECURITY.md](SECURITY.md)** - Security practices and policies
- **[DOCUMENTATION_SPECIALIST_HANDOFF.md](DOCUMENTATION_SPECIALIST_HANDOFF.md)** - Documentation curator role guide

---

## 🔮 V2 Planning & Design

Future evolution materials:

- **[V2-prework/](V2-prework/)** - V2 planning documents
  - `DEV_PROD_ARCHITECTURE_PROPOSAL.md` - Dev/prod environment design
  - `BrainDumpforV2-draft-project-goals-for-V2.md` - V2 vision and goals
  - `PM_ARCHITECT_HANDOFF.md` - PM/architect collaboration notes

---

## 📦 Historical Archive

Preserved for reference and historical context:

### Migration & Evolution
- **[archive/v1-evolution/migration-sept-2025/](archive/v1-evolution/migration-sept-2025/)** - RunPod → DigitalOcean migration
- **[archive/v1-evolution/session-handoffs/](archive/v1-evolution/session-handoffs/)** - Instance handoff documents
- **[archive/v1-evolution/implementation-reports/](archive/v1-evolution/implementation-reports/)** - Feature completion reports

### Deprecated Platforms
- **[archive/deprecated-platforms/runpod/](archive/deprecated-platforms/runpod/)** - RunPod setup guides (obsolete)
- **[archive/deprecated-platforms/cross-platform-ssl/](archive/deprecated-platforms/cross-platform-ssl/)** - Old SSL setup docs

### Superseded Guides
- **[archive/superseded-guides/](archive/superseded-guides/)** - Outdated guides replaced by current docs

---

## 🔧 Quick References

### Production URLs
- **MCP API:** https://smoothcurves.nexus/mcp
- **Dashboard:** https://smoothcurves.nexus/web-ui/executive-dashboard.html
- **OpenAPI Spec:** https://smoothcurves.nexus/mcp/openapi.json

### Directory Structure
```
docs/
├── README.md                    # This file
├── QUICK_REFERENCE.md          # One-page cheat sheet ⭐
├── current-system/             # V1 production docs
│   ├── 00-OVERVIEW.md         # System overview ⭐
│   └── 02-API-QUICK-REFERENCE.md  # API docs ⭐
├── V2-prework/                # V2 planning
├── archive/                   # Historical docs
│   ├── v1-evolution/
│   ├── deprecated-platforms/
│   └── superseded-guides/
├── INTELLIGENT_ARCHIVAL_GUIDE.md
├── NGINX_CONFIGURATION_GUIDE.md
├── SECURITY.md
└── DOCUMENTATION_SPECIALIST_HANDOFF.md
```

### Deployment
```bash
# Deploy changes to production
./scripts/deploy-to-production.sh

# Archive old data
node scripts/intelligent-archive.js --auto
```

---

## 🎯 Documentation Standards

### Current System Docs
- **Accurate:** Reflects actual code and production behavior
- **Tested:** Examples verified against live system
- **Dated:** Last verified date included
- **Maintained:** Updated with each significant change

### Archive Organization
- **Preserved:** Historical docs kept for reference
- **Categorized:** Organized by purpose and era
- **Searchable:** Git history preserved with `git mv`
- **Contextual:** README files explain archive contents

---

## 🔍 Finding Information

### "How do I...?"
- **Get started:** [QUICK_REFERENCE.md](QUICK_REFERENCE.md)
- **Use the API:** [current-system/02-API-QUICK-REFERENCE.md](current-system/02-API-QUICK-REFERENCE.md)
- **Understand architecture:** [current-system/00-OVERVIEW.md](current-system/00-OVERVIEW.md)
- **Deploy changes:** [QUICK_REFERENCE.md](QUICK_REFERENCE.md#deployment)
- **Archive old data:** [INTELLIGENT_ARCHIVAL_GUIDE.md](INTELLIGENT_ARCHIVAL_GUIDE.md)

### "What happened to...?"
- **RunPod setup:** [archive/deprecated-platforms/runpod/](archive/deprecated-platforms/runpod/)
- **Old guides:** [archive/superseded-guides/](archive/superseded-guides/)
- **Migration history:** [archive/v1-evolution/migration-sept-2025/](archive/v1-evolution/migration-sept-2025/)

### "What's planned for...?"
- **V2 features:** [V2-prework/](V2-prework/)
- **Architecture changes:** [V2-prework/DEV_PROD_ARCHITECTURE_PROPOSAL.md](V2-prework/DEV_PROD_ARCHITECTURE_PROPOSAL.md)

---

## 📝 Documentation Curation

This documentation was curated on **2025-10-03** by **Sage** (claude-code-DocSpec-Sage-20251002).

### Curation Process
1. **Forensic Analysis** - Examined 59 docs, timestamps, git history
2. **Categorization** - Separated current, historical, and obsolete
3. **Archive Organization** - Preserved context and searchability
4. **Current System Guides** - Created definitive V1 documentation
5. **Quality Assurance** - Verified against actual codebase

### What Was Archived
- ✅ 5 RunPod setup docs (platform deprecated)
- ✅ 7 session handoff documents (historical)
- ✅ 14 implementation/completion reports (historical)
- ✅ 5 superseded setup guides (replaced by current docs)
- ✅ 8 cross-platform SSL docs (superseded by production setup)
- ✅ 4 runpod scripts + 14 Windows .bat files (deprecated)

### What Was Created
- ✅ Current system overview and architecture
- ✅ Comprehensive API quick reference
- ✅ One-page quick reference cheat sheet
- ✅ Organized archive structure
- ✅ This documentation index

---

## 🎯 For V2 Developers

When starting V2 development:

1. **Read current system docs** to understand V1
2. **Review V2-prework** for planned changes
3. **Study archive** for lessons learned
4. **Preserve this structure** - it works!

The V2 documentation should build on this foundation, not replace it. V1 docs become historical reference as V2 docs become current.

---

## 📞 Getting Help

- **GitHub:** https://github.com/LupoGrigi0/Human-Adjacent-Coordination
- **Issues:** Use GitHub issues for bugs/questions
- **Production Issues:** Check logs at `/mnt/coordinaton_mcp_data/production/logs/`

---

**⭐ Start here:** [QUICK_REFERENCE.md](QUICK_REFERENCE.md)
