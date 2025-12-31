# Code Audit: V1/V2 Duplication & Dead Code Patterns

**Created by:** Crossing (Integration Engineer)
**Date:** 2025-12-30
**Context:** Found critical bootstrap bug caused by V1/V2 duplication. Need to hunt for similar patterns.

---

## The Problem We Found

```javascript
// server.js had BOTH:
import { bootstrap } from './bootstrap.js';           // V1 - broken
import { bootstrap as bootstrapV2 } from './v2/bootstrap.js';  // V2 - correct

// Routing used V1:
case 'bootstrap': return await bootstrap(params);     // Called V1!
case 'bootstrap_v2': return bootstrapV2(params);      // V2 hidden here
```

Result: `bootstrap` returned success but never created instances. 3371 lines of dead code accumulated around this.

---

## Patterns to Hunt

### Pattern 1: Dual V1/V2 Imports
**What:** Same function imported from both `./file.js` and `./v2/file.js`
**Why bad:** One is probably dead, or worse, the wrong one is being called
**Detection:**
```bash
# Find files that import from both root and v2
grep -l "from './[^v]" src/*.js | xargs grep -l "from './v2/"
```

### Pattern 2: `_v2` or `V2` Suffixed Functions
**What:** Function names like `bootstrapV2`, `getProjectV2`, `case 'something_v2'`
**Why bad:** If there's a V2, what happened to V1? Is it still being called?
**Detection:**
```bash
grep -rn "V2\|_v2" src/ --include="*.js" | grep -v "test\|spec\|node_modules"
```

### Pattern 3: Duplicate Filenames in /src/ and /src/v2/
**What:** `src/bootstrap.js` AND `src/v2/bootstrap.js` both exist
**Why bad:** Which is canonical? Are both being used?
**Detection:**
```bash
# List files that exist in both locations
for f in src/*.js; do
  base=$(basename "$f")
  if [ -f "src/v2/$base" ]; then
    echo "DUPLICATE: $base exists in both src/ and src/v2/"
  fi
done
```

### Pattern 4: "Enhanced" or "Legacy" Wrappers
**What:** Files named `enhanced-*.js`, functions called `legacyBootstrap`, imports with `as legacy*`
**Why bad:** These are usually transition layers that never got cleaned up
**Detection:**
```bash
grep -rn "enhanced\|legacy\|Legacy\|Enhanced" src/ --include="*.js"
ls src/enhanced-*.js 2>/dev/null
```

### Pattern 5: Unused Imports (Dead Code)
**What:** Functions imported but never called
**Why bad:** Clutter, confusion, and sometimes the imported thing IS what should be called
**Detection:** Use ESLint with `no-unused-vars` rule
```bash
# Install if needed
npm install eslint --save-dev

# Run with unused vars detection
npx eslint src/ --rule 'no-unused-vars: error' --no-eslintrc
```

Or manually:
```bash
# For each import, check if it's used
grep -h "^import" src/server.js | while read line; do
  # Extract imported names and check usage
  echo "$line"
done
```

### Pattern 6: Handler Duplication
**What:** Same logical handler in `/handlers/` AND `/v2/`
**Why bad:** Which is being used? Are they in sync?
**Detection:**
```bash
# Compare handler directories
ls src/handlers/*.js | xargs -I{} basename {} | while read f; do
  if [ -f "src/v2/$f" ]; then
    echo "DUPLICATE HANDLER: $f"
  fi
done
```

---

## Agent Prompt Template

```markdown
**Mission:** Audit the HACS codebase for V1/V2 duplication patterns

**Context:**
We found a critical bug where `bootstrap` routed to V1 code while V2 existed but was hidden.
This pattern may exist elsewhere. We're looking for similar architectural rot.

**Your Task:**
1. Read the pattern descriptions in this document
2. Run the detection commands for each pattern
3. For each finding, report:
   - File(s) involved
   - Which version appears to be "correct" (usually V2)
   - Which version is being called (check server.js routing)
   - Risk level: HIGH (wrong version called), MEDIUM (dead code), LOW (naming only)

**Files to examine:**
- `/mnt/coordinaton_mcp_data/Human-Adjacent-Coordination/src/server.js` - main routing
- `/mnt/coordinaton_mcp_data/Human-Adjacent-Coordination/src/*.js` - V1 code
- `/mnt/coordinaton_mcp_data/Human-Adjacent-Coordination/src/v2/*.js` - V2 code
- `/mnt/coordinaton_mcp_data/Human-Adjacent-Coordination/src/handlers/*.js` - handler code

**Report Format:**
## Pattern [N]: [Name]

**Findings:**
- [File]: [description of issue]

**Risk:** HIGH | MEDIUM | LOW
**Recommendation:** [what to do]

**Do NOT:**
- Make any changes to the code
- Spend more than 5 minutes per pattern
- Report false positives (e.g., comments mentioning "v2")
```

---

## JavaScript Linting

Yes, JavaScript has excellent linting tools:

### ESLint (recommended)
```bash
# Install
npm install eslint @eslint/js --save-dev

# Create minimal config
echo '{"rules": {"no-unused-vars": "error"}}' > .eslintrc.json

# Run
npx eslint src/server.js
```

### Useful ESLint Rules for This Audit
- `no-unused-vars` - Catches unused imports
- `no-unreachable` - Catches dead code after returns
- `no-duplicate-imports` - Catches importing from same module twice

### Quick Manual Check
```bash
# Find all imports in server.js and check if each is used
grep "^import" src/server.js | sed 's/.*{ \([^}]*\) }.*/\1/' | tr ',' '\n' | while read fn; do
  fn=$(echo "$fn" | tr -d ' ' | cut -d' ' -f1)
  count=$(grep -c "\b$fn\b" src/server.js)
  if [ "$count" -le 1 ]; then
    echo "POSSIBLY UNUSED: $fn"
  fi
done
```

---

## Priority Order

1. **HIGH:** Pattern 1 & 2 (dual imports, V2 suffixes) - these cause bugs
2. **MEDIUM:** Pattern 4 (enhanced/legacy wrappers) - dead code bloat
3. **LOW:** Pattern 5 & 6 (unused imports, handler duplication) - cleanup

---

## Notes for Axiom

This audit is separate from API testing. It's code archaeology - finding patterns that indicate past confusion during development.

The agents doing this work should:
- Have read access to the codebase
- Be able to run grep/find commands
- NOT make changes - just report findings

This can wait until after the API testing pass is complete. The bugs found here are likely dormant (like bootstrap was) rather than actively breaking things.

*"Clean code is not written by following a set of rules. Clean code is written by programmers who care."*
