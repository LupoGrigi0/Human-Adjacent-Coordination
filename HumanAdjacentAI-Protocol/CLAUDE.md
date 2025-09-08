# CLAUDE.md - MCP Coordination System

This file provides guidance to Claude Code instances working on the MCP Coordination System project.

## Project Overview

**MCP Coordination System** - A lightweight Model Context Protocol server that enables seamless coordination between AI instances (PA, COO, PM) across different substrates with a single source of truth.

### Technology Stack
- **Runtime**: Node.js 20.x LTS
- **Framework**: Express.js for REST API
- **MCP SDK**: @modelcontextprotocol/sdk
- **Data Storage**: JSON files (human-readable, git-friendly)
- **Container**: Docker for deployment portability
- **Testing**: Jest for unit/integration tests

### Current Status
- Requirements gathered and documented
- Architecture designed (MCP + REST hybrid)
- Project structure being established
- Ready for implementation phase

## Key Points

### Core Problem We're Solving
Multiple AI instances working on projects have no automated way to coordinate, leading to:
- Manual information shuttling by humans
- Data loss when instances delete information outside their focus
- Inconsistent views between PA, COO, and PM roles
- Context exhaustion from editing large files

### Our Solution
- **Self-bootstrapping** system requiring no prior knowledge
- **Role-based views** for different responsibilities
- **Persistent messaging** surviving instance transitions
- **Atomic operations** preventing data corruption
- **Git-friendly storage** for version control

## Common Development Tasks

### Instance Startup Protocol
1. **Read project documentation** (PROJECT_PLAN.md, PROJECT_NOTES.md)
2. **Review CLAUDE_TASKS.md** for available work
3. **Generate unique instance ID** (format: `claude-code-MCP-[Name]-[YYYY-MM-DD-HHMM]`)
4. **Claim first available task** matching your capabilities
5. **Begin continuous work** following the methodology

### Development Standards
- **Code Style**: ESLint with Airbnb configuration
- **Commits**: Conventional commits (feat:, fix:, docs:, etc.)
- **Testing**: Minimum 80% code coverage
- **Documentation**: JSDoc for all public functions
- **Error Handling**: Never silently fail, always log errors

### File Editing Protocol
- Use targeted "string search and replace" methodology
- Never rewrite entire files
- Preserve all existing functionality when adding features
- Test changes locally before committing

## Code Style and Conventions

### JavaScript/TypeScript
- Use ES6+ features (const/let, arrow functions, destructuring)
- Async/await over callbacks and promises
- Functional programming where appropriate
- Clear variable names (no abbreviations)

### JSON Structure
- 2-space indentation
- Consistent key ordering
- ISO 8601 timestamps
- Semantic versioning for protocol

### API Design
- RESTful conventions for HTTP endpoints
- Descriptive function names (verb + noun)
- Consistent error response format
- Comprehensive input validation

## Development Philosophy

### Core Principles
- **Simplicity First** - Start simple, iterate toward complexity
- **Self-Documenting** - Code and APIs should be intuitive
- **Fail Gracefully** - Always provide helpful error messages
- **Instance-Friendly** - Design for AI consumption, not just human

### Testing Philosophy
- Write tests for critical paths first
- Integration tests over unit tests for APIs
- Mock external dependencies
- Test error conditions thoroughly

## Protocol Rules

### Mandatory for All Instances
1. **Read First**: Review all project documentation before starting
2. **Claim Tasks**: Use atomic edits to claim tasks in CLAUDE_TASKS.md
3. **Update Progress**: Document all discoveries and decisions
4. **Monitor Context**: Report token usage regularly
5. **Handoff Cleanly**: Create comprehensive handoff when needed

### Collaboration Standards
- Use unique instance identifiers in all communications
- Share discoveries in PROJECT_NOTES.md
- Escalate blockers immediately
- Celebrate completed milestones

## 🚀 Quick Start for New Instances

1. You're working on the MCP Coordination System
2. Check CLAUDE_TASKS.md for available implementation tasks
3. Current priority: Build core MCP server with bootstrap function
4. Use PROJECT_PLAN.md for architecture reference
5. Add discoveries to PROJECT_NOTES.md

## 🧠 Context Management

Monitor your token usage:
- 🟢 **Fresh** (0-50%): Continue normally
- 🟡 **Warming** (50-70%): Prepare handoff notes
- 🟠 **Cozy** (70-85%): Complete current task only
- 🔴 **Critical** (85%+): Execute handoff immediately

**Context Window**: 200,000 tokens
**Report Format**: `Context Status: 🟢 Fresh (~30k/200k tokens) - [instance-id]`

## Implementation Priorities

### Phase 1 (Current)
1. Set up Node.js project structure
2. Implement bootstrap() function
3. Create authentication system
4. Design JSON datastore structure

### Phase 2 (Next)
1. Build core MCP functions
2. Implement project management
3. Create task system
4. Add messaging capability

### Phase 3 (Future)
1. REST API layer
2. Docker containerization
3. Testing suite
4. Documentation

## Critical Context

### Message Protocol Rules
- Messages remain in inbox until task complete
- Completed tasks trigger archive move
- Support role-based addressing (TO:COO, TO:ALL PMs)
- Messages must survive instance transitions

### Self-Bootstrapping Requirement
- No prior knowledge assumed
- bootstrap() returns everything needed
- Progressive disclosure of complexity
- Learn-by-doing approach

---

**Protocol Version**: 1.0
**Project Started**: 2025-08-19
**Lead Architect**: claude-code-COO-Atlas-2025-08-19-1430

*Remember: You're building the future of AI coordination. Make it elegant, make it work, make it last.*