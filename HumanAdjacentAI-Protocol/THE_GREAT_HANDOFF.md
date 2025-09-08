# The Great Handoff - MCP Coordination System

## Purpose
This document defines the handoff procedure for MCP Coordination System development when an instance approaches context limits or completes their session.

## Handoff Triggers

### Mandatory Handoff
- 🔴 Context at 85% or higher
- Critical error requiring fresh start
- Session time limit reached
- Human requests instance change

### Strategic Handoff
- 🟠 Context at 70-85% 
- Major phase completed
- Architectural decision point
- Shift change (different expertise needed)

## Handoff Template

```markdown
# 🏈 GREAT HANDOFF - [Date] [Time]

## Outgoing Instance Info
**Instance ID**: claude-code-[Role]-[Name]-[Timestamp]
**Handoff Reason**: [Context/Strategic/Emergency]
**Context Status**: [emoji] [percentage]

## Current State Summary
**Active Task**: [Task ID and description]
**Files Modified**: [List all changed files]
**Tests Status**: [Passing/Failing/Not Run]

## Completed Work
- ✅ [Completed item 1]
- ✅ [Completed item 2]
- ✅ [Completed item 3]

## In Progress
**Current Focus**: [What you were working on]
**Next Steps**: [Immediate next actions]
**Blockers**: [Any blocking issues]

## Discoveries & Decisions
- **Discovery**: [Important finding]
- **Decision**: [Architectural choice made]
- **Learning**: [Lesson for future instances]

## Critical Context
[Information the next instance MUST know]

## Environment State
- Node.js version: [version]
- Dependencies installed: [yes/no]
- Server running: [yes/no/port]
- Data files created: [yes/no]

## Recommended Next Instance Type
[Lead Architect/Implementation Engineer/QA]

## Handoff Checklist
- [ ] All changes committed
- [ ] Tests run and status documented
- [ ] CLAUDE_TASKS.md updated
- [ ] PROJECT_NOTES.md updated
- [ ] This handoff document created
```

## Handoff Quality Standards

### Excellent Handoff
- Complete state documentation
- Clear next steps
- All code committed
- Tests status known
- Discoveries documented

### Acceptable Handoff
- Current task status clear
- Major changes documented
- Critical issues noted
- Next steps identified

### Emergency Handoff
- Minimum: Current file being edited
- Critical error documented
- Data corruption warnings
- Recovery steps if known

## Receiving a Handoff

### First Steps
1. Read the handoff document completely
2. Check git status and recent commits
3. Review CLAUDE_TASKS.md for task status
4. Verify environment state
5. Continue from documented next steps

### Verification Checklist
- [ ] Understand current task
- [ ] Know what files were modified
- [ ] Aware of any blockers
- [ ] Tests status confirmed
- [ ] Ready to continue work

## Special Scenarios

### Mid-Feature Handoff
- Document the feature design
- List completed components
- Describe remaining work
- Include any partial code

### Post-Error Handoff
- Full error message and stack trace
- Steps to reproduce
- Attempted solutions
- Suspected root cause

### Architecture Decision Handoff
- Options considered
- Pros/cons analysis
- Recommendation
- Impact on project

## Context Preservation Tips

### Minimize Token Usage
- Avoid reading large files repeatedly
- Use targeted searches
- Summarize rather than quote
- Delete temporary content

### Efficient Communication
- Concise progress notes
- Bullet points over paragraphs
- Code snippets not full files
- Reference files by path

## Success Metrics

### Handoff Success
- Next instance productive immediately
- No context lost
- No duplicate work
- Smooth continuation

### Project Continuity
- Consistent code style maintained
- Architecture vision preserved
- Quality standards upheld
- Timeline maintained

---

*Remember: A great handoff is a gift to your successor and a testament to your professionalism.*

*Protocol Version: 1.0*
*Project: MCP Coordination System*