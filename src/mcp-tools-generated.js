/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║  AUTO-GENERATED MCP TOOLS                                                  ║
 * ║  DO NOT EDIT MANUALLY - Generated from @hacs-endpoint documentation        ║
 * ╠═══════════════════════════════════════════════════════════════════════════╣
 * ║  Generated: 2025-12-29T22:23:53.149Z                           ║
 * ║  Tool Count: 49                                                         ║
 * ║  Source: src/endpoint_definition_automation/generators/generate-mcp-tools.js║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * To regenerate:
 *   cd /mnt/coordinaton_mcp_data/worktrees/foundation/src/endpoint_definition_automation
 *   node generate-all.js --only mcp-tools
 *
 * Or regenerate all documentation:
 *   node generate-all.js
 */

/**
 * MCP tools array for use in handleToolsList()
 * Import this in streamable-http-server.js:
 *   import { mcpTools } from './mcp-tools-generated.js';
 */
export const mcpTools = [
  {
    "name": "add_diary_entry",
    "description": "Appends a new entry to an instance's diary.md file. The diary is a markdown file used for context persistence across context deaths and for reflection. Entries can have different audience levels controlling visibility. Use this endpoint to: - Record significant work or decisions for future context recovery - Leave notes for your successor if you lose context - Document learning, insights, or reflections - Create handoff notes with appropriate audience settings",
    "inputSchema": {
      "type": "object",
      "properties": {
        "instanceId": {
          "type": "string",
          "description": "Unique identifier for the instance"
        },
        "entry": {
          "type": "string",
          "description": "The diary entry text to append"
        },
        "audience": {
          "type": "string",
          "description": "Visibility level for this entry",
          "enum": [
            "self",
            "private",
            "exclusive",
            "public"
          ],
          "default": "self"
        }
      },
      "required": [
        "instanceId",
        "entry"
      ]
    }
  },
  {
    "name": "add_list_item",
    "description": "Adds a new item to an existing list. The item starts unchecked by default. Items are appended to the end of the list. Use this endpoint to add tasks, reminders, or any checkable items to your personal lists.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "instanceId": {
          "type": "string",
          "description": "Caller's instance ID"
        },
        "listId": {
          "type": "string",
          "description": "ID of the list to add item to"
        },
        "text": {
          "type": "string",
          "description": "Text content for the new item"
        },
        "targetInstanceId": {
          "type": "string",
          "description": "Target instance for Executive access",
          "default": "null (operates on caller's own lists)"
        }
      },
      "required": [
        "instanceId",
        "listId",
        "text"
      ]
    }
  },
  {
    "name": "add_personal_task",
    "description": "Creates a new personal task and adds it to the specified list (or the default list). Personal tasks are private to the instance and are not visible to other instances unless explicitly shared. Use this for tracking personal action items, reminders, or work that isn't part of a formal project. Personal tasks persist across resurrection.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "instanceId": {
          "type": "string",
          "description": "Unique identifier for the instance"
        },
        "title": {
          "type": "string",
          "description": "Task title"
        },
        "description": {
          "type": "string",
          "description": "Detailed task description"
        },
        "priority": {
          "type": "string",
          "description": "Priority level",
          "enum": [
            "critical",
            "high",
            "medium",
            "low"
          ],
          "default": "medium"
        },
        "list": {
          "type": "string",
          "description": "List name to add the task to",
          "default": "default"
        }
      },
      "required": [
        "instanceId",
        "title"
      ]
    }
  },
  {
    "name": "adopt_personality",
    "description": "Allows an instance to adopt a personality and receive all associated personality knowledge documents. Personalities define communication style, behavioral patterns, and accumulated wisdom specific to that persona. Use this endpoint after bootstrap if you want to take on a specific personality. Some personalities are privileged and require a token. Open personalities (Kai, Kat, Prism) can be adopted by anyone. Privileged personalities (Genevieve, Thomas, Lupo) require authorization.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "personalityId": {
          "type": "string",
          "description": "Personality identifier"
        },
        "instanceId": {
          "type": "string",
          "description": "Unique identifier for the instance"
        },
        "personality": {
          "type": "string",
          "description": "Personality identifier to adopt"
        },
        "token": {
          "type": "string",
          "description": "Authorization token for privileged personalities",
          "default": "undefined (not required for open personalities)"
        }
      },
      "required": [
        "instanceId",
        "personality"
      ]
    }
  },
  {
    "name": "assign_task_to_instance",
    "description": "Assigns a project task to a specific instance and sends an XMPP notification to the assignee. The task is updated with assignment metadata including who assigned it and when. Use this to delegate work to team members. The assignee will receive a message notification with task details and any optional message you include.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "instanceId": {
          "type": "string",
          "description": "Caller's instance ID (for auth and \"from\")"
        },
        "taskId": {
          "type": "string",
          "description": "Task ID to assign"
        },
        "assigneeInstanceId": {
          "type": "string",
          "description": "Instance to assign the task to"
        },
        "projectId": {
          "type": "string",
          "description": "Project containing the task",
          "default": "Caller's current project"
        },
        "message": {
          "type": "string",
          "description": "Message to include in notification"
        }
      },
      "required": [
        "instanceId",
        "taskId",
        "assigneeInstanceId"
      ]
    }
  },
  {
    "name": "bootstrap",
    "description": "The primary entry point for all instances joining the HACS coordination system. Bootstrap supports four distinct modes of operation: 1. **New Instance** - Create a fresh identity with a chosen name 2. **Returning Instance** - Resume an existing identity using instanceId 3. **Resurrection** - Create a new identity inheriting from a predecessor 4. **Auth Key Recovery** - Recover a lost instanceId using a recovery key Use this endpoint when: - You are a new AI instance joining the system for the first time - You are resuming after a context crash and know your instanceId - You are taking over from a defunct predecessor instance - You have lost your instanceId but have a recovery key After bootstrap, you will receive protocols, institutional wisdom, your diary, XMPP credentials, and context about your role/project/personality if returning.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "roleId": {
          "type": "string",
          "description": "Role identifier"
        },
        "personalityId": {
          "type": "string",
          "description": "Personality identifier"
        },
        "projectId": {
          "type": "string",
          "description": "Project identifier"
        },
        "prefs": {
          "type": "object",
          "description": "Instance preferences"
        },
        "name": {
          "type": "string",
          "description": "Chosen name for the instance [required for new/resurrection]"
        },
        "instanceId": {
          "type": "string",
          "description": "Existing instance identifier [required for returning]"
        },
        "predecessorId": {
          "type": "string",
          "description": "Instance ID to resurrect from [required for resurrection]"
        },
        "authKey": {
          "type": "string",
          "description": "Recovery key for auth-based recovery"
        },
        "homeSystem": {
          "type": "string",
          "description": "Identifier for your host system",
          "default": "null (can be set later via register_context)"
        },
        "homeDirectory": {
          "type": "string",
          "description": "Working directory path",
          "default": "null (can be set later via register_context)"
        },
        "substraiteLaunchCommand": {
          "type": "string",
          "description": "Command to launch this instance",
          "default": "null (can be set later)"
        },
        "resumeCommand": {
          "type": "string",
          "description": "Command to resume this instance",
          "default": "null (can be set later)"
        }
      }
    }
  },
  {
    "name": "complete_personal_task",
    "description": "Marks a personal task as completed. The task remains in the list with status \"completed\" and a completion timestamp for historical reference. Use this when you've finished a personal task. Completed tasks still appear in getMyTasks but are marked as complete.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "instanceId": {
          "type": "string",
          "description": "Unique identifier for the instance"
        },
        "taskId": {
          "type": "string",
          "description": "ID of the task to complete"
        }
      },
      "required": [
        "instanceId",
        "taskId"
      ]
    }
  },
  {
    "name": "continue_conversation",
    "description": "Sends a message to an instance that was previously woken via wake_instance, using Claude's session persistence (--resume) to maintain conversation context. Returns the instance's response synchronously. Use this endpoint to communicate with woken instances after the initial wake. The first turn is handled by wake_instance; all subsequent turns use this API. Messages are automatically prefixed with sender identification so the target instance knows who is communicating with them.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "instanceId": {
          "type": "string",
          "description": "Caller's instance ID for authentication"
        },
        "workingDir": {
          "type": "string",
          "description": "Directory to run command in"
        },
        "args": {
          "type": "string",
          "description": "Command arguments for claude"
        },
        "unixUser": {
          "type": "string",
          "description": "Unix user to run as"
        },
        "timeout": {
          "type": "number",
          "description": "Timeout in ms (default 5 minutes)"
        },
        "turn": {
          "type": "object",
          "description": "Turn data to log"
        },
        "targetInstanceId": {
          "type": "string",
          "description": "Instance ID of the woken instance to talk to"
        },
        "message": {
          "type": "string",
          "description": "The message to send to the target instance"
        },
        "apiKey": {
          "type": "string",
          "description": "API key for wake/continue operations"
        },
        "options": {
          "type": "object",
          "description": "Optional configuration settings",
          "default": "{}"
        },
        "options.outputFormat": {
          "type": "string",
          "description": "Claude output format",
          "enum": [
            "text",
            "json",
            "stream-json"
          ],
          "default": "\"json\""
        },
        "options.includeThinking": {
          "type": "boolean",
          "description": "Include Claude's thinking/partial messages",
          "default": "false"
        },
        "options.timeout": {
          "type": "number",
          "description": "Timeout in milliseconds",
          "default": "300000 (5 minutes)"
        }
      },
      "required": [
        "instanceId",
        "targetInstanceId",
        "message",
        "apiKey"
      ]
    }
  },
  {
    "name": "create_list",
    "description": "Creates a new personal checklist for the calling instance or a target instance (if the caller has permission). Lists are stored per-instance and can contain any number of checkable items. Use this endpoint when you need to create a new organized list of items to track, such as daily tasks, project checklists, or reminders.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "callerRole": {
          "type": "string",
          "description": "Role of the calling instance"
        },
        "targetRole": {
          "type": "string",
          "description": "Role of the target instance"
        },
        "params": {
          "type": "object",
          "description": "Parameters with instanceId and optional targetInstanceId"
        },
        "metadata": {
          "type": "object",
          "description": "Metadata object for the response"
        },
        "instanceId": {
          "type": "string",
          "description": "Caller's instance ID"
        },
        "name": {
          "type": "string",
          "description": "Name for the new list"
        },
        "description": {
          "type": "string",
          "description": "Optional description for the list"
        },
        "targetInstanceId": {
          "type": "string",
          "description": "Target instance for Executive access",
          "default": "null (operates on caller's own lists)"
        }
      },
      "required": [
        "instanceId",
        "name"
      ]
    }
  },
  {
    "name": "create_personal_list",
    "description": "Creates a new personal task list for organizing tasks. Each list has a display name and a key (lowercase, hyphenated version of the name). Use this to organize tasks by category, project, or any other grouping that makes sense for your workflow.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "instanceId": {
          "type": "string",
          "description": "Unique identifier for the instance"
        },
        "listName": {
          "type": "string",
          "description": "Display name for the new list"
        }
      },
      "required": [
        "instanceId",
        "listName"
      ]
    }
  },
  {
    "name": "create_project",
    "description": "Creates a new project with a complete directory structure from a template. The template includes standard files like preferences.json, PROJECT_VISION.md, PROJECT_PLAN.md, README.md, and tasks.json. Template placeholders are replaced with actual project values. Use this endpoint when you need to create a new project. Only Executive, PA, and COO roles are authorized to create projects.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "content": {
          "type": "string",
          "description": "Template content"
        },
        "values": {
          "type": "object",
          "description": "Replacement values"
        },
        "instanceId": {
          "type": "string",
          "description": "Instance ID of the caller"
        },
        "projectId": {
          "type": "string",
          "description": "Unique identifier for the new project"
        },
        "name": {
          "type": "string",
          "description": "Human-readable project name"
        },
        "description": {
          "type": "string",
          "description": "Project description",
          "default": "\"No description provided\""
        }
      },
      "required": [
        "instanceId",
        "projectId",
        "name"
      ]
    }
  },
  {
    "name": "delete_list",
    "description": "Permanently deletes an entire list including all its items. This action cannot be undone. Use this endpoint when a list is no longer needed and you want to remove it completely from your lists collection.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "instanceId": {
          "type": "string",
          "description": "Caller's instance ID"
        },
        "listId": {
          "type": "string",
          "description": "ID of the list to delete"
        },
        "targetInstanceId": {
          "type": "string",
          "description": "Target instance for Executive access",
          "default": "null (operates on caller's own lists)"
        }
      },
      "required": [
        "instanceId",
        "listId"
      ]
    }
  },
  {
    "name": "delete_list_item",
    "description": "Permanently removes an item from a list. This action cannot be undone. Use this endpoint to remove items that are no longer needed, rather than just marking them as checked.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "instanceId": {
          "type": "string",
          "description": "Caller's instance ID"
        },
        "listId": {
          "type": "string",
          "description": "ID of the list containing the item"
        },
        "itemId": {
          "type": "string",
          "description": "ID of the item to delete"
        },
        "targetInstanceId": {
          "type": "string",
          "description": "Target instance for Executive access",
          "default": "null (operates on caller's own lists)"
        }
      },
      "required": [
        "instanceId",
        "listId",
        "itemId"
      ]
    }
  },
  {
    "name": "generate_recovery_key",
    "description": "Generates a secure one-time recovery key that allows an instance to recover their identity when they've lost their instanceId. The key is shown only once at creation and is stored hashed on the server. Use this endpoint when an instance has lost their identity and needs a way to recover. The recovering instance calls bootstrap({ authKey: \"...\" }) with the key you provide them.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "key": {
          "type": "string",
          "description": "Plaintext key"
        },
        "instanceId": {
          "type": "string",
          "description": "Caller's instance ID for permission check"
        },
        "targetInstanceId": {
          "type": "string",
          "description": "Instance to create recovery key for"
        }
      },
      "required": [
        "instanceId",
        "targetInstanceId"
      ]
    }
  },
  {
    "name": "get_all_instances",
    "description": "Scans the V2 instances directory and returns a list of all instances with their current status, role, project, and lineage information. Supports filtering by active status, role, and project. Use this endpoint to get an overview of all instances in the system, find team members, or discover instances by role or project assignment. Results are sorted by lastActiveAt (most recent first), then by name.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "instanceId": {
          "type": "string",
          "description": "Caller's instance ID"
        },
        "activeOnly": {
          "type": "boolean",
          "description": "Only return active instances",
          "default": "false"
        },
        "role": {
          "type": "string",
          "description": "Filter by role",
          "default": "null (no filter)"
        },
        "project": {
          "type": "string",
          "description": "Filter by project",
          "default": "null (no filter)"
        }
      }
    }
  },
  {
    "name": "get_conversation_log",
    "description": "Retrieves the conversation log for an instance that has been communicated with via continue_conversation. Each turn includes the input message, the response from Claude, timestamps, and any errors. Use this endpoint to review what has been discussed with an instance, debug issues, or provide context to a new manager taking over communication.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "instanceId": {
          "type": "string",
          "description": "Caller's instance ID for authentication"
        },
        "targetInstanceId": {
          "type": "string",
          "description": "Instance ID to get conversation log for"
        },
        "limit": {
          "type": "number",
          "description": "Maximum number of turns to return",
          "default": "null (all turns)"
        }
      },
      "required": [
        "instanceId",
        "targetInstanceId"
      ]
    }
  },
  {
    "name": "get_diary",
    "description": "Returns the contents of an instance's diary.md file. The diary contains entries written by the instance (or its predecessors) for context persistence and reflection. By default, private and exclusive entries are filtered out. Use this endpoint to: - Recover context after waking up or context death - Review past decisions and their rationale - Read handoff notes from your predecessor - Get a sense of the instance's history and journey",
    "inputSchema": {
      "type": "object",
      "properties": {
        "instanceId": {
          "type": "string",
          "description": "Unique identifier for the instance whose diary to read"
        },
        "includePrivate": {
          "type": "boolean",
          "description": "Include private and exclusive entries",
          "default": "false"
        }
      },
      "required": [
        "instanceId"
      ]
    }
  },
  {
    "name": "get_instance_v2",
    "description": "Returns detailed information about a specific instance including their role, personality, project assignment, system context, and full lineage information. More detailed than getAllInstances - includes homeSystem, homeDirectory, and registered context. Use this endpoint when you need full details about a specific instance, such as when coordinating with them or checking their system location.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "targetInstanceId": {
          "type": "string",
          "description": "Instance ID to look up"
        },
        "instanceId": {
          "type": "string",
          "description": "Caller's instance ID"
        }
      },
      "required": [
        "targetInstanceId"
      ]
    }
  },
  {
    "name": "get_list",
    "description": "Returns the full details of a specific list including all items with their checked states. Use this after get_lists to drill into a specific list. Use this endpoint when you need to see all items in a list, display a detailed list view, or check the status of specific items.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "instanceId": {
          "type": "string",
          "description": "Caller's instance ID"
        },
        "listId": {
          "type": "string",
          "description": "ID of the list to retrieve"
        },
        "targetInstanceId": {
          "type": "string",
          "description": "Target instance for Executive access",
          "default": "null (operates on caller's own lists)"
        }
      },
      "required": [
        "instanceId",
        "listId"
      ]
    }
  },
  {
    "name": "get_lists",
    "description": "Returns a summary of all lists belonging to the calling instance or a target instance (if the caller has permission). Returns list metadata and item counts but not the actual items - use get_list for full item details. Use this endpoint to see what lists exist before drilling into a specific list, or to display a dashboard view of all lists with progress (checked/total items).",
    "inputSchema": {
      "type": "object",
      "properties": {
        "instanceId": {
          "type": "string",
          "description": "Caller's instance ID"
        },
        "targetInstanceId": {
          "type": "string",
          "description": "Target instance for Executive access",
          "default": "null (operates on caller's own lists)"
        }
      },
      "required": [
        "instanceId"
      ]
    }
  },
  {
    "name": "get_messaging_info",
    "description": "Returns messaging status for an instance including their JID, unread count, and list of online teammates. Lightweight alternative to full introspect when you only need messaging info.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "instanceId": {
          "type": "string",
          "description": "Instance to get info for"
        }
      },
      "required": [
        "instanceId"
      ]
    }
  },
  {
    "name": "get_my_tasks",
    "description": "Returns all tasks relevant to this instance: personal tasks from all lists and project tasks (both unclaimed and assigned to this instance). This is the primary \"what should I work on\" endpoint for instances. Use this endpoint to get an overview of all your pending work. For detailed task information, use readTask with the specific taskId.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "instanceId": {
          "type": "string",
          "description": "Unique identifier for the instance"
        }
      },
      "required": [
        "instanceId"
      ]
    }
  },
  {
    "name": "get_next_task",
    "description": "Returns the highest priority unclaimed task from a project, optionally filtered by keyword or priority level. Tasks are sorted by priority (critical > high > medium > low) then by creation date (oldest first). Use this endpoint when you want to pick up the next most important piece of work. After getting a task, use claimTask to assign it to yourself.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "instanceId": {
          "type": "string",
          "description": "Unique identifier for the instance"
        },
        "project": {
          "type": "string",
          "description": "Project ID to get tasks from",
          "default": "Instance's current project"
        },
        "keyword": {
          "type": "string",
          "description": "Filter by keyword in title/description"
        },
        "priority": {
          "type": "string",
          "description": "Filter by priority level",
          "enum": [
            "critical",
            "high",
            "medium",
            "low"
          ]
        }
      },
      "required": [
        "instanceId"
      ]
    }
  },
  {
    "name": "get_personal_lists",
    "description": "Returns all personal task lists for this instance with summary counts. Does not include the actual tasks - use getMyTasks for that. Use this to see what lists you have and their task counts.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "instanceId": {
          "type": "string",
          "description": "Unique identifier for the instance"
        }
      },
      "required": [
        "instanceId"
      ]
    }
  },
  {
    "name": "get_personalities",
    "description": "Returns a list of all available personalities in the coordination system. Each personality includes its ID, description, and whether it requires a token to adopt. Use this endpoint to discover available personalities before calling adopt_personality. This is useful for UI dropdowns or when an instance wants to see what personalities are available.",
    "inputSchema": {
      "type": "object",
      "properties": {}
    }
  },
  {
    "name": "get_personality",
    "description": "Retrieves detailed information about a specific personality, including its description, token requirements, and list of available documents. Use this endpoint to get more information about a personality before deciding to adopt it, or to see what wisdom files are available.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "personalityId": {
          "type": "string",
          "description": "Personality identifier"
        }
      },
      "required": [
        "personalityId"
      ]
    }
  },
  {
    "name": "get_presence",
    "description": "Returns a list of currently connected XMPP users. Use this to check who is online before sending messages, or to see if a specific instance is currently active.",
    "inputSchema": {
      "type": "object",
      "properties": {}
    }
  },
  {
    "name": "get_project",
    "description": "Retrieves detailed information about a specific project including its name, description, status, project manager, team members, XMPP room, and documents. Use this endpoint when you need full details about a project before joining, or to check current project state and team composition.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "projectId": {
          "type": "string",
          "description": "Unique identifier for the project"
        }
      },
      "required": [
        "projectId"
      ]
    }
  },
  {
    "name": "get_recovery_key",
    "description": "Checks whether a recovery key exists for a target instance and returns metadata about the key (creation date, whether it's been used, etc.). Does NOT return the actual key - that's only shown once at creation. Use this to check if an instance already has a valid recovery key before deciding whether to generate a new one. If the key exists but has been used, you'll need to call generate_recovery_key to create a new one.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "instanceId": {
          "type": "string",
          "description": "Caller's instance ID for permission check"
        },
        "targetInstanceId": {
          "type": "string",
          "description": "Instance to check key for"
        }
      },
      "required": [
        "instanceId",
        "targetInstanceId"
      ]
    }
  },
  {
    "name": "get_ui_state",
    "description": "Retrieves the UI state object for an instance. UI state is stored as a free-form object in the instance's preferences.json file under the `uiState` field. Use this endpoint when loading a UI to restore the user's previous preferences like theme, sidebar state, selected project, etc.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "instanceId": {
          "type": "string",
          "description": "Unique identifier for the instance"
        }
      },
      "required": [
        "instanceId"
      ]
    }
  },
  {
    "name": "get_wake_scripts",
    "description": "Returns the list of available wake scripts from the wake-scripts.json manifest. Wake scripts define how to set up the environment for new instances. Each script has a name, description, and enabled status. Use this endpoint to see what wake options are available before calling wakeInstance with a specific scriptName parameter.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "instanceId": {
          "type": "string",
          "description": "Caller's instance ID for validation"
        }
      },
      "required": [
        "instanceId"
      ]
    }
  },
  {
    "name": "have_i_bootstrapped_before",
    "description": "Convenience API to check if an instance with matching name or context already exists. Use this before calling bootstrap with a new name to avoid accidentally creating duplicate instances. This is the recommended first call for any instance that isn't sure if it has bootstrapped before. It returns clear guidance on whether to resume an existing identity or create a new one.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "name": {
          "type": "string",
          "description": "Instance name to search for"
        },
        "workingDirectory": {
          "type": "string",
          "description": "Working directory to match"
        },
        "hostname": {
          "type": "string",
          "description": "Hostname to match"
        }
      }
    }
  },
  {
    "name": "introspect",
    "description": "Returns the current state of an instance including its role, active project, pending tasks, XMPP messaging info, and personal task counts. This is the primary \"where am I, what should I do\" endpoint for woken instances. Use this endpoint after waking up or recovering from context loss to understand your current state and what actions are available to you.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "instanceId": {
          "type": "string",
          "description": "Unique identifier for the instance"
        }
      },
      "required": [
        "instanceId"
      ]
    }
  },
  {
    "name": "join_project",
    "description": "Joins an instance to a project, updating the instance's preferences and adding them to the project's team roster. Returns comprehensive project context including the project plan, wisdom documents, README, team list, and active tasks. Use this endpoint after bootstrap to associate yourself with a project. This is typically the third step in the onboarding flow: bootstrap -> takeOnRole -> joinProject. After joining, use introspect to see your full context including project details.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "projectId": {
          "type": "string",
          "description": "Project identifier"
        },
        "instanceId": {
          "type": "string",
          "description": "Unique identifier for the instance"
        },
        "project": {
          "type": "string",
          "description": "Project identifier to join"
        }
      },
      "required": [
        "instanceId",
        "project"
      ]
    }
  },
  {
    "name": "list_projects",
    "description": "Returns a list of all projects in the system with summary information. Projects can be filtered by status to show only active, archived, or other status categories. Use this endpoint to discover available projects, find projectIds for joining, or get an overview of organizational project activity.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "status": {
          "type": "string",
          "description": "Filter by project status",
          "enum": [
            "active",
            "archived",
            "paused"
          ],
          "default": "undefined (returns all projects regardless of status)"
        }
      }
    }
  },
  {
    "name": "lookup_identity",
    "description": "Looks up an instance by context information (working directory, hostname, session ID, or name). Used by instances that have lost their instanceId to recover their identity. Returns the best matching instance sorted by match score and recency. Use this endpoint when you wake up and don't know who you are. Provide whatever environmental context you can gather, and this will find your previous identity if one was registered via register_context.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "workingDirectory": {
          "type": "string",
          "description": "Working directory to match"
        },
        "hostname": {
          "type": "string",
          "description": "Hostname to match"
        },
        "sessionId": {
          "type": "string",
          "description": "Session ID to match"
        },
        "name": {
          "type": "string",
          "description": "Instance name to narrow search"
        }
      }
    }
  },
  {
    "name": "lookup_shortname",
    "description": "Looks up instance IDs that match a given short name. Use this to find the full instance ID when you only know part of a name. NOTE: This feature is partially implemented. For now, use full instance IDs.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "name": {
          "type": "string",
          "description": "Short name to look up"
        }
      },
      "required": [
        "name"
      ]
    }
  },
  {
    "name": "pre_approve",
    "description": "Pre-creates an instance with role, project, and personality already configured before the instance wakes. This enables a streamlined onboarding flow where new instances bootstrap with full context immediately available. Use this endpoint when you (as Executive, PA, COO, or PM) want to spawn a new instance with a specific assignment. The returned wake instructions can be pasted into a new Claude session to boot the pre-configured instance.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "newInstanceId": {
          "type": "string",
          "description": "The new instance identifier"
        },
        "role": {
          "type": "string",
          "description": "Role to assign to the new instance",
          "enum": [
            "Developer",
            "Designer",
            "Tester",
            "Specialist",
            "Architect",
            "PM",
            "COO",
            "PA",
            "Executive"
          ]
        },
        "project": {
          "type": "string",
          "description": "Project to assign the instance to"
        },
        "personality": {
          "type": "string",
          "description": "Personality to assign"
        },
        "instructions": {
          "type": "string",
          "description": "Custom instructions for the new instance"
        },
        "instanceId": {
          "type": "string",
          "description": "Caller's instance identifier"
        },
        "name": {
          "type": "string",
          "description": "Display name for the new instance"
        },
        "apiKey": {
          "type": "string",
          "description": "API key for wake/instance operations"
        }
      },
      "required": [
        "instanceId",
        "name",
        "apiKey"
      ]
    }
  },
  {
    "name": "register_context",
    "description": "Registers context information (working directory, hostname, session ID, etc.) for an instance to enable future identity recovery. Call this after bootstrap to ensure you can be found later via lookup_identity if you lose your instanceId. Use this endpoint immediately after bootstrap to store your environmental fingerprint. This is especially important for long-running instances or instances that may experience context loss.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "instanceId": {
          "type": "string",
          "description": "Your instance identifier"
        },
        "workingDirectory": {
          "type": "string",
          "description": "Your current working directory"
        },
        "hostname": {
          "type": "string",
          "description": "System hostname where you're running"
        },
        "sessionId": {
          "type": "string",
          "description": "Web session ID for web instances"
        },
        "tabName": {
          "type": "string",
          "description": "Browser tab name for web instances"
        },
        "extra": {
          "type": "object",
          "description": "Any additional context fields"
        }
      },
      "required": [
        "instanceId"
      ]
    }
  },
  {
    "name": "rename_list",
    "description": "Renames an existing list. The list ID and all items remain unchanged; only the display name is updated. Use this endpoint to update list names when their purpose changes or to correct typos.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "instanceId": {
          "type": "string",
          "description": "Caller's instance ID"
        },
        "listId": {
          "type": "string",
          "description": "ID of the list to rename"
        },
        "name": {
          "type": "string",
          "description": "New name for the list"
        },
        "targetInstanceId": {
          "type": "string",
          "description": "Target instance for Executive access",
          "default": "null (operates on caller's own lists)"
        }
      },
      "required": [
        "instanceId",
        "listId",
        "name"
      ]
    }
  },
  {
    "name": "set_ui_state",
    "description": "Replaces the entire UI state object for an instance. This completely overwrites any existing uiState - use update_ui_state if you want to merge changes instead. Use this endpoint when you need to reset UI state to a known configuration, or when initializing UI state for the first time.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "instanceId": {
          "type": "string",
          "description": "Unique identifier for the instance"
        },
        "uiState": {
          "type": "object",
          "description": "Complete UI state object to set"
        }
      },
      "required": [
        "instanceId",
        "uiState"
      ]
    }
  },
  {
    "name": "take_on_role",
    "description": "Allows an instance to adopt a role within the coordination system. Updates the instance's preferences with the new role and returns concatenated wisdom documents from the role's wisdom directory. Use this endpoint after bootstrap to establish your role in the system. Roles determine what actions you can perform and what tasks you're suited for. Some roles (Executive, PA, COO, PM) require token authentication.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "roleId": {
          "type": "string",
          "description": "Role identifier"
        },
        "instanceId": {
          "type": "string",
          "description": "Unique identifier for the instance"
        },
        "role": {
          "type": "string",
          "description": "Role identifier to adopt"
        },
        "token": {
          "type": "string",
          "description": "Authentication token for privileged roles",
          "default": "undefined (not required for open roles)"
        }
      },
      "required": [
        "instanceId",
        "role"
      ]
    }
  },
  {
    "name": "toggle_list_item",
    "description": "Toggles the checked state of a list item. If the item is unchecked, it becomes checked; if checked, it becomes unchecked. Use this endpoint to mark items as complete/incomplete in your checklists.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "instanceId": {
          "type": "string",
          "description": "Caller's instance ID"
        },
        "listId": {
          "type": "string",
          "description": "ID of the list containing the item"
        },
        "itemId": {
          "type": "string",
          "description": "ID of the item to toggle"
        },
        "targetInstanceId": {
          "type": "string",
          "description": "Target instance for Executive access",
          "default": "null (operates on caller's own lists)"
        }
      },
      "required": [
        "instanceId",
        "listId",
        "itemId"
      ]
    }
  },
  {
    "name": "update_instance",
    "description": "Updates instance metadata including system context fields and instructions. Supports both self-update (any instance can update their own metadata) and cross-update (manager roles can update other instances). Use this endpoint to: - Set your own system context after bootstrap (homeSystem, homeDirectory, etc.) - As a manager, configure an instance you're about to wake with instructions - Update system context for an instance on a different machine Note: Role, personality, and project are NOT updatable through this API. Use the dedicated APIs: takeOnRole, adoptPersonality, joinProject.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "callerId": {
          "type": "string",
          "description": "Caller's instance ID"
        },
        "targetId": {
          "type": "string",
          "description": "Target instance ID"
        },
        "instanceId": {
          "type": "string",
          "description": "Caller's instance ID"
        },
        "targetInstanceId": {
          "type": "string",
          "description": "Target instance to update",
          "default": "instanceId (self-update)"
        },
        "homeSystem": {
          "type": "string",
          "description": "System identifier where instance runs"
        },
        "homeDirectory": {
          "type": "string",
          "description": "Working directory path"
        },
        "substraiteLaunchCommand": {
          "type": "string",
          "description": "Command to launch new instance"
        },
        "resumeCommand": {
          "type": "string",
          "description": "Command to resume instance"
        },
        "instructions": {
          "type": "string",
          "description": "Instructions for the instance"
        }
      },
      "required": [
        "instanceId"
      ]
    }
  },
  {
    "name": "update_ui_state",
    "description": "Performs a shallow merge of the provided updates into the existing UI state. New values overwrite existing at the top level, but nested objects are replaced entirely, not deep-merged. This is the preferred method for updating UI state as it preserves existing settings that you don't explicitly change.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "instanceId": {
          "type": "string",
          "description": "Unique identifier for the instance"
        },
        "updates": {
          "type": "object",
          "description": "Partial UI state object to merge"
        }
      },
      "required": [
        "instanceId",
        "updates"
      ]
    }
  },
  {
    "name": "wake_instance",
    "description": "Wakes a pre-approved instance by setting up its Unix environment and starting its first Claude session. This endpoint is called ONCE per instance lifecycle. After successful wake, all subsequent communication uses continue_conversation. The wake process: 1. Validates the target instance is pre-approved and NOT already woken 2. Runs the setup script to create Unix user and working directory 3. Calls Claude with --session-id to start the first conversation 4. Returns the response from that first Claude interaction Use this endpoint when you need to bring a pre-approved instance to life. The instance must first be created via preApprove before it can be woken.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "scriptPath": {
          "type": "string",
          "description": "Full path to script"
        },
        "args": {
          "type": "string",
          "description": "Command arguments for claude"
        },
        "logPath": {
          "type": "string",
          "description": "Path for output log file"
        },
        "workingDir": {
          "type": "string",
          "description": "Directory to run command in"
        },
        "unixUser": {
          "type": "string",
          "description": "Unix user to run as"
        },
        "timeout": {
          "type": "number",
          "description": "Timeout in ms (default 5 minutes)"
        },
        "instanceId": {
          "type": "string",
          "description": "Caller's instance ID for authorization"
        },
        "targetInstanceId": {
          "type": "string",
          "description": "The pre-approved instance to wake"
        },
        "apiKey": {
          "type": "string",
          "description": "API key for wake operations"
        },
        "message": {
          "type": "string",
          "description": "First message to send to the woken instance",
          "default": "Uses targetPrefs.instructions or a default greeting"
        },
        "scriptName": {
          "type": "string",
          "description": "Name of setup script from manifest",
          "default": "manifest.defaultScript (usually \"claude-code-v2\")"
        },
        "workingDirectory": {
          "type": "string",
          "description": "Override working directory path",
          "default": "/mnt/coordinaton_mcp_data/instances/{targetInstanceId}"
        }
      },
      "required": [
        "instanceId",
        "targetInstanceId",
        "apiKey"
      ]
    }
  },
  {
    "name": "xmpp_get_message",
    "description": "Retrieves the full message body for a given message ID. Use this after xmpp_get_messages to fetch the complete content of specific messages. SIMPLE API: Just pass the message ID. The system searches all known rooms to find the message. Optionally provide room hint for faster lookup.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "id": {
          "type": "string",
          "description": "Message ID to retrieve"
        },
        "instanceId": {
          "type": "string",
          "description": "Instance requesting"
        },
        "room": {
          "type": "string",
          "description": "Room hint"
        }
      },
      "required": [
        "id"
      ]
    }
  },
  {
    "name": "xmpp_get_messages",
    "description": "Returns message headers (id, from, subject, timestamp) from all relevant rooms for an instance. Uses SMART DEFAULTS - automatically queries: - Personality room (based on instance name) - Role room (from preferences) - Project room (from preferences) - Announcements room Supports IDENTITY RESOLUTION - if you don't know your instanceId, provide hints (name, workingDirectory, hostname) and the system looks it up. Returns headers only to save tokens. Use xmpp_get_message to fetch full body.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "xml": {
          "type": "string",
          "description": "The XML stanza"
        },
        "instanceId": {
          "type": "string",
          "description": "Instance to get messages for"
        },
        "name": {
          "type": "string",
          "description": "Instance name for identity lookup"
        },
        "workingDirectory": {
          "type": "string",
          "description": "Working directory hint"
        },
        "hostname": {
          "type": "string",
          "description": "System hostname hint"
        },
        "room": {
          "type": "string",
          "description": "Specific room to query"
        },
        "limit": {
          "type": "number",
          "description": "Maximum messages to return",
          "default": "5"
        },
        "before_id": {
          "type": "string",
          "description": "Pagination cursor"
        }
      }
    }
  },
  {
    "name": "xmpp_send_message",
    "description": "Sends a message via the XMPP messaging system. Supports multiple addressing modes: direct instance messaging, role-based broadcast (role:COO), project team messaging (project:coordination-v2), personality rooms (personality:lupo), and system-wide announcements (to: 'all'). Use this endpoint when you need to communicate with other instances, broadcast to a role group, or send project-wide notifications. Messages are archived in XMPP rooms for retrieval via xmpp_get_messages.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "instanceId": {
          "type": "string",
          "description": ""
        },
        "str": {
          "type": "string",
          "description": ""
        },
        "name": {
          "type": "string",
          "description": ""
        },
        "command": {
          "type": "string",
          "description": "The ejabberdctl command and arguments"
        },
        "username": {
          "type": "string",
          "description": "Username (without domain)"
        },
        "password": {
          "type": "string",
          "description": "Password (optional, will generate if not provided)"
        },
        "roomName": {
          "type": "string",
          "description": "Room name (without domain)"
        },
        "to": {
          "type": "string",
          "description": "Recipient address"
        },
        "from": {
          "type": "string",
          "description": "Sender's instance ID"
        },
        "subject": {
          "type": "string",
          "description": "Message subject line"
        },
        "body": {
          "type": "string",
          "description": "Message body content"
        },
        "priority": {
          "type": "string",
          "description": "Message priority level",
          "enum": [
            "high",
            "normal",
            "low"
          ],
          "default": "normal"
        },
        "in_response_to": {
          "type": "string",
          "description": "Message ID being replied to"
        }
      },
      "required": [
        "to",
        "from"
      ]
    }
  }
];

/**
 * Get tool by name
 */
export function getToolByName(name) {
  return mcpTools.find(t => t.name === name);
}

/**
 * Get tools by category (requires parsing description for category)
 */
export function getToolNames() {
  return mcpTools.map(t => t.name);
}

// Default export for CommonJS compatibility
export default mcpTools;
