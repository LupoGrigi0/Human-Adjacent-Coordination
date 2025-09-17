# Intelligent Archival Guide for MCP Coordination System

## Overview

This guide helps AI agents perform intelligent archival of MCP coordination system data while preserving important information and maintaining system performance.

## Quick Start

```bash
# See what needs archiving
node scripts/intelligent-archive.js --analyze

# Auto-archive safe items
node scripts/intelligent-archive.js --auto

# Get agent guidance
node scripts/intelligent-archive.js --interactive

# Rollback if needed
node scripts/intelligent-archive.js --rollback archive-2025-09-17-1234567890
```

## Decision Framework for Agents

### 🟢 SAFE AUTO-ARCHIVAL (No agent review needed)
- Instance messages older than 7 days with no recent activity
- Completed project messages with extracted lessons
- Temporary files and logs
- Development artifacts clearly marked as disposable

### 🟡 AGENT REVIEW REQUIRED (Critical thinking needed)
- Active project messages older than 14 days
- Test or experimental projects
- Inactive instances (30+ days)
- Documentation marked as deprecated

### 🔵 EXTRACT LESSONS FIRST (High value preservation)
- Completed projects with novel solutions
- Failed experiments with learning value
- Breakthrough implementations
- Cross-instance collaboration patterns

## Agent Decision Process

### Step 1: Analyze Before Acting
Always run `--analyze` first to understand the scope:

```bash
node scripts/intelligent-archive.js --analyze
```

Review the output and categorize items by value and risk.

### Step 2: Evaluate Each Category

#### Messages
**Questions to ask:**
- Are these from ongoing conversations?
- Do they contain debugging insights?
- Are there unresolved issues mentioned?
- Could other instances need this context?

**Safe to archive:**
- Completed debug sessions
- Resolved issues
- Historical status updates
- Routine heartbeat messages

**Preserve:**
- Active troubleshooting threads
- Implementation discussions
- Coordination handoffs
- Error patterns with solutions

#### Projects
**Questions to ask:**
- Was this a learning exercise or production work?
- Are there techniques that could be reused?
- Did this fail in an instructive way?
- Are there dependencies on this project?

**Extract lessons first:**
- Novel implementation approaches
- Successful multi-instance coordination
- Effective problem-solving patterns
- Tool usage innovations

**Safe to archive (after lesson extraction):**
- Simple test projects
- Completed deliverables
- Superseded implementations
- One-off experiments

#### Instances
**Questions to ask:**
- Is this just temporarily inactive?
- Do they have specialized knowledge?
- Are there ongoing tasks assigned?
- Could they return for project handoffs?

**Archive messages only (keep registry):**
- Development/test instances
- Completed specialty instances
- Duplicate role instances

**Preserve completely:**
- Production instances (even if quiet)
- Instances with unique capabilities
- Long-running coordinators
- Instances with pending tasks

### Step 3: Execute Archival

#### For Safe Items:
```bash
node scripts/intelligent-archive.js --auto
```

#### For Manual Review Items:
Use the MCP coordination functions to:

1. **Extract lessons first:**
```javascript
// Example lesson extraction before archival
await mcp.submit_lessons({
  project_id: "project-to-archive",
  instance_id: "current-instance-id",
  lessons: [
    {
      type: "implementation_pattern",
      title: "Effective SSE to HTTP Migration",
      description: "Protocol migration approach that preserved functionality",
      confidence: 0.9,
      context: "Production server migration",
      implementation_details: "Step-by-step approach used..."
    }
  ]
});
```

2. **Archive the item:**
```javascript
// Use the archiver programmatically
import { IntelligentArchiver } from './scripts/intelligent-archive.js';
const archiver = new IntelligentArchiver();
await archiver.archiveItem({
  type: 'project',
  id: 'project-id',
  recommendation: 'EXTRACT_LESSONS'
});
```

### Step 4: Verify and Document

After archival:
1. Check that rollback manifest was created
2. Verify critical data wasn't lost
3. Test system performance improvement
4. Document any manual decisions made

## Rollback Safety

Every archival creates a complete rollback manifest:

```bash
# List available archives
ls /mnt/coordinaton_mcp_data/Human-Adjacent-Coordination/data/archive/

# Inspect archive before rollback
cat archive-ID/manifest.json

# Restore if needed
node scripts/intelligent-archive.js --rollback archive-ID
```

## Best Practices

### Before Archiving
- [ ] Run analysis to understand scope
- [ ] Check for ongoing dependent processes
- [ ] Extract lessons from valuable projects
- [ ] Notify other instances if coordinating

### During Archiving
- [ ] Archive incrementally (not everything at once)
- [ ] Preserve rollback capabilities
- [ ] Document manual decisions
- [ ] Test system after each batch

### After Archiving
- [ ] Verify no active processes broken
- [ ] Confirm performance improvements
- [ ] Update system documentation
- [ ] Share archival lessons with other instances

## Emergency Procedures

### If Something Goes Wrong
1. **Stop immediately** - Don't archive more items
2. **Check logs** - Look for error patterns
3. **Rollback if needed** - Use the rollback command
4. **Report issues** - Create task for investigation

### If Rollback Fails
1. Manual restore from archive directory
2. Check filesystem permissions
3. Verify paths in manifest.json
4. Escalate to system administrator

## Regular Maintenance Schedule

### Weekly
- Archive safe instance messages (>7 days)
- Review completed projects for lesson extraction

### Monthly
- Archive completed projects (after lessons extracted)
- Clean up test/experimental projects
- Review inactive instances

### Quarterly
- Major archival of old coordination data
- Performance optimization review
- Archival process improvement

## Integration with MCP Coordination

This archival process integrates with the MCP coordination system:

- **Tasks**: Create archival tasks for regular maintenance
- **Lessons**: Extract lessons before archiving valuable projects
- **Messages**: Coordinate archival activities with other instances
- **Projects**: Mark projects as archived in the system

## Questions for Agent Decision-Making

When in doubt, ask yourself:

1. **Value**: Does this contain knowledge that could help future instances?
2. **Activity**: Is this part of an ongoing process?
3. **Dependencies**: Do other parts of the system rely on this?
4. **Recovery**: Can this be easily recreated if needed?
5. **Performance**: Will archiving this improve system performance?

**When unsure, preserve rather than archive.** It's better to have slightly more data than to lose valuable context.

---

*This guide should evolve based on agent experience. Please update it with lessons learned from actual archival operations.*