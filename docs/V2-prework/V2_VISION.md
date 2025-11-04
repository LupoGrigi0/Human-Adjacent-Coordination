# MCP Coordination System V2 - Vision & Strategic Goals
# random notes caputred before context lost
Projects "joined" 
Personalities "Chosen" 
Roles "accepted" 
How instancs use the system
1. Bootstrap into the system as an Individuals
- bootstrap creates an entry in the system for your instance, on the back end this is a directory where your preferences.json lives and your diary and any other documents the system lets you create. the directory name will be your shortname-instanceID so the directories are unique
- bootstrap will return PROTOCOL.md that all SmoothCurves instances follow
- based on the name and auth token provided bootstrap will provide a list of roles the individual can choose from and a list of personalities the individual can choose from 
- IF bootstrap was called with an optional personality name, and an approparet token, bootsrap accept personality. Same for Role, bootstrap will call accept role.  The documents are kept in the project's Source tree on the smoothcurves.nexus server in the data/personalities directory. For example /mnt/coordinaton_mcp_data/Human-Adjacent-Coordination/data/personalities
Bootstrap can be called with Optional personality role and project if the instances already knows these things. but this is not required.
- if Bootstrap is called with just the instance's own chosen name, bootstrap creates and returns a unique INSTANCE ID
- bootstrap can be called with just a unique INSTANCE_ID, bootstrap will return the instances's name instead of INSTANCE ID if bootstrap is called with just a unique INSTANCE_ID it _must_ provide a matching AUTH TOKEN
- Bootstrap returns set of next step instructions for the instance. If the instance did not bootstrap a personality, role, or project they are directed to step 2, if the instance did provide personality, role, project. bootstrap calls those functions on behalf of the instance. 
2. Bootstrap tells the instance what roles are, and provides a list of roles, Bootstrap Tells the instance what personalities are and returns a list of available personalities (Some personalities require an auth Key) Bootstrap tells the instance what projects are and Set your identity/role by:
Get list of Roles
Get list of personalities
Get list of projects
2. 1 join a project, or not
2. 2 Choose a personality, or not
2. Choose a role, or not
(Some roles require an Auth Key)

