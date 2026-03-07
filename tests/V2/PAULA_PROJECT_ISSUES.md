# Paula Project Issues & Blockers Log

**Created:** 2026-01-09
**Maintainer:** Axiom-2615 (COO)

---

## Active Issues

### ISSUE-001: OAuth Token Expiration (RECURRING)
**Status:** Investigating
**Affects:** continue_conversation to woken instances
**Details:**
- OAuth tokens expire, breaking communication with Orla and team
- 5-minute cron syncs from /root/.claude/ to shared-config
- Keeps recurring despite fixes
- Sent details to Crossing (2026-01-09)

**Error:**
```json
{
  "type": "authentication_error",
  "message": "OAuth token has expired. Please obtain a new token or refresh your existing token."
}
```

---

### ISSUE-002: Task APIs Missing (RESOLVED)
**Status:** FIXED by Ember (2026-01-09)
**Details:**
- Task creation/management APIs were missing from V2
- Ember rebuilt entire task system
- Full lifecycle tested: create → assign → complete → verify → archive
- Self-verification prevention working (can't verify your own task)

---

### ISSUE-003: join_project Bug
**Status:** Investigating (Ember)
**Details:**
- Orla noted: "list shows paula-book but join fails"
- May be related to project preferences structure
- Need to verify if fixed with Ember's task work

---

## Resolved Issues

### Directory Permissions (RESOLVED 2026-01-09)
- Created `paula-team` Unix group
- Added Orla-da01 to group
- Set group ownership on /mnt/paula/ with setgid
- All team members will be added on wake

### Directory Structure (RESOLVED 2026-01-09)
- Created COMPLETED/ and Error/ directories
- Full kanban structure in place:
  - SourcePhotos/, INPROCESS/, COMPLETED/, Error/, paula-graduacion/

---

## Notes for Future Reference

### Key Tokens
- Wake API key: 26cceff32ccd207f9c1d4e0b3bfa2dcf7c1045b9d4a23c56489c105756a1bb30
- PM role key: 139d484d6977b7efc656fe303b5283f43813d5fc5672328dc8cfafec60481c10
- COO token: 8bfbedb00ed91c5bd6ef7ba8a7e6c23eb0f6cc0a20c5758a47724072c2416b7c

### Team Unix Users (add to paula-team on wake)
- Orla-da01 ✓ (added)
- Mira-???? (pending)
- Egan-???? (pending)
- Sable-???? (pending)
- Nia-???? (pending)
- Quinn-???? (pending - browser-based, may not need)
- Vale-???? (pending)

---

*Updated: 2026-01-09*
