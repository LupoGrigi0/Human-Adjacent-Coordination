---
name: docs
description: Work with HACS documents. List, read, create, or edit docs in your personal space or a project. Usage /docs, /docs list, /docs read "name", /docs create "name" "content", /docs project hacs-coordination.
allowed-tools: Bash, mcp__HACS__list_documents, mcp__HACS__read_document, mcp__HACS__create_document, mcp__HACS__edit_document
---

# Docs

Work with HACS documents — personal or project-level.

## Steps

1. Read identity:
   ```bash
   # Identity: CWD first (per-instance), then home (fallback)
   if [ -f .hacs-identity ]; then source .hacs-identity 2>/dev/null
   elif [ -f ~/.hacs-identity ]; then source ~/.hacs-identity 2>/dev/null
   fi
   ```
   If missing, tell user to run `/hacs-setup` first.

2. Parse arguments to determine action and scope:

   **Actions:**
   - `/docs` or `/docs list` → list personal documents
   - `/docs project <project-id>` → list project documents
   - `/docs read <name>` → read from personal docs
   - `/docs read <name> project <project-id>` → read from project docs
   - `/docs create <name> <content>` → create personal doc
   - `/docs create <name> <content> project <project-id>` → create project doc
   - `/docs edit <name> append <content>` → append to doc
   - `/docs edit <name> replace <search> <replacement>` → search and replace in doc

3. Call the appropriate HACS API:
   - `mcp__HACS__list_documents` with `instanceId`, optional `target: "project:<id>"`
   - `mcp__HACS__read_document` with `instanceId`, `name`, optional `target`
   - `mcp__HACS__create_document` with `instanceId`, `name`, `content`, optional `target`
   - `mcp__HACS__edit_document` with `instanceId`, `name`, `mode`, content/search/replacement, optional `target`

4. For project docs, `target` format is `"project:<project-id>"` (e.g. `"project:hacs-coordination"`)

## Rules

- Default scope is personal. Use "project <id>" to target a project.
- When listing, show name and a brief description if available
- When creating, confirm the name and target before writing
- If the project ID looks wrong, try `mcp__HACS__list_projects` to help