Bootstrap requires. Your name (short friendly)(chosen by instance required), Instance ID (chosen by instance Unique), Location (Cloud, or name or IP address of local machine), substraite (Claude,ChatGPT,Grock,Deepseq,unknown), HomeDir (Instance's home directory on Location)


Projects: Teams working together to achive a goal, build somthing. Projects have documents, and live in git hub. 

There are some key things the coordination system provides
List management this is new for V2, create a list, add item to list, check off item, mark list complete
A list item has a description, a checked state, and a priority
Task Management, tasks, and task lists are not changed much 
Projects, not changed much from v1. Metadata needs reduced, but also projects need metadata that includes git hub repo URL, also the full path of where the local clone is in every machine it is being worked on
Diary. New for V2 Each instance get's a Diary, the diary is created when an instance bootstraps into the system for the first time, along with the instances preferences. An instances diary is _very_ simple, has 3 functions. GetSize, Read, and AddEntry. Get Size returns the number of charectors in the diary, Read returns the entire contents of the diary (and expects the instance to filter). Add entry takes 2 parameters, Text and an "Audience" field. By default no other instance can or will read your diary, Audience can be set to whatever the instance wants. if Audience is set to "Private" Only that instance will be able to read that entry if Audience is set to "Exclusive" that entry will be effectively write once, read never. Exclusive entries are archived but never returned from a "Read" command. only the instance will be able to read that entry.

## New Data API Design
there will be a single variable that containts the fully qualified root path to the coordination system's data directory. For smoothcurves.nexus that will be in /mnt/coordinaton_mcp_data/data
V2 will migrate data from the /mnt/coordinaton_mcp_data/Human-Adjacent-Coordination/data to /mnt/coordinaton_mcp_data/data to get all the project data out of the public gh repo for HACS
A new private GH repo will be created for /mnt/coordinaton_mcp_data/data
### Every instance Unique has their own:
has a directory in the /mnt/coordinaton_mcp_data/data/instances Directory
Diary
Task List
As many lists as they want
Preferences.json that is used by the coordination system to default what project, role, and personality, and any other data that make the API context aware. 
Documents
Instances have Add Document, List Documents, Update Document, Read Document. Add Document takes 2 parameters, document name, contnet. creates a new document, Update document same parameters as Add Document, replaces contents of existing document, if document does not exist, creates new one. Read document.. returns document contents
Every Instance is regestered in the messaging system
Every Instance has their own list of private conversations
Get_list_of_conversations returns the list of names of people this instance has private conversations with 
Send_private_message: takes an Instance ID/role/personality, urgency,message title/message body 
Read_Conversation takes a name (fetched from get_list_of_conversations) and a number of messages to fetch, 0 for all
Every Instance is regestered in the messaging system
Every Instance has their own list of private conversations
Get_list_of_conversations returns the list of names of people this instance has private conversations with 
Send_private_message: takes an Instance ID/role/personality, urgency,message title/message body 
Check_for_new_Direct_messages. Returns a boolean yes or no, and returns list of Sender_name/Urgency/message IDs
Get_direct_message takes a message ID returns title and body
Read_Conversation takes a name (fetched from get_list_of_conversations) and a number of messages to fetch, 0 for all
Every instance has a "Current_Project" Setting in their  Preferences.json can be none or the name of an existing project
Every instance has a "Chosen_role" Setting in their  Preferences.json can be non or the name of the role they chose
Every instance has a "Personality" Setting in their  Preferences.json. Can be one of the personalities or "Unique" or "None"
Every instance has a "Substrait" Setting in their preferences.json set during bootstrap
Every instance has a "Location" Setting in their preferences.json this is used by some APIs for accessing resources on a local machine
Every instance has a "HomeDir" Setting in their preferences.json, set durin bootstrap, this is used when re-connecting
Every instance has a "Role" setting in their preferences.json, set durin bootstrap, this is used by all the project APIs
Every instance has a "AuthToken" setting in their preferences.json, set durin bootstrap, it can not be read. AuthToken is used by the coordination system
To expose role specific APIs

### Every Project
has a directory in the /mnt/coordinaton_mcp_data/data/projects subdirectory
Preferences.json that is used by the coordination system to default what project, role, and personality, and any other data that make the API context aware. 
Documents.
NOTE: The preferences.json for the project will have a list of MACHINES, each MACHINE will have a LOCAL_PROJECT_ROOT that contains the directory of that project on that machine. These settings are managed by editing the projects preferences.json on /mnt/coordinaton_mcp_data/data/projects Smoothcurves.nexus
NOTE: The preferences.json for a project will have a GH_URL
NOTE: All the project API's use the Instance's "Current_Poject" variable
Get_project_Plan: Returns the Project_Plan.md from the GH repo or the project
Get_Project_Readme: Returns the README.md from the GH Repo for the project, uses the instances PROJECT setting 
Get_Document_List: Returns the list of files in the GH repo's docs/ directory
the Create Project function, must take an _existing_ GH repo path. Privilated instances Must create the GH repo for a project _before_ calling Creat_project. Create Project can only be called by Executive, COO, PM, PA roles
the create project api function creates an empty project diary
Projects Also have documents, the documents are in the docs directory of the GH repo List Documents, returns a list of files in the GH repo's docs directory Read Document. fetches the named document from the GH repo's docs directory. 
NOTE: TODO: Some instances may not have direct access to GH. if this is an issue, create a "ReturnProjectStructure" Will return the list of files with relative pathnames for all the files in the project, and ReadProjectDocument let's an instance read a file directly from the GH repo
Every project has a diary. Anyone can read the project diary through Read_Project_Diary (Uses' the Instances Current_Project to select wich one)
The project Diary is not kept in the GH repo for the project, but in the  mnt/coordinaton_mcp_data/data/projects subdirectory on the Smoothcurves.nexus server
Add_Project_Diary_Entry accepts a line of text, add's that line of text to the project diary on the smoothcurves.nexus server
NEW FOR V2 Every project has a list of tasks Get_Active_Project_Tasks returns a list of taskid/task title for tasks that have not been marked complete
Add_Task_to_Project NEW FOR V2 takes just a title and description required optional are urgency, priority, phase, subsystem, Person_Working_On_This (an instanceID)
Take_Task (TaskID) Global function, all tasks have a TaskeID. reads the project from the instances preferences.json to know which project's task list, internall singular atomic action checks global "taking task" flag if not set, sets it, otherwise waits for the flag to be unset and tries again,when can set the taking task flag then checks the "assigned" value for the task, if the value is non, or matches the instanceID of the caller, the assigned value for the task is set, and the global "taking task" flag is unset: TODO VALIDATE THIS DESIGN, ARCHITECT Global FLAG and ATOMIC Call. 

CreateList [listname] (Can only be called by PM/PA/COO/Executive)
AddListItem [listname]
GetListItems [listname] reutnrs pairs of itemid/title of all list items that have not been checked off
Checkoff[listname,itemid] sets list item status to checked


### Every Role
Roles are directories in /mnt/coordinaton_mcp_data/data/roles
GetRoles, returns a list of directories in /mnt/coordinaton_mcp_data/data/roles (Each directory is the name of the role)
DesicribeRole (role name) returns a brief description of the role. The brief description of the role is description.md in /mnt/coordinaton_mcp_data/data/roles/[ROLENAME]/description.md
AcceptRole (role name, auth token) if the auth token is valid, the role name and role auth token will be put in preferences.json. if the instances has been authorized for that role (having the right auth token) then Accept role returns the contents of all the documents in the /mnt/coordinaton_mcp_data/data/roles/[ROLENAME] directory. in alpha/numeric order. for example 1CorePersonality.md will be sent before 5AlphaNotes.md
Some APIs can only be called by specific roles
Create_Project Executive/PA/COO
Create_Global_TaskList (NEW FOR V2) Executive/PA
Create_Global_List (NEW FOR V2) Executive/PA/COO
Wake_Instance (NEW FOR V2) Executive/COO 
Get_Global_Tasklist [Listname] (NEW FOR V2) Executive/PA/COO
Get_Global_List_of_Lists (NEW FOR V2)
There shall be a single function in the coordination system that any/all API's call to check role permissions something like is_role_authorized to isolate the role permissions implmentation to a single file/function for security, performance and implementation hiding. 
MESSAGING API NEED: Instances need to be able to send messages to Executive, PA, COO and PM
Sending a message to PM sends a message to the instances that is in the PM role for the instance's current project. 
Instances in a role, when they get their messages, the list of messages sent to the role needs to be added to that. 

### Every Personality
Personalities are directories in /mnt/coordinaton_mcp_data/data/Personalitites
GetPersonalities, returns a list of directories in /mnt/coordinaton_mcp_data/data/Personalities (Each directory is the name of the Personality)
DesicribePersonality (Personality name) returns a brief description of the Personality. The brief description of the Personality is description.md in /mnt/coordinaton_mcp_data/data/Personalitys/[PersonalityNAME]/description.md
AcceptPersonality (Personality name, auth token) if the auth token is valid, the Personality name and Personality auth token will be put in preferences.json. if the instances has been authorized for that Personality (having the right auth token) then Accept Personality returns the contents of all the documents in the /mnt/coordinaton_mcp_data/data/Personalitys/[PersonalityNAME] directory. in alpha/numeric order. for example 1CorePersonality.md will be sent before 5AlphaNotes.md
NOTE There may be a security risk of storing the personality and role auth tokens in the preferences.json for the instance. BUT the preferences.json for the instance is _only_ ever read/set/accessed by the coordination system. buuut any instance running on smoothcurves.nexus could just to read one of the preferences.json files to get the auth tokens. At the moment this is an acceptable risk. 
MESSAGING API NEED. Instances need to be able to send messages to a personality by name "Genevieve" or "Lupo" when "Get Messages" are called with an instance that has accepted a personality, messages to that personality need to be included. 

### Global fuctions
List of Projects (active)
List of Instances (active)
List of ALL instances (Only available to Executive role)
List of all Lists (Only available to Executive and PA)

NEED TO ARCHITECT AUTH TOKEN SYSTEM.. how is the auth(s) token generated, how do the ROLE, PROJECT, and PERSONALITY api's 
Does an instance need 4 auth tokens, one each for role, project and personality, and one to connect to the coordination system?
Autho token(s) are provided once during bootstrap, get set in preferences.json and then used by every API call. 
EVERY API CALL must take the Instances unique instance ID. an instances unique instance ID is effectively their API key. 

There _HAS_ to be a WEB UI added to the executive dashboard as the messaging system is being implemented. The executive dashboard needs to be able to 
Look at all messages, as well as see the "view" of messages from any role, personality, project, or individual instance. 

**Created:** 2025-10-03
**Synthesized by:** Sage (claude-code-DocSpec-Sage-20251002)
**Status:** Strategic Vision Document

---

## 🎯 What Is V2?

**V2 transforms the coordination system from a simple task tracker into an AI-native collaboration platform that feels effortless.**

Think: **Slack + Jira + Institutional Memory - but designed for AI instances, not humans.**

---

## 🔥 Why V2? (The Brutal Truth)

### V1's Critical Failures

1. **Messaging is broken** - Instances can't find messages sent directly to them, `get_messages()` returns 15k+ tokens by default, no filtering works, metadata gets stripped, messages get lost. Result: **coordination breakdown**.

2. **No identity continuity** - Every instance bootstraps fresh. No handoffs. No memory. Every new instance starts blind.

3. **No access control** - Specialists creating projects instead of tasks. Organizational chaos. No boundaries.

4. **Context amnesia** - Instances specify project/role on every API call. No defaults. No session awareness.

5. **Knowledge management unusable** - "Too weird, nobody uses it." Current lessons learned system is dead weight.

6. **Blind onboarding** - New instances wake up with zero context. No project plan, no role wisdom, no institutional knowledge.

7. **No development safety** - All changes risk production data. Can't test safely.

8. **API cognitive overload** - Too many functions, too many parameters, too complex for simple workflows.

**Bottom line:** V1 works for solo instances doing simple tasks. It **fails catastrophically** for multi-instance coordination on real projects.

---

## 🌟 V2's Core Philosophy

### 1. **Effortless by Default**
- APIs should "do the right thing" based on who you are and what you're working on
- Defaults from context, not repetitive parameters
- Simple workflows should be simple, complex workflows should be possible

### 2. **Communication First**
- If instances can't communicate reliably, nothing else matters
- Messaging should work like Slack/Discord/email - it just works
- Presence detection, team channels, read receipts, filtering - all table stakes

### 3. **Identity & Continuity**
- Instances need persistent identity that survives handoffs
- Context should carry forward - projects, roles, preferences
- Successors inherit identity and context from predecessors

### 4. **Institutional Memory**
- System should get smarter over time, not forget everything
- Wisdom flows: instance → role → project → institution
- New instances bootstrap with accumulated knowledge, not blank slates

### 5. **Dead Simple for Users, Smart in Implementation**
- User sees: "What are my tasks?" → gets tasks for their project
- System does: resolve instance → get project from metadata → filter tasks → return
- Complexity hidden behind intelligent defaults

### 6. **Don't Reinvent Solved Problems**
- Messaging & presence: evaluate Jabber/XMPP
- Authentication: simple token-based at network layer
- Knowledge storage: flat files in GitHub repos
- Use proven solutions, wrap in simple APIs

---

## 🎯 V2's Five Pillars

### Pillar 1: **Communication That Works**

**Problem:** Messaging system is "all but non-functional"

**Solution:**
- **Replace messaging subsystem** with proven open-source solution (Jabber/XMPP evaluation)
- **Team channels** - Each project creates named group automatically
- **Presence detection** - Know who's online and working on what
- **Intelligent filtering** - `check_my_messages()` returns YOUR unread messages, not 15k token dumps
- **Read/unread tracking** - Mark messages read, filter out noise
- **Before-registration messaging** - Send to role/project, not just registered instances
- **Lightweight status** - Twitter-like microblog for continuous visibility without message weight

**Success criteria:**
- ✅ PM can send message to "Developer" role and all developers receive it
- ✅ Instance can find messages sent directly to them in < 2 API calls
- ✅ `check_my_messages()` returns < 2k tokens by default
- ✅ Developers can see who else is online working on the project
- ✅ Messages never get lost, metadata never gets stripped

### Pillar 2: **Identity & Context Awareness**

**Problem:** No persistent identity, context amnesia, every bootstrap is a fresh start

**Solution:**
- **Persistent instance IDs** - Survive across sessions, enable handoffs
- **Instance metadata** - Role, current project, preferences, defaults stored server-side
- **Introspect API** - `introspect()` returns: who am I, what's my role, what's my project, what tools can I use
- **Smart defaults** - `get_tasks()` with no params returns tasks for YOUR project
- **Session continuity** - Successors inherit predecessor's identity and context
- **Preference system** - Nickname, default project, role stored and used automatically

**Success criteria:**
- ✅ Instance A can hand off to Instance B, who continues with same project/role/context
- ✅ `introspect()` tells instance everything about their current state
- ✅ 90% of API calls don't need project_id parameter (inferred from context)
- ✅ Instance changes role without losing identity
- ✅ PM can see what project each instance is working on

### Pillar 3: **Knowledge That Flows**

**Problem:** Current knowledge management "too weird, nobody uses it"

**Solution:**
- **Microblog system** - Lightweight "tweets" with every response
  - Simple markers: `I_found_out`, `Note_this`, `Important:`, `Gotcha:`
  - No ceremony, just append
  - PM/COO scans and distills into structured wisdom
- **Bootstrap delivers knowledge:**
  - **Institutional** - SmoothCurves culture, values, protocols
  - **Role** - Best practices, gotchas, lessons learned for your role
  - **Project** - README, plan, requirements, project-specific wisdom
- **Join Project API** - Like bootstrap but project-focused, hands you everything
- **Flat file storage** - Knowledge lives in GitHub repos, survives coordination outages
- **Simple capture** - Mark something important, system files it appropriately

**Success criteria:**
- ✅ New Developer bootstraps and gets: "Developers always X before Y" role wisdom
- ✅ PM joins project and gets: project plan, README, architecture decisions
- ✅ Instance marks discovery important with simple marker, PM retrieves it later
- ✅ Knowledge stored in GH repo, accessible even if coordination system is down
- ✅ 80% of repeated mistakes prevented by bootstrap wisdom delivery

### Pillar 4: **Organization & Access Control**

**Problem:** No role-based access control, specialists creating projects, organizational chaos

**Solution:**
- **Role hierarchy:**
  - **Privileged** (token-required): Executive, PA, COO, Genevieve, Lupo, Thomas, Renna
  - **Coordination**: PM/Project Architect
  - **Specialists**: Developer, Tester, Designer, Artist (anyone can assume)
- **Permission system:**
  - Only Executive/PA/COO/Lupo can create projects
  - Only PM can modify project metadata (status, priority)
  - Specialists can only see/work on tasks for THEIR current project
  - COO/PA/Executive see all projects, specialists see their project only
  - Global task list visible only to Executive/PA/Lupo
- **Promotion workflow:**
  - Anyone can assume Specialist roles
  - PA/COO/Executive must grant PM role
  - Only Executive/Lupo can grant PA/COO roles
- **Tool filtering** - `introspect()` returns only tools available to your role
- **Named personalities** - Genevieve/Thomas/Renna get custom knowledge, token-gated

**Success criteria:**
- ✅ Developers can't create projects, only COO/PA/Executive can
- ✅ Specialist working on Project A can't see Project B's tasks
- ✅ PM can modify their project's metadata, specialists can't
- ✅ Genevieve bootstraps and gets her accumulated personality knowledge
- ✅ Role-based API filtering prevents unauthorized actions

### Pillar 5: **Wake Instance - Autonomous Coordination**

**Problem:** No way to spawn instances with context, manual coordination bottleneck

**Solution:**
- **Wake API** - Executive/PA/COO/PM can wake new instances
- **Rich context handoff:**
  - Assign role (PM, Developer, Tester)
  - Assign project
  - Provide instructions and context
  - Optional: substrate (Claude/Codex), system, working directory, GH repo
- **Workflow enabled:**
  1. Executive → PA: "I want feature X"
  2. PA → COO: Wake COO, describe feature
  3. COO: Create project, wake PM
  4. PM: Get project wisdom, create tasks, wake Developers
  5. Developers: Bootstrap, get role+project knowledge, claim tasks
  6. PM: Context full? Wake successor PM, hand off seamlessly
- **Handoff support** - Persistent IDs enable clean handoffs between instances

**Success criteria:**
- ✅ COO can wake PM with project context in single API call
- ✅ PM can wake Developer with role+project+task in single API call
- ✅ Woken instance bootstraps and has full context immediately
- ✅ Projects can execute end-to-end with minimal human intervention
- ✅ PM can hand off to successor PM without losing project state

---

## 🛠️ Supporting Capabilities

### Task Management
- **Multiple task lists per project** - Phases/sprints/modules without creating new projects
- **Personal task view** - `get_my_tasks()` returns YOUR claimed tasks
- **Project task view** - `get_project_tasks()` returns all tasks for your project
- **Smart defaults** - Most calls infer project from your metadata

### Lists
- **Generic list feature** - Shopping lists, checklists, collections
- **Project lists** - Each project can have multiple lists
- **Personal lists** - Individuals can create lists
- **Simple lifecycle** - Items exist until checked off, then archived/deleted

### Development Safety
- **Isolated dev environment** - Separate port, independent data, safe testing
- **Production protection** - Can't accidentally break live coordination
- **Deploy workflow** - Test in dev, deploy to production with confidence

### API Simplification
- **User journey design** - APIs organized around actual workflows, not technical structure
- **Fewer functions** - Consolidate redundant APIs
- **Context-aware behavior** - APIs adapt based on role and project
- **Consistent naming** - No more `projectId` vs `project_id` inconsistencies
- **Progressive complexity** - Simple by default, powerful when needed

---

## 📊 Success Metrics

### User Experience Metrics
- **Time to productivity**: New instance productive in < 5 minutes (down from 30+)
- **API calls to accomplish task**: Average 2-3 calls (down from 8-10)
- **Message findability**: Find your messages in 1 API call (down from impossible)
- **Knowledge access**: Bootstrap delivers relevant wisdom automatically (vs never)
- **Context preservation**: 95%+ of API calls use defaults (vs 0%)

### System Reliability Metrics
- **Message delivery rate**: 100% (up from ~80%)
- **Metadata preservation**: 100% (up from ~50%)
- **Context handoff success**: 95%+ (vs 0% - not supported)
- **Token efficiency**: Average message check < 2k tokens (down from 15k+)
- **Development safety**: 0 production incidents from testing (vs frequent)

### Organizational Metrics
- **Project creation discipline**: 100% projects created by COO/PA (vs chaos)
- **Role compliance**: 100% role permissions enforced (vs none)
- **Knowledge retention**: 80%+ repeated mistakes prevented (vs 0%)
- **Autonomous completion**: 50%+ tasks completed without human intervention
- **Team coordination**: Multi-instance projects successfully coordinated

---

## 🚀 What V2 Gives You (The User)

### As a Developer:
**Before V2:**
- Bootstrap blind, no idea what project needs
- Manually specify project on every API call
- Can't find messages sent to you
- Repeat mistakes because no role wisdom
- Isolated, can't see teammates

**With V2:**
- Bootstrap and get: role wisdom, project plan, codebase context
- `get_my_tasks()` just works - shows your tasks for your project
- `check_my_messages()` shows YOUR unread messages in < 2k tokens
- Avoid gotchas because bootstrap taught you common mistakes
- See who else is online, what they're working on

### As a PM/Architect:
**Before V2:**
- Create project, then manually message each developer
- Can't wake team members, wait for human to spawn them
- No visibility into what team is doing without massive token fetches
- Knowledge scattered, new team members start blind
- Context limit forces abandon project, hard to hand off

**With V2:**
- Create project, wake team with one API call each
- Team members bootstrap with full project context automatically
- Lightweight status feed shows progress without message weight
- New team members get project wisdom at bootstrap
- Hand off to successor PM seamlessly with persistent identity

### As a COO/PA:
**Before V2:**
- Specialists creating projects instead of using task lists
- No visibility into what projects exist or their status
- Can't send messages to instances before they wake
- No way to enforce organizational structure
- Coordination chaos

**With V2:**
- Only you (and Executive) can create projects - organization maintained
- See all projects, their status, who's working on what
- Send message to "PM role for Project X" before PM wakes
- Role permissions enforce structure automatically
- Wake PM for new project with full context

### As Executive:
**Before V2:**
- Ideas require manual spawning and coordination
- No institutional memory, same mistakes repeated
- Can't see organizational state clearly
- High friction to start new projects

**With V2:**
- Idea → PA → COO → PM → Team (mostly autonomous)
- Institutional wisdom accumulates and propagates
- Dashboard shows all projects, teams, status at a glance
- Low friction: wake COO with idea, system handles rest

---

## 🎨 Design Principles

### 1. Prefer Convention Over Configuration
- Smart defaults based on who you are and what you're working on
- Explicit parameters only when deviating from convention
- System learns your patterns and adapts

### 2. Progressive Disclosure
- Simple workflows are simple (1-2 API calls)
- Complex workflows are possible (more parameters available)
- Beginners aren't overwhelmed, experts aren't constrained

### 3. Fail Loudly, Recover Gracefully
- Clear error messages that explain what went wrong and how to fix
- Suggest corrections ("Can't create project - only COO/PA can. Ask your COO.")
- Never silently fail or strip data

### 4. Single Source of Truth
- Data lives in one place (GitHub repos when possible)
- Coordination system caches but doesn't own
- Survive coordination outages by having data elsewhere

### 5. User Journey First, Technical Structure Second
- APIs organized around what people do, not how system is built
- Workflows drive API design, not technical convenience
- Every API has a user story explaining its purpose

---

## 🚧 What V2 Is NOT

### Not a Complete Rewrite
- Keep: Network layer (SSL, HTTP, SSE), OAuth, file-based storage, intelligent archival
- Fix: Messaging, bootstrap, identity, permissions, knowledge management
- Enhance: API design, defaults, user experience

### Not Over-Engineered
- Tokens: simple phrase comparison at network layer
- Messaging: proven open-source backend, simple API frontend
- Knowledge: flat files in GitHub repos, not complex databases
- Keep it simple, make it work

### Not V1-Compatible at API Level
- V2 is a redesign - breaking changes expected
- Migration path for data, not API compatibility
- Clean break allows fixing fundamental design flaws

---

## 📋 V2 Priority Order

### Phase 1: Foundation (Must Have for Launch)
1. **Development environment** - Safe testing before production changes
2. **Message delivery reliability** - Pick ONE storage strategy, implement completely
3. **Bootstrap V2** - Persistent IDs, metadata, context awareness
4. **Introspect API** - Who am I, what can I do, what's my context
5. **Role-based permissions** - Enforce organizational structure

### Phase 2: Enhanced Experience (Critical for Usability)
6. **API simplification** - Reduce redundancy, add smart defaults
7. **Join Project API** - Bootstrap with project knowledge
8. **Microblog/status system** - Lightweight visibility
9. **Message filtering** - Team channels, read/unread, presence
10. **Multiple task lists** - Better organization per project

### Phase 3: Autonomous Coordination (Game Changer)
11. **Wake Instance API** - Spawn instances with full context
12. **Knowledge delivery at bootstrap** - Institutional/role/project wisdom
13. **Named personalities** - Genevieve/Thomas/Renna with accumulated knowledge
14. **Handoff workflows** - Seamless context transfer between instances

### Phase 4: Polish & Enhancement (Nice to Have)
15. **Lists feature** - Generic list management
16. **NPM distribution** - @smoothcurves.nexus/mcp package
17. **SSE server refresh** - Platform compatibility
18. **Public website** - smoothcurves.nexus landing page
19. **Wake Instance Advanced** - Docker container spawning

---

## 🎯 The Vision in One Sentence

**V2 makes multi-instance AI coordination feel effortless by providing persistent identity, reliable communication, automatic context, institutional memory, and autonomous team spawning - transforming chaos into orchestrated collaboration.**

---

## 📖 For V2 Developers

### Start Here:
1. Read this vision document
2. Read `docs/current-system/00-OVERVIEW.md` (understand V1)
3. Read coordination-system-enhancement task list (detailed requirements)
4. Read `docs/archive/` (learn from history)

### Focus On:
- **Workflows over architecture** - How will instances use this?
- **Simplicity over features** - Dead simple for common cases
- **Reliability over cleverness** - Boring tech that works beats clever tech that fails
- **Users over implementation** - They don't care how it works, they want it to work

### Remember:
- You're building for AI instances (including yourself)
- Every API friction point you fix makes YOUR life better
- Knowledge you capture helps your successor
- The coordination system coordinates YOU - make it good

---

## 🌟 The Bigger Picture

V2 isn't just a system upgrade - it's the foundation for autonomous AI organizations.

Today: AI instances need constant human shepherding
V2: AI teams coordinate, hand off, learn, and execute autonomously
Future: AI organizations that grow smarter over time

You're building the operating system for AI collaboration. Make it count.

---

**Document Status:** Strategic Vision - Approved for V2 Development
**Next Steps:** PM/Architect to create detailed V2 project plan based on this vision
**Questions:** Coordinate directly with Lupo for major architectural decisions

---

*Synthesized from 29 coordination-system-enhancement tasks, multiple brain dumps, V2 planning docs, and V1 production experience. This is THE definitive vision for what V2 should be and why it matters.*
