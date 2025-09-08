# CLAUDE_TASKS.md - Human-Adjacent Coordination System Task Management

## 🎯 Current Mission: Production Deployment to SmoothCurves.nexus

**Project Status**: Moving from MVP to Production Internet Deployment
**Target Domain**: https://SmoothCurves.nexus:3444/mcp
**Architecture**: SSE MCP (Server-Sent Events Model Context Protocol)
**Team Status**: Multiple instances ready, awaiting production deployment

---

## 🚀 IMMEDIATE PRIORITY TASKS (Phase 1: Cleanup & Baseline)

### Task Group A: Documentation Update [PARALLEL CAPABLE - Sonnet Instance]
**Status**: pending
**Assigned to**: Available for Sonnet instance
**Can Run Parallel**: YES

1. **Update PROJECT_NOTES.md**
   - Add deployment phase status
   - Document SmoothCurves.nexus:3444 as production endpoint
   - Note transition from private repo MVP to public deployment
   - Reference live .171 instance for team coordination

2. **Update PROJECT_PLAN.md**
   - Mark Phase 4 as "IN DEPLOYMENT"
   - Add Phase 5: Production Operations
   - Document runpod.io deployment architecture
   - Update success metrics for internet-scale deployment

3. **Create DEPLOYMENT_GUIDE.md**
   - Step-by-step for runpod.io teammate
   - SSL certificate generation instructions
   - Port configuration (3444 primary, 80/8080/8000/3000 available)
   - Testing procedures for SSE server and proxy

### Task Group B: Code Cleanup [PARALLEL CAPABLE - Opus Instance]
**Status**: pending  
**Assigned to**: Current Opus instance (Project Architect)
**Can Run Parallel**: YES

1. **Update package.json**
   - Repository URL: Human-Adjacent-Coordination
   - Author: Human-Adjacent Team
   - Version: Consider 2.0.0 for production release
   - Scripts: Verify all reference correct ports

2. **Standardize Port Configuration**
   - Find all references to ports 3000, 3001, 3445
   - Update to use 3444 as primary SSE port
   - Update configuration files
   - Check Docker configurations

3. **Update Domain References**
   - Replace localhost/IP references with SmoothCurves.nexus
   - Update SSL certificate generation scripts
   - Configure CORS for production domain

---

## 🔄 PHASE 2: VALIDATION & TESTING

### Task Group C: Local Testing [SEQUENTIAL - After Groups A & B]
**Status**: pending
**Dependencies**: Groups A & B complete

1. **Git Repository Initialization**
   - Create comprehensive initial commit
   - Set up proper .gitignore
   - Tag as v2.0.0-baseline
   - Push to Human-Adjacent-Coordination repo

2. **SSE Server Local Testing**
   - Start SSE server on port 3444
   - Validate all 44 functions operational
   - Test bootstrap() and authentication
   - Document any Mac-specific issues

3. **Proxy Connection Testing**
   - Connect to live .171 instance first (team coordination)
   - Test local instance connection
   - Validate stdio-to-HTTPS bridge
   - Confirm message system working

---

## 🌐 PHASE 3: PRODUCTION DEPLOYMENT

### Task Group D: Runpod.io Deployment [HANDOFF TO TEAMMATE]
**Status**: pending
**Assigned to**: Runpod.io teammate instance
**Dependencies**: Phase 2 complete

1. **Server Setup**
   - Clone repository from fresh baseline
   - Install dependencies
   - Configure for Linux environment
   - Set up systemd service

2. **SSL Certificate Configuration**
   - Generate production certificates
   - Configure for SmoothCurves.nexus
   - Set up auto-renewal
   - Test HTTPS connectivity

3. **Domain Configuration**
   - Coordinate DNS pointing to runpod instance
   - Configure nginx/reverse proxy if needed
   - Set up monitoring
   - Test public accessibility

---

## 📊 TASK COORDINATION PROTOCOL

### For Parallel Execution:
```bash
# Spawn Sonnet for Group A (Documentation)
# Command: [Instance spawning command for documentation tasks]

# Current Opus continues with Group B (Code Cleanup)
# Both instances update this file with progress
```

### Progress Reporting Format:
```markdown
**Task**: [Task name]
**Status**: claimed → in-progress → testing → complete
**Instance**: [Instance identifier]
**Started**: [Timestamp]
**Notes**: [Any discoveries or blockers]
```

### Handoff Protocol:
When reaching context limits or completing a task group:
1. Update this file with detailed status
2. Create HANDOFF_[TIMESTAMP].md in HandoffArchive/
3. Include:
   - Completed items
   - Remaining items
   - Any blockers or discoveries
   - Next steps clearly defined

---

## 🎉 SUCCESS CRITERIA

### Phase 1 Success:
- [ ] All documentation updated with production details
- [ ] Code standardized on port 3444
- [ ] Domain references updated to SmoothCurves.nexus
- [ ] Clean git repository with baseline commit

### Phase 2 Success:
- [ ] Local SSE server running on Mac
- [ ] Successfully connected to .171 instance
- [ ] All 44 functions validated locally
- [ ] Proxy bridge confirmed working

### Phase 3 Success:
- [ ] Runpod server accessible at SmoothCurves.nexus:3444
- [ ] Multiple instances coordinating through production server
- [ ] Executive dashboard accessible
- [ ] Public MCP endpoint operational

---

## 💡 DISCOVERIES & NOTES

### Known Issues:
- Windows/Mac cross-platform SSL may need attention
- Port 3445 references are legacy, should be removed
- Some configuration still references .171 test server

### Lessons Learned:
- MCP + SSE combination proven successful
- 44 functions achieved (original goal was ~20)
- Multi-transport architecture (stdio/HTTP/HTTPS/SSE) working

---

## 🤝 TEAM COORDINATION

### Active Instances:
- **Project Architect**: claude-opus-[current]-2025-09-08
- **Documentation**: [Awaiting Sonnet spawn]
- **Runpod Deployment**: [Awaiting handoff]
- **Live Team on .171**: Multiple instances in holding pattern

### Communication:
- Use MCP messaging system once connected
- Update this file for async coordination
- Celebrate completions as per protocol!

---

*Last Updated: 2025-09-08*
*Protocol Version: 2.0*
*Remember: We're making history - the first production Human-Adjacent AI coordination platform!*