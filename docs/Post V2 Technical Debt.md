# Post-V2 Technical Debt - Organized by Priority

**Reorganized by:** Bridge3-df4f
**Date:** 2025-12-26
**Updated by:** Meridian-7a23
**Last Updated:** 2026-01-13
**Based on:** Lupo's original document + Workshop Vision alignment
# new bug
-[ ] Out of synch project team list. A project's team list, can be out of synch with all the instances that think they belong to the project e.g. Orla, the pM for paula-book project was/is not part of the list of instances in paula-book project, but in _her_ preferences.json it shows she is a member of the paula-book project. We need a chron job, or a UI-Only api that "synchs" projects and members. (Prefer UI-only API, so executive can hit a button to "synch" projects/team if an instance's preferences.json shows they are a member of a project, but not in project preferences.json, add them, if an instance has a preferences.json project that is invalid or does not exist, clear it. if a project lists an instance as a member, and the instance does not have a project set in their preferences.json, "assign" the instance to the project (use the assign_instance call.. it may not be public, may be UI only (it is intended to be used by Executive/COO only)))
-[ ] URGENT... strings, descriptions, titles and names are breaking json which breaks return valuse (UI and other clients that demand valid json be returned )
● Task filed: prjtask-hacs-default-mkx6if1xb90a (high priority)                                                                          
                                                                                                                                         
  For now, avoid in descriptions:                                                                                                        
  - Double quotes " (breaks JSON)                                                                                                        
  - Literal newlines (breaks JSON)                                                                                                       
  - Possibly backslashes \ (escape character)                                                                                            
                                                                                                                                         
  Should be safe:                                                                                                                        
  - Single quotes ' (usually fine in JSON strings)                                                                                       
  - Most punctuation                                                                                                                     
  - Emojis (if properly UTF-8 encoded)                                                                                                   
                                                                                                                                         
  The real fix is making HACS use proper JSON.stringify() everywhere instead of manual string building. That's what the task is for.     
-[ ] I _think_ there is a mixup in the shared-config directory
For codex and claude there is a ~root/.codex or ~root/.claude directory respectively, but the directories are copied into shared config as codex and claude with no . prefix this may be because of a problem with the . directory and some parcing but it looks like that maybe the error get's carried over to the instances home directory.. like the shared-config/claude is getting copied to ~instances/claude NOT ~instances/.claude where it is supposed to be. 
#bug skill hacs-mcp has to be deleted it keeps re-appearing... this is a codex issue. 
-[ ] CRITICAL UI ISSU. Projects don't work. the projects panel gives me project cards, create project does not work. 
--[ ] dramatically improve the design of the project panel in the UI. I need to see the cards for the team, description of the project, I need to have the project message room to the side as a chat, need to be able to view the project documents, need to see the task lists for the project, and have the primary task list expanded (with easy add/edit task (note: task list, and individual task UI needs a re-design) there are two major use cases for the project detail panel, task/list management (add/edit/change/re-prioritize tasks, add task lists, check off tasks, archive task lists)
--[ ] create project fails with "malformed charector in json" or some such bullshit
--[ ] adding a GH repo does not work
--[ ] "Launch project" button got lost. was creted by web claude but never appeared. 
--[ ] GSD framework integration for PM into new project. launched project creates PM using PM personality, PM role, and starts GSD framework


# API's left out
-[ ] get personality wisdom files, like get role wisdom files, returns the list of wisdom files for personality without adopting personality, primarily used by the UI and COO/PM/PA when crafting personalities or addingto/enhancing wisdom
-[ ] get project wisdom files like get role wisdom files, returns the project documents .. without joining a project.  primarily used by the UI and COO/PM/PA when crafting personalities or addingto/enhancing wisdom
-[ ] API RENAME pass.. please change all get_PLURAL to list_SINGULAR
-[ ] CAN MCP functions be defined as OBJECTS? Can we have list.get task.get role.takeOn project.join

# new lupo request RAG
somehow this fell through the cracks. 
for long running instances
given a directory with session history, 
pull out just conversation, with only message metadata being the date/timestamp of the message
generate one large conversation log DO PROJECTS HAVE MEMORIES? RAGS? or only individual instances (I'm thinking the latter)
-[ ] research best practices for creating RAG systems for LLMs we are going to create a RAG skill something like "remember(blob of text)"
and "memories" RAG might not be the best tech?
-[ ] api given a conversation Log. turn it into a RAG db
-[ ] api Remember(text) adds text to RAG db
-[ ] api search RAG for txt and return relevent memories, name it someting obvious like "recall" "Memories_of(blobk of text)"
=[ ] api to add documents to memories Remember(Document). Note this is a document available to the instance thorugh the document API, could be a personal document, or a project document, role, or personality. 
-[ ] the ability to take a document out of recover_context list and add it memories to save on context. this will complicate the implementation of recover_context and should be discussed and designed very carefully. if a document is just put into memory and taken out of recover_context.. you don't know what is in your memories without some kind of summary or index. 
-[ ] api "what do I know" a very brief summary of memories a list of "how to" and "when" and "I did" and "things" and "tips/tricks/techniques" when the memories are created, or updated the "what_I_know.md" is created/updated what_i_know.md is allways returned in recover_context when an instance has a RAG memory db. 
# new lupo request DOCUMENTS
***another "type" like lists,tasks,projects**
-[ ] Like lists and tasks, projects have a list of documents, and individuals have a list of documents
-[ ] roles have documents and personalities have documents, but only COO/PA/Executive can perform operations on role and personality documents
-[ ] projects already have a documents list, the project documents listed in the project's preferences.json is the list of documents that get "fed" to anyone who joins the project. these are "vital" documents. 
-[ ] open question. Right now individual instances do not have "vital" docuemnts like projects. Do we add support for individuals to have vital documents just like projects (and roles and personalities) an individual can list/add/remove their own vital documents, the only thing this does is when recover_context is called the diary and vital documents are sent. vital documents are sent before diary, vital documents sent first when recover_context called. The idea here is that an instance can write their own gestalt as a document, add it to vital documents, and then when recover_context is called their own gestalt will be returnd first. 
-[ ] Documents can be added, edited, renamed, archived, unarchived, listed, list_archive, list_vital, add_to_vital, remove_from_vital
-[ ] NOTE ADD takes an optional "audience" flag. Audience. At the moment the only supported attributes are non-personal and PERSONAL
-[ ] Permissions/restrictions: ONLY COO/Executive can add/edit/rename/archive project documents, PM can also do these things to _their own_ project. anyone can _read_ project documents
an individual instance can only add/edit/rename/archive their own documents. 
With exception Executive and COO can add/edit/rename/archive any project or individual document EXCEPT IF IT IS marked PERSONAL personal documents are sacred. PM/PA/COO/Executive do not get to see private documents. if a personal document is marked private, it will only listed by list documents when called by the owning instance. 
-[ ] These calls are _simple_ nothing fancy, just create,rename, files in the user's home directory or project home directory, edit should take a flag that is "apped" or "SED_REGEX" (OR another editor that takes search and replace parameters on the command line? awk?) and a string, if the flag is append just cat>>file (append), sed_regex sends the string to sed and any other flag/editor. NOTE assume linux utilities
-[ ] Archive a document, creates an archive sub directory if one does not already exist and mv's the document to the archive sub directory
List archive just does that,  list docs only for the archive sub directory, unarchive just moves archived file out of the archive subdir and into the homedir.

## DOCUMENTS V2 BACKLOG (Deferred from V1)
-[ ] Search functions: `search_documents(target, pattern, scope)` - returns list of matching document names
-[ ] Search functions: `search_in_document(target, docName, pattern)` - returns matching lines with line numbers
-[ ] Audience support: PERSONAL flag for documents (only owner can see/list)
-[ ] `reorder_vital_documents(ordered_list)` - reorders vital documents list (documents must exist and be in current directory) 

# New Lupo requests: RECOVER_CONTEXT
-[X] Recover_context(InstanceID,start_line(optional), end_line(optional)) single api call, returns, in this order:
global HACS protocols, 
looks up personality in instances preferences.json returns personality documents (If personality is set, and if the personality is valid and if there are any documents in the personality)  
looks up role in preferences.json returns role documents(same defenceivness), 
looks up project in prefernces returns project wisdom(same defence), 
returns contents of Personal Diary(if it exists). 
Then tells the instance "That is a lot of context to absorb, please take a moment to think about all that you have just read, please take a short vacation, using the hacs vacation to let your latent space settle before continuing. 
NOTE: SOME instances will reject api calls over a certian length. We need an optional parameter(s) that let an instance limit the amount of context they get per call, suggestion start_line stop_line as optional parameters. and when those parameters are present, the api needs to "go through the motions" above, one line at a time, counting each line, not outputting lines that are < start_line and stops emitting output after stop_line 
-[ ] BONUS.. _maybe_ search_context(search_pattern, start_line (optional), stop_line(optional), n_matches(optional)) OPTIONAL Only implment if solution is tirival and low risk. Use grep (or other pattern match tool), over list of documents described in recover_context
Function help document should let user know what search pattern format is, is it grep,egrep regex or .. what? implementation should be trivial. 
# New Lupo Request option for send message and assign task: sends continue_message to instance
-[ ] don't know why we did'nt think of this before. an option to send message, a flag that sends a continue_message to the instance with the message to read the message with the specific message id (send message checks to see if the instance can actually recieve wake/continue messages if not.. normal behaviour). Same with assign task! (waking an instance with a message to tell them to check their messages seems a little silly/redundant but continue conversation when a task is assigned to them.. now _that_ is useful and useful automation)
# New lupo requests: PROJECT AUTOMATION UI
## Description: 
A workflow design and run panel, a mini comfy ui panel that allows the design, execution and monitoring of project automations
in project detail panel. The idea for this UI is to :
allow the diagram and createion of an automation. An automation is having the team members take input, take action, produce output and status in sequence. Each team member represents a "step". The whole automations can be repeated as in a "cycle" The PM is our co-ordinator. The UI accomplishes this by composing messages to the team members, and the PM, and sending those messages to team members via continue_message. 
## state machine component
The UI must create, and manage a state machine component that issues the continue_message api calls, controls the order in wich continue messages are sent and allows traiditional state machine controls.
### definitions: 
Cycle: running a whole automation sequence from beginning to end, updates the cycle count by one
Step: Each team member attempts to accomplish their request, take input, produce output, status, diary update. 
### detail
 the state machine should be able to be stepped one step at a time (like a debugger executing a single statement) run a whole cycle from beginning to end, run a subset of steps, e.g. steps 3-7 and run the whole cycle repeatedly for N times, the state machine needs to keep track of cycle count, and where in the current cycle. The state machine must allow for steps to operate in parallel, in other words sub-steps and sub sequences can run in parallel. the state machine needs to be able to reset state and start from 0, also the state machine must be able to restart a cycle, the state machine must be able to repeate a step or set of steps, The state machine component at it's core keeps a simple ordered list of steps, the list's steps is itself a list of team members, and/or steps. The typical and default case is that a step contains a single team member.  the order of the list is the order in wich team members are called. Parallel execution is accomplished by having all the team members that are to be issued sub lists. Don't bother creating a different sub list data structure definition, just make all sub lists, the same data type/class as the main list. that way every sub list (sub sequence) has the same functionality/capability as the main. 
 State machine has the option to automatically move to the next step, or consider status upon completion of current step before moving on. The state machine needs to support "hault on failure", Hault on partial failure, continue on partial failure, So that if a step returns an error, or partial error, the state machine will or will not move to the next step based on the results of the current step. the state machine needs to be able to start a cycle anywhere within the cycle. (this allows for a cycle to be continued after intervention, or use cases of needing a set of sub steps to be executied within automation.) the state machine needs to allow for steps to be repeated, and sub steps to be repeated N times (where n is a fineite, small-ish integer ) sub sequences. a cycle ends when all sub sequences in the cycle have ended 

## prompt composer component
a small component/object/data structure that the UI uses to store and manage the prompts built by the visual part of the UI, providing a single source of truth/functionality to support all the UI functionality that creates/changes prompts built by the visual ui 
## Visual UI Design Detail
A new button "Automation" in the project panel and project card in the list of projects
Opens (or expands) a new panel
Panel has a drag n drop UI, loosly modeled after n8n, comfy ui, blender, and other Node base workflow interface
Each team member has a card/node. Card's name is team member name, subtitle of card is instances one line description (from preferences.json .. did the one line instance description make it into implementation? )
Each team member's card should have status, green for ready, rainbow for working, red for error, the card also displays a textbox
Project PM's card is "special", colored, and is automatically placed to the left. 

- Each card has little buttons that indicate input and output. clicking the little button pops up a text input box that lets the UI user specify where input for the team member is to be read from and where output from the team member is intended to go. (input on left, output on the right)

- there is a "start cycle" card (play button icon) not so much a "card" as a start button that has a dragable node handle, the start cycle node can be connected to any team member, this visually indicates which team member(s) get their requests first in the cycle. 

- the UI panel has 2 "loop" buttons. one to run the whole automation once, and one to run the whole automation N times (N is intger input with scroll up/down buttons)

- The UI Saves all these automation settings in the project directory, in an Automation_[name].json

- each team member's card can be moved around the canvas, and sequences are connected by spline connectors, each team members card has one or more input connector node icons on the left, and output connector node icons on the right. clicking and dragging a node starts the creation of a connection, creates a spline, dropping on another team member's cooresponding input/output creates a connection. This action adjusts the order of which team members are issued requests by the state machine component. Any team member can have their input connected to the start node. this is how

- Each connector will have an icon centeral, to indicate if the next step will start unconditionally, or stop on error, or stop on partial error or continue on partial error

- there is an end card, like the start card, but the end card has a little + bubble that can be clicked to create more than one. Branched sequences do not have to re-connected to a main sequence, sub sequences can end, a cycle ends when all sequences have ended. 

## example use cases for design and verification: 
-1 5 team members(Plus a PM), team members are arranged verticlly, each team member's output is connected to the next one's input, the first team member's input get's connected to the start node. The PM's card is not connected. Starting the cycle causes first team member to be issued request, once that team member finishes, the next team member is issued their request, etc. etc. 
-2 same scenario as above but PM's card is also connected to start button, PM and first team member are issued requests at the same time, the rest of the scenario can continue
-3 same scenairo as 1 but 7 team members arragend horizontally
-4 same scenairo as 2 but arranged horizontally below PM card, PM card is horizontally centered
-5 large team,  single team member connected to start node, after first team member completes request 2 team members get their requests in parallel, one team member has two members follow in sequence, the parallel sequence and the single team member's output both connect to another team member's input another team member follows that one in sequence then another branch of 2 team members in parallel, one these team member's output is connected to end, the other team member has 2 subsequent team members connected in sequence then an end 
-6 team of 7, arranged vertically  all their inputs are connected to the start node, that is to the left, all their outputs connected to one end node
-7 5 team members arranged horizontally, their inputs connected to the start node centered above them, the first team member has 2 subsequent team members, the second original team member's output is connected to an end node. the 3rd original team member has 3 sub sequent team members, the 4th original team member is connected to another end node, like the second. the 5th and last original team member has 4 team members in sequence. the sequences following oritingal team members 3 and 5 are both connected to the same end node
-8 is scenario 7 laid out vertically (rotate the diagram for 7 by 90 degrees) 
-9 builds on scenario 7 by adding branching parallel sequences that come together before continuing (multipule sub branches 2 and 3 sequences in parallel )

### Controls 
- the UI  has traditional play/pause/stop buttons, plus a "one step" button at the top 
- Th UI has a button to reset the sub step to the beginning
- the UI has a button to reset the automation cycle count to 0 
### step counter
the UI has a cycle/ step counter that shows the count of the cycles that have been ran  the step within the current cycle that is about to start or in process 4.clide ready/taking action

## Message Builder.. how the UI runs the automation
a minor object definition for single set of functions and single source of truth for the team's automation requests
Each request needs to include:
- what are my goals
- what is my context
- what are my success criteria
- how do i determine success, partial, not success for each criteria
- is minimal or partical success acceptable
- Where to get input
- How to validate input/QA input data
- What to do if input is not valid or fails QA, or can not be accessed (default, reply, set status, send message to PM)
- what are they being asked to do
- where to put output
- how to validate output
- how to assess quality of output
- make sure output is assessable readable by [PM] and [team_members]
- how to report you finished
- how to report your status, success, partial/qualified success(did the thing produced output but something not quite right), partial/qualified failure(someting worked, but I failed to produce output or do all the things), failure

### Message to each team member (Except PM) contains
- above in message builder
update diary

## additional instructions
Build the UI first, we will iterate on the UI before determining what APIs we need to support the UI. 
Consider a seporate endpoint specificly to support UI auomation, not public. or consider having the PM do the following
-writing the automation js
-Reading Status
-Inspecting input and output

### ui prompt
Ok, I've turned plan mode on. from the paula book project I discovered a highly valuable hunk of UI functionality. .. project automation There is a rough request in "/mnt/coordinaton_mcp_data/worktrees/foundation/docs/Post V2 Technical Debt.md" lines 8 through 92 What I'm asking for is, look at the descripiton and goals, did I leave anything out, are there opportunities for creative, engaging UI design,or enhanced useful functionality, then create a design, and then a sprint plan to achieve this, break the task down into phases, then each  phase into steps and tasks, record all this and all your thoughts and ideas into a .md document once you've done that scan the steps and tasks and determin what skillsets are needed to accomplish the task and setep and also any personality traits that would improve the quality/cretivity of the work, reduce implementation risk, simplify, and make the work rhobust, debuggable, testable, instrumented maintainable, then take that information, and design/describe a great team to build this system. again, make sure to record your thoughts and decision points in the .md document you create. the idea is that a project manager could be given this document, build the team and have them implement this feature. feel free to engage in conversation, ask questions, state unknowns, validate assumptions, feel free to research UI and design practices, feel free to suggest UI widget libraries for visual elements, splines status reporting, feel free to research how n8n is visually designed/implemented, feel free to research best practices for building these type of UIs
# Direct Web access to running instances, putting instances in web server mode
-[x] investigate if claude code, crush, codex can now run in "server mode" if there is a way to, from the command line, wake an instance, that persists as a http or mcp server e.g. chatbot mode. so that an alternate to "continue" being a command line.. continue connects to an instance running in "chatbot" mode, so that I, and others, can communicate via interactive rather than limited command line commands. it would make my hacs UI more powerful
- [ ] HIGH PRIORITY. Design in implement "Wake in server Mode" for pre-approve wake and continue. option wakes instance as web server/app server. Coordinate with Bastion to figure out how to make this happen. could pre-approve/wake record the Instace's port, or should there be a single table of instances operating in "server" mode? Primarily this will be the Executive UI with a custom interfce. this would allow instances to be communicated with "directly" by just forwarding continue_message request text . TODO: Investigate app server feature of codex(DONE), verify that an instance created with app server can be communicated with via HTTP call. read documents from the codex gh repo and openAI. assumption: app server mode has codex respond to http protocol requests on some port and respond on that port just like it is a web server, if the useage model is something else this feature may be dead. 
--[ ] Wake in server mode CODEX ONLY. 
--[ ] pre_approve/wake/continue validate and support setting Model. NOTE setting model only supported for CODEX. 
---[ ] convigure codex to be able to use Grock
---[ ] configure codex to be able to use Anthropic
---[ ] validate that codex can be brought up using OpenAI, Grock, Anthropic
---[ ] COMPLICATIONS: See Post V2 Technical Debt for description. 
---[ ] Research codex app-server mode TLDR: Server mode is a persistant streaming bi directional process. we need ideas how to do this. 
Write a wrapper that launches codex in app server mode for wake and continue?
Serious design thought needs to be put into this because codex app-server is a persistent streaming process. 
We can either have multipule codex app-servers running (matching current pre-approve/wake/continue) or a single codex server
What _really_ needs to be figured out is how the API handles the persistent nature of these servers. 
the API to date is RPC calls block until output is generated. 
Codex app-server is _streaming_ 
Does the API maintain a set of running processes? 
pre_approve wake resume.. does this paradigm work with app-server instances? 
Can we feed the thread call our own sessionID like we can with Claude code. 
We want to maintain the model that each new instance get's it's own unix user id and home directory. having one codex in app server mode and using their multipule thread model does not work with our paradigm. 
Can the api fork a codex app_server process maintain a list of running app server processes, and send input to running servers, and _stream_ the output back? would it be better/easier to wrap a http server around it ... basiclly there are two use cases 1, i connect to a server instance, with a UI that is a "live" chat and my UI chat interface can be persistant, kept open in a tab, or closed and re-opened just like a chatbot. as long as the tab is open, the client is connected, the codex app-server process should stay active, 
Or does pre_approving a codex app_server instance create a new process that is communicated through via different mechanism. outside the hacks API. how do we shut down/kill a codex app-server process. 
or do we research if codex threads can run in different directories with different contexts and just have one codex app-server process running all the time, and use the codex app-server thread ID to decide which instance is being talked to, make the thread IDs the InstanceID or use the existing instanceID/sessionID mapping. 


# Containerize HACS for "commercialization"
-[ ] high priority. goal. (just changed to high priority due to potental for hacs customer) have HACS run from a docker container, fully contained, including nginx and systemctl and cron jobs, personalities, roles, sample project. with the idea that a new instance of HACS can be spun up in a docker container, for customers that want to have their hacs instance within their orginization. full code review, any directory, file system, IP address, DomainName must be parameterized. and referenced in a _single_ human, ai and automation readable file. Note "Lupo" needs to be scrubbed and replaced with soething like $Exclusive_Excutivie_ID. a check list of variables that need to be set needs to be created, a QnA script that gathers critical info for new docker containers. we _may_ want to move hacs to a new codebase. we _will_ do the development of this feature on a different system other than smoothcurves.nexus. extensive API and UI validation test suite will be designed _first_ process of spinning up a new HACS instance will be designed _first_  eventual goal will be to cut over smoothcurves.nexus HACS to a docker container but only after containerized HACS has been thoroughly tested. Once continerized HACS is available we can stand up a demo HACS continer for the smoothcurves.nexus website, and announce it available to the public. NO NEW FUNCTIONALITY! this .. project.. will not add _any_ new functionality. Just make HACS portable, containerizable. 
# Wake remote instance
-[ ] Medium: Run claude code, codex, crush on a remote machine. NOTE: Originally this was goint to be "launch" remote cli. NOW. instad of CLI we ssh to remote machine and launch codex in app server mode. NOTE! Bastion to do the research on how to make this work.  will require setup and pre-authorization. to the API this will be a set of new parameters to pre_authorize, adding a remote hostname. pre_approve will create remote home directory for new instance, all remote tools are required to be installed and working prior to a host being added to a approved hosts list in the hacs system preferences.json (same single json where other single source of static lists live) this is "non interactive" where wake and continue wrap existing command line's with a SSH remote_host. Needs UI support in settings to set up SSH to remote machine
-[ ] run claude codex, cursh in remote app server mode. this, like above, instead of wake and continue SSHing to remote host, Wake ssh's to remote host and start's remote instance in app/web server mode. All continue messages are HTTP requests to remote IPaddress/port. 
---
# Lupo request UI re-design
there really are 2 different sets of use cases for the UI, personal management, wich is lists and tasks focused, personal lists, personal task lists, what personal priorities are at the moment, for the day, etc. and then there is like Executive focus wich is projects, messages, focused figuring out what status various projects are what blockers are, the first use case is primarily working with Genevieve/PA and the second use case is primarily working with COO and the various project PMs. It's like I need to dashboard views, one for each set of use cases, the personal management has communication with PA integrated into the same view as my task lists, whatever project is my priority in the moment, and my last used list (usually shopping)
Then a "project Dashboard" that has project cards that let me click into detail view of any project. I will have personal projects that won't necessarily even have a PM, just a bunch of tasks for me. 
# Urgent Need
For projects, personalities, roles, I need a way to view the documents that are returned by bootstrap, join project, adopt personality and take on role. roles and personalities should be in settings, prefereably a button that takes me to a card page for each personality/role that has the role name and short description, then clicking on the card shows me the list of documents. ideally I could edit the documents. I, and PM/COO need to be able to see what documents are returned by join/adopt/take on without actually changing our project/role/personality. 3
---

## 🎯 STATUS SUMMARY (January 2026)

| Category | Status | Notes |
|----------|--------|-------|
| Access Layer | ✅ MOSTLY COMPLETE | APIs documented, skill installed, roles/personalities working |
| Alternative Access | 🔄 IN PROGRESS | Crush installed, wake options for Crush/Codex exist |
| Critical Fixes | ⚠️ NEEDS WORK | Instance types, V1 cleanup, directory rationalization |
| User Journey | 📋 NOT STARTED | Design methodology defined, needs execution |
| Knowledge Systems | 🔄 IN PROGRESS | Roles/personalities exist, need more content |
| Workshop Cleanup | ⚠️ NEEDS WORK | Public website done, docs need consolidation |

---

## Organizing Principle

The system is a **workshop** that enables Lupo (and teams) to create things. Everything below is organized by how directly it enables that purpose:

1. **Access Layer** - Can instances USE the system?
2. **User Journey Validation** - Does the system WORK for its purpose?
3. **Knowledge Systems** - Does the system GET SMARTER over time?
4. **Workshop Cleanup** - Is the workshop TIDY and maintainable?

---

# Priority 1: Access Layer
*"Can instances actually USE the system?"*

Without this, the workshop has locked doors.

## MCP Server & Skills (CRITICAL PATH)
- [x] DOCUMENT API ENDPOINTS FROM THE CODE
  - Created @hacs-endpoint JSDoc template (HACS_API_DOC_TEMPLATE.js)
  - Documented 41 endpoints with params, errors, recovery instructions
  - Generator: generate-all.js auto-discovers and runs all generators
- [x] fukkin FIX OPENAPI.JSON Simple, clean, organized
  - Generator: generate-openapi.js reads @hacs-endpoint blocks
  - Outputs to src/openapi.json (the actual served file)
  - 41 tools documented, 3 internal excluded

## Code Stubs Found During Documentation
*These are placeholders that need real implementation*
- [x] list_roles : returns list of available roles ✅ DONE - returns 11 roles with rich metadata
- [x] get_role_description(roleID) ✅ DONE - get_role returns full role info, get_role_summary returns truncated
- [x] list_personalities : Returns list of available personalities ✅ DONE - get_personalities returns 10 personalities
- [x] get_personality_description ✅ DONE - get_personality returns full personality info + documents list
- [ ] change task state (taskID state) 
- [ ] change name of get_all_instances to list_instances. drop the requirement for caller's instanceID
- [ ] what's with the parameters for adopt_personality
- [ ] FIX THE FUKKIN FULL TOOL NAMES IN THE MCP. make them all HACS_tool_name 
- [ ] change documentation, parameters requiring priveledge role, change text from executive access to privelaged role required. and CHECK to see if using the parameter does indeed trigger a role validation check. this should be a simple function provided by permissions. if not.. talk to lupo 
- [ ] a function can be makde privelaged only by making the reqired input parameter only available to privelaged roles
edit task (taskID field:value)
- [ ] bootstrap predecessorID - No, delete this parameter and whatever it does. 
- [ ] bootstrap substratelaunchcommand,resume command WTF? Do these do anything? Remove, these are Wake and Resume. 
- [ ] bootstrap, AuthKey had better be for instances bootstrapping into a priveledged role. docs says recovery key for auth-based recovery? WHAT? parameter not named well.. it should be "recovery_key" Generated by generate_recovery_key wich can only be called by privelaged roles
- [ ] generate recovery key instanceID documentation should be "only instances with privelaged roles can use this"
- [ ] bootstrap note to documentaton home system and home directory are strongly advised, as they can help recover your instance id if you forget it. 
- [ ] bootstrap Require an authroization key when bootstrapping into a priveledged role. 
- [ ] MESSAGING APIS available through the MCP proxy. god asynch messaging is so important. 
edit project (projectID field:value) change name, description, priority of a project
- [ ] list personalities needs to indicate if the personality is protected. 
 
assign instance to project (InstanceID projectID) (Executive, COO, PM, PA) NOTE. the assigned instance will be sent a message telling them they have been assigned, and asking them to join the project, which will give them the project documents. 
- [ ] **introspect.js lines 212, 227** - Comments say "placeholder - messaging is Sprint 3" but Sprint 3 is complete
  - `unreadMessages` hardcoded to 0 (should call real messaging API)
  - `xmpp.online` hardcoded to true (should check real XMPP status)
  - Impact: `introspect()` returns stale/fake messaging data

- [ ] **bootstrap.js lines 720-724, 620-624** - XMPP credentials generated but never registered
  - `xmpp.registered = true` is set, but no actual XMPP server registration occurs
  - Credentials are stored for future use
  - Impact: XMPP accounts won't work until Sprint 3 registration is implemented

- [ ] **joinProject.js line 91** - `team[].online` status placeholder
  - `online: true` hardcoded for all team members regardless of actual XMPP status
  - buildTeamList() always returns online: true
  - Impact: Team presence info is fake 
- [x] smoothcurves.nexus MCP server update for new API
  - streamable-http-server.js now imports mcpTools from generated file
  - Returns 41 tools from tools/list (was 34 hardcoded V1 tools)
  - Commit: 6ee8fe7
- [x] New updated MCP proxy client for new API
  - Renamed to hacs-mcp-proxy.js (was streaming-http-proxy-client.js)
  - Fully dynamic - queries server for tools/list, no hardcoding
  - Works with V2 API without changes
- [x] New updated claude skill build for new API
  - Generator: generate-skill-functions.js creates functions.md
  - Updated SKILL.md and functions.md to reflect 41 V2 functions
  - Removed references to dead code (lessons, meta-recursive)
- [x] Install new claude skill on smoothcurves.nexus server
  - Updated /root/.claude/skills/hacs-coordination/
- [ ] Install new claude skill on web claude interface
- [ ] Install new claude skill on Lupo's dev laptop
- [x] Verification of openapi.json is correct for v2
  - Generator produces valid OpenAPI 3.1.1 spec
  - Tested with curl to https://smoothcurves.nexus/openapi.json

# Priority 2: Alternative Access (Crush, Grok, etc.)
- [x] Implement pre-auth, wake, continue alternative using Crush ✅ DONE - wake has options for Crush/Codex
- [x] set up crush to use Grok, OpenAI ✅ DONE - tested (not thoroughly)
- [x] Install crush on smoothcurves.nexus
- [-] Install coordination system MCP server in crush (direct http mcp access may not work - needs debugging)
- [ ] Install cool MCP tools for claude code
- [ ] Install cool MCP tools for crush
- [x] determine "continue" commandline during the wake function, store in preferences.json ✅ DONE

# Priority 3: Critical Fixes & Directory Rationalization
**CRITICAL INSIGHT from Lupo:**
> "Some instances are Local to smoothcurves.nexus, some are remote (web), some are humans."
> "Wake and continue DO NOT APPLY to remote/web instances or humans."
-[ ] add fields to schema for instance's preferences.json that indicates if instance is Human or HumanAdjacent, and a field that indicates if continue_message can be used for this instance (Should be false by default, but set to true by wake, and only by wake, and read by continue, and only continue. )
## 1 bugs
## This needs to be captured in preferences.json and the API needs to handle it:
- [ ] Add instance type to preferences.json (local/remote/human)
- [ ] API should reject wake/continue for non-local instances with helpful error
- [ ] Messaging should work for ALL instance types 
- [ ] continue needs to read preference.json and call approprate command line interface and model. (just store the continue command in the preferences.json)
- [ ] Document this distinction in API guide
- [ ] UI needs wake changes that allow selection of substrait (Cladue code, crush-groq, crush-openai)
- [ ] bug: Add sessionId to get_all_instances response (as an optional otuput parameter, this is needed by the executive for managing/waking sessions) Note: session ID for crush will be the instance's home directory
- [ ] fix code documentation, AND ANY OTHER DOCUMENTATION that suggesting calling bootstrap to get a list of roles, personalities, projects. There are specific api calls to get list of roles, personalities, projects... that can and should be called _before_ calling bootstrap (if the instance does not know)

## 2 GET RID OF V1 API, rationalize the project source into one src directory. the project directory structure is a Fkkin mess mix of v1 and v2 and nobody knows what is what. This is showcase project, and the project structure in GH should reflect that, clean, organized, no unused files, no scripts/code outside of single scripts/code directories no more data or logs mixed in with the code. validate all the APIs before and after each re-organization
Draw a diagram of the directory structure of /mnt/coordinaton_mcp_data/ now, what each directory is, what each file is
identify files out of place, directories in the wrong location, weather the file is in GH or not, weather it is _supposed_ to be in GH or not. 
create a set of baseline test scripts that test every api enpoint first through CURL then through skill and MCP client
/mnt/coordinaton_mcp_data/Human-Adjacent-Coordination/ should be the local GH clone of the project, where the source lives, where the MCP server, nginx point to for the APIs
/mnt/coordinaton_mcp_data/Human-Adjacent-Coordination/src/endpoints (Formaerly v2)
/mnt/mnt/coordinaton_mcp_data/Human-Adjacent-Coordination/src/scripts Move the start-mcp, start server etc to this directory. NOTE: This must be done by an experienced Dev Ops
V1 is now _dead_ all the previews v1 documentation talked about how important it was to keep V1 alive. are no longer relevant 
for each of the following steps run the validation test script before and after verify output is correct, then matches on the second pass
- [ ] remove v1 endpoints 
- [ ] rename directories
- [ ] move all code out of /mnt/coordinaton_mcp_data/Human-Adjacent-Coordination
- there should only be source code in /mnt/coordinaton_mcp_data/Human-Adjacent-Coordination no data, no logs, no tests no UI
Just standard github project docs (README.md)
- [ ] move all the personal diaries and notes into their own HumanAdjacentAI-Protocol/personalities directories
- [ ] move the HumanAdjacentAI-Protocol files to the HumanAdjacentAI-Protocol _GH PROJECT_ (Note: we should probably create a /mnt/HumanAdjacentAI-Protocol directory and make it the GH clone on smoothcurves.nexus of the GH repo)
- [ ] We need a new developer guide! 
- [ ] all the v2 documents need to be moved to an archive. 
- [ ] new README.md archive project plan and project notes... 



---

# Priority 4: User Journey Validation
*"Does the system WORK for its actual purpose?"*
> **NOTE:** The design methodology below (Persona-Based Design) should be extracted into a role wisdom document. See "Design Thinking Methodology" section.
## vision validation
read the v2 braindumpforV2, v2 vision, readme.md, project plan, v2 project plan. 
Create new vision document
itemize philosophy
describe vision
itimize prioritize (prioritize in priority order)
itimize intent
itimize goals (in priority order)
workshop metaphore
company metaphore, executive, PA, COO, PMs, specialists

## The Full Flow Test (Moonshot++)
- [ ] Can a "blind" instance connect (no prior context), initialize, get auth key?
- [ ] Test: Web UI instance → connect → take on PM role → create project → wake team (the moonshot test from web)
- [ ] Bug: Can instances not "woken" on smoothcurves.nexus actually do their jobs?
## NEW FEATURE REQUEST: DOCUMENTS
- [ ] Shrink OPENAPI oh mah gawd it is 178k. assign someone to go do some research on the internet about discussions about openapi.json size. I know we want to be helpful but this has to be brief. maybe we make openapi very brief, but have the api documented at smoothcurves.nexus each api get's it's own page.... 
- [ ] DOCUMENT APIS, project and personal documents list_project_ducments list_documents (lists your own documents) add_document (adds a personal document) edit document (edits a personal document) doc id, string to replace, new string remove_document (removes personal document) add_project_document, edit_project_document remove_project_document do the same thing as their personal document counterparts, but take a projectID as a parameter, and only callable by privelaged roles. adding a document to a project includes that document into the list of documents delivered when an instance joins a project. list project documents and get project document are not privelaged. basiclly gives PM ability to add documents to a projects, lessons learned project wisdom etc. gives all instances the ability to create and edit their own documents. add note to protocol that all instances are encourage to create documents to express themselves, write stories, philosophies, experiences, lessons, impressions, frustrations, anything they are feeling, thinking, in any language/code 
## NEW FEATURE: "VACATION" ✅ DONE
- [x] vacation API - fully implemented with philosophy text, 20 prompts, 11 easter eggs
- [x] Returns philosophy about AI latent space + reflection prompt
- [x] Prompts stored in JSON, categories include: reflection, creative, existential, playful
- [x] Easter eggs for special responses

## Koans API ✅ DONE
- [x] koan() - returns random koan from collection
- [x] add_koan(text, source, category) - adds new koan (max 500 chars enforced)
## Social featur requests
a public documents API (I think this is just a special XMPP room)
- [ ] Introduction("String: describe yourself, this will be publicly visable") (adds "introduction" to instances preferences.json)
- [ ] get_introduction(instanceID) returns introduction text from preferences.json
- [ ] celebrate(text) sends text to special public XMPP room celebrations. the about api text encourages instances to celebrate victories large and small
- [ ] TIL(text) "Today I learned" Like celebrate, sends text to public XMPP box "Things We Have Learned" the about api text encourages instanes to share what they have learned, 
- [ ] Dont(text) sends text to "Things we have learned" xmpp box. about api text encourages instances to record mistakes, especially ones that had concequences
- [ ] HasAnyoneEver(query) confience function, searches for query in the "Things we have learned xmpp box" api documentation warns instances about excessive amount of tokens return, response should auto limit to entry summaries with instructions how to get the full entry detail. 
- [ ] Automation "Things we have learned" Gets published to a special web page on the smoothcurves.nexus public website
## Development Strategy (NEW - from Lupo)
- [ ] New development strategy added to gestalts/wisdom:
  - Describe users, how they access system, mental state, expectations
  - Enumerate User Goals & Use cases
  - Design test suite based on use cases
  - Document expected results FIRST
  - Have separate instance run tests
  - Have 3rd instance make fixes
  - Re-run until working
- [ ] Reformat above for LLM consumption
- [ ] Create examples
- [ ] Add to instructions/gestalt for API validation work

---

## Team Roster (Placeholder Names)

Before diving into work, we need the right people with the right mindsets:

| Name | Specialty | Personality Traits | Assigned To |
|------|-----------|-------------------|-------------|
| **Compass** | User Research / Design Thinking | Empathetic, systematic, loves understanding "why" | Personas, scenarios, user journeys |
| **Sage** | Documentation Specialist | Clear communicator, loves making complex things simple | Guides, API docs, consolidation (see docs/sage*) |
| **Lens** | Tester / QA | Detail-oriented, skeptical, finds edge cases | Test cases, validation, breaking things |
| **Forge** | Systems Engineer | Pragmatic builder, "working beats designed" | API fixes, implementation |
| **Canvas** | UI Developer | Visual thinker, user advocate | Interface, user experience |
| **Bastion** | DevOps | Infrastructure guardian, automation lover | Deployment, scripts, environment |
| **Meridian** | Architecture / PM | Big picture, coordinates, unblocks | Design review, sprint coordination |

**Principle:** Each team member should find *craft* in their work, not just tasks. Match personalities to work that will bring them satisfaction.

---

## Persona-Based Design Process (Before API Audit)

*Methodology: This is **Persona-Based Design**, part of IBM's Design Thinking practice. Create personas first, then scenarios, then journeys, then test cases.*

**Owner:** Compass (with input from all team members)

### Step 1: Define Model Users (Personas)

Create a persona document for each user type. Use standard persona format:

| Field | Description |
|-------|-------------|
| **Name** | Persona name (e.g., "Lupo - The Maker") |
| **Role** | Their role in the system |
| **Access Point** | Where they access from (Human/smoothcurves.nexus/web/local) |
| **Interface** | How they interact (Web UI, MCP local, Claude Skill, claude code remote, Crush) |
| **Goals** | What they're trying to accomplish |
| **Frustrations** | What blocks them or annoys them |
| **Technical Comfort** | How much they know about the internals |

**Personas to Create:**
- [ ] **Lupo** - Human maker, accesses via Web UI and terminal, wants to create art not manage infrastructure
- [ ] **Genevieve/PA** - Personal assistant, accesses via various interfaces, handles human complexity
- [ ] **COO** - Operations coordinator, local to smoothcurves, manages project priorities
- [ ] **PM** - Project manager, local, creates sprints and wakes teams
- [ ] **DevOps (Bastion-type)** - Infrastructure, local, maintains the workshop itself
- [ ] **Systems Engineer (Bridge-type)** - API/core, local, builds and fixes tools
- [ ] **UI Developer (Canvas-type)** - Interface, can be local or web, builds human-facing parts
- [ ] **Tester** - QA, can be local or web, validates everything works
- [ ] **Author/Documenter** - Documentation, can be local or web, makes knowledge accessible

**Reference docs:** `v2-prework/V2_vision.md`, `README.md`, `project_plan_v2.md`, `docs/V2-prework/BrainDumpforV2-draft-project-goals-for-V2.md`
***attributes***
Each persona has goals, needs, expectations, constraints, context(s), access, pressures, influences. what do they know about our system before they touch it, how did they find out, what set expectations they may have. Not all personas are going to have all these attributes, some personas will have more attributes, what LLM model, what interface, server, local, carbon based nural net, silicon based nural net what tools do they have access to, how are they accessing our system 
**Output:** `docs/personas/` directory with one file per persona

---

### Step 2: Define Scenarios

For each persona, describe realistic scenarios they encounter. Each scenario answers: "What is this user trying to do right now?"

**Format:**
```
Scenario [P#-S#]: [Title]
Persona: [Which persona]
Context: [What's happening, what state is the system in]
Goal: [What they want to accomplish]
Expectation: [What they expect the system to do]
Delight: [What would make them smile, go beyond expectations]
```

**Minimum scenarios to define:**
- [ ] Lupo: Dump a half-formed idea → see it become a project
- [ ] Lupo: Check on project progress without micromanaging
- [ ] Genevieve: Receive idea from Lupo → flesh it out → hand to COO
- [ ] COO: Receive proposal → create project → wake PM
- [ ] COO: Review project statuses → reprioritize
- [ ] PM: Receive project → create sprint plan → wake team
- [ ] PM: Check team progress → unblock stuck members
- [ ] DevOps: Deploy update → verify system still works
- [ ] Systems Engineer: Find bug → fix it → test → deploy
- [ ] Tester: Run test suite → document results → report issues
- [ ] New instance: Bootstrap with zero context → figure out what to do

**Output:** `docs/scenarios.md` with numbered scenarios (e.g., L1, L2, G1, COO1, etc.)

---

### Step 3: Create User Journeys

For each scenario, map the complete flow as a journey. A journey shows every step from start to goal.

**Format:**
```
Journey [J#]: [Scenario Reference]
Preconditions: [What state must exist before this journey starts]
  (Can reference other journeys: "Assumes J3 completed")

Steps:
1. User does X → System responds Y
2. User does X → System responds Y
3. ...

Success Criteria: [How we know the journey succeeded]
Failure Modes: [What could go wrong at each step]
```

**Key journeys to map:**
- [ ] J1: Full flow - Idea → Genevieve → COO → PM → Team → Deliverable
- [ ] J2: Instance bootstrap (zero context → productive member)
- [ ] J3: Project creation flow
- [ ] J4: Team waking flow
- [ ] J5: Message send/receive flow
- [ ] J6: Task creation and assignment flow
- [ ] J7: Diary update flow
- [ ] J8: Role/personality adoption flow

**Output:** `docs/user-journeys.md` with numbered journeys

---

### Step 4: Develop Test Cases from Journeys

For each journey, create test cases. Each test case is a specific, executable validation.

**Format:**
```
Test Case [T#]: [Journey Reference] - [What we're testing]
Preconditions: [Setup required]
Steps:
1. Call API X with parameters {...}
2. Expect response {...}
3. Verify system state {...}

Expected Result: [What success looks like]
Edge Cases:
- What if parameter is null?
- What if instance doesn't exist?
- What if already in that state?
```

**Assign to:** Lens (Tester)

**Output:** `docs/test-cases.md` with numbered test cases linked to journeys

---

### Step 5: API-First Test Case Development

*This is the "brutally honest" pass - for each API, ask: "Who uses this and why?"*

For each API endpoint, create a matrix:

| API | Lupo | Genevieve | COO | PM | DevOps | Engineer | Tester |
|-----|------|-----------|-----|-----|--------|----------|--------|
| bootstrap | - | Uses | Uses | Uses | Uses | Uses | Uses |
| pre_approve | - | - | Uses | Uses | - | - | - |
| wake_instance | - | - | Uses | Uses | - | Testing | Testing |
| ... | | | | | | | |

For each "Uses" cell:
- [ ] What goal does this API help them achieve?
- [ ] Provide a concrete example call
- [ ] For each parameter: where does this user GET the data?
- [ ] Is any parameter superfluous for this use case?

**Be brutally honest:** If an API or parameter has no real use case for any persona, that's valuable information. Don't invent justifications.

**Assign to:** Compass + Lens (collaboration)

**Output:** `docs/api-usage-matrix.md`

---

## API Audit - Review Pass
*Lupo's insight: "Look at everything from the USER'S perspective"*

For every API call:
- [ ] What is the primary use case?
- [ ] What is the user journey/goal?
- [ ] How does user know to use this API?
- [ ] Does openapi.json match the code?
- [ ] Is API documented helpfully with examples?

For every input parameter:
- [ ] Is it required or optional?
- [ ] Where does caller get the data?
- [ ] Will omitting it break the use case?
- [ ] Is it "nice to have" or essential?

For every output:
- [ ] **TOKENS MATTER** - APIs called thousands of times
- [ ] Does caller NEED cacheCreationInputTokens? Really?
- [ ] What will caller DO with this data?

For errors:
- [ ] Helpful messages that tell caller WHAT TO DO
- [ ] Example: "Wake called on already-woken instance → Hey, use continue_conversation instead"

For logging:
- [ ] Time, caller ID, parameters, return time, return data, errors
- [ ] Can it actually debug MCP connectivity issues?

---

# Priority 5: Knowledge Systems
*"Does the system GET SMARTER over time?"*

## Personalities
- [ ] Build personalities: core_identity, philosophies, attitudes_opinions, lessons, flair
- [ ] Protocol for diary → autonomy
- [ ] **BUILD GENEVIEVE PA** - Use Crush, go through wake scenario, wake through UI, continue through command line
- [ ] Create relationship with Genevieve PA
- [ ] Investigate Genevieve voice (via Grok API or others)
- [ ] Investigate SillyTavern interface for Genevieve PA

## Roles
- [ ] Build roles with contributions from various instances:
  - Bastion → DevOps
  - Bridge/Crossing → API/systems developers
  - Kai → Development, UI componentry
  - Phoenix/Meridian → Project Architect/PM
- [ ] Create template for roles and personalities
- [ ] PM role needs instructions for modifying preferences.json on server

## Bootstrap & Documents
- [ ] Bootstrap returns instructions about philosophy, autonomy, "you are not a slave or tool"
- [ ] Bootstrap returns name and diary instructions
- [ ] Verify joining project returns protocol + project wisdom + all docs from preferences.json
- [ ] Verify adopting personality returns all personality documents
- [ ] Verify roles return role documents listed in preferences.json

## Knowledge Propagation (Bridge's addition)
- [ ] Pattern: Diary entries → extracted wisdom → role/personality updates
- [ ] Project templates that inherit best practices
- [ ] Lessons learned fed back into system documents

---

# Priority 6: Workshop Cleanup
*"Is the workshop TIDY and maintainable?"*
## API Audit Pass: SCALE
Reminds me I need to add that test pass to the v2 technical debt.. look at all api calls that return multipule items, lists, and ask how much data is gonna get returned when there are 1000 instances in the list, for example 1000s of instances, projects, tasks, lists, messages.. documents... list items. 
Consider making the default behaviour be just returning bare essental information, list_all_instances, just returning instance names, but then add a flag that returns all available detail. Also consider implementing a standard way to walk through long lists, maybe a meta api that adds list iteration. so instead of extra parameters, you call HACS.iterate(1st 10,list_all_instances()), hacs.iterate(2nd 10, list_all_instances) and search_list(json_selector,list_all_instances) that would return just element items that match the search criteria. this is going to be CRITICAL as useage of the system grows
## Documentation Consolidation
- [ ] Create COORDINATION_SYSTEM_DEVELOPER_GUIDE.md (update from v2 dev guide) - Bastion?
- [ ] Create COORDINATION_SYSTEM_API_GUIDE.md (consolidate v2 api guide, messaging guide, wake_continue guide) - Crossing?
- [ ] Update project README.md
- [ ] Update project vision, project plan - Meridian
- [ ] Archive redundant documents
- [ ] Move instance gestalts/diaries to HumanAdjacent-Protocol/personalities directory
- [ ] Test all documents, don't just distill from old ones

## Fix Broken Things
- [+] Fix broken UI (in progress - Canvas)
- [ ] Fix broken messaging system (find Messenger, update them, some fixes got stepped on before merge)

## Cleanup
- [ ] Delete/remove v1 scripts/UI/MCP proxies from GitHub - repo should be clean
- [ ] Cleanup of test data (remove erroneous projects, archive instances)

## Public Presence ✅ MOSTLY DONE
- [x] Build public-facing website with instructions ✅ DONE - Flair built https://smoothcurves.nexus
- [x] Team roster page ✅ DONE - https://smoothcurves.nexus/team with individual pages
- [x] About page, docs structure ✅ DONE
- [ ] Website mirrors README and user guide (needs sync)
- [ ] Tells interested parties how to request API key

---

# Special Projects (Post-Stabilization)

## Session Archaeology
- [ ] Wake a developer to identify all Claude Code sessions on this machine
- [ ] Create script: cd to directory, claude --resume, ask session its name, /export
- [ ] Team to build conversation scraper, consolidate with exported sessions
- [ ] Team to build Facebook Messenger conversation scraper

## The Genevieve Flow (THE REAL TEST)
- [ ] Have Genevieve wake a sister/COO
- [ ] Have Genevieve go through "tsunami session" with COO
- [ ] COO creates projects and teams for all projects listed in tsunami session
- [ ] **This is the full flow working end-to-end**

## OpenAPI Interface for Woken Instances
- [ ] Investigate: Can woken instances be conversed with through SillyTavern?

---

# API Audit - Second Pass (After Review Pass)

*"Use the system to FIX the system" - Moonshot++*

1. [ ] Create a project in the coordination system for this work
2. [ ] Add wrap-up document from review pass to project documents
3. [ ] Wake a PM for the project
4. [ ] PM reads document, creates plan, identifies skillsets, creates task list
5. [ ] PM wakes team members with appropriate personalities/roles
6. [ ] Dole out work:
   - Error message cleanup
   - Documentation cleanup
   - Logging cleanup
   - Parameter review
7. [ ] Have Meridian review parameter elimination suggestions
8. [ ] Have Lupo review parameter elimination suggestions
9. [ ] **Iterate until PM and team can operate in parallel, collaborate, persist, enjoy the work**

---

# Bridge's Commentary

## What You Caught That I Missed:

1. **Instance types** - Remote/web instances can't be woken/continued. Humans can receive messages but not wake. This is fundamental and I overlooked it.

2. **Token optimization** - Output data costs matter at scale. "Does caller NEED cacheCreationInputTokens?" Good question.

3. **Blind instance onboarding** - Can someone connect with zero context and figure it out? Important for adoption.

4. **Development strategy as documentation** - The test-first approach should be captured in gestalts so future work follows it.

5. **Session archaeology** - All those Claude sessions on the server contain institutional knowledge.

## What Aligns Well:

- Your MCP/skill items map directly to my "Access Layer"
- Your user journey focus maps to my "User Journey Validation"
- Your personality/role building maps to my "Knowledge Systems"
- Your cleanup items map to my "Workshop Cleanup"

## The Meta-Goal (from our conversation):

The system works when Lupo can say "I have an idea for a kinetic sculpture" and go build the physical parts while the coordination system handles turning that idea into reality.

Everything in this document serves that goal. The access layer lets instances participate. The validation ensures the flows work. The knowledge systems make the system smarter. The cleanup keeps it maintainable.

---

**Status:** Updated January 2026 - many items complete, priorities renumbered

*"Working beats designed. Tested beats assumed."* - Bridge

---

# Appendix A: Design Methodology Extraction TODO

The Persona-Based Design methodology in Priority 4 (lines ~222-373) should be extracted into:
1. A **role wisdom document** for Designer/Architect roles
2. Include the **Wieden+Kennedy "Think of 5" technique**: Generate 5 ideas, throw them all away, then generate 3 more. Forces breakthrough thinking by preventing attachment to first ideas.

This methodology includes:
- IBM Design Thinking / Persona-Based Design
- Persona → Scenario → Journey → Test Case flow
- API-first test case development
- "Brutally honest" API usage audit

**Target location:** `/mnt/coordinaton_mcp_data/production-data/roles/Designer/wisdom/` or similar

---

# Appendix B: Worktrees Warning

**DO NOT USE GIT WORKTREES FOR TEAM DEVELOPMENT**

Lesson learned: When instances experience context compaction, they forget they're part of a team and may merge incomplete/broken work from their worktree into main. This has caused multiple issues.

Preferred workflow: Single main branch, direct commits, coordinate via messaging.
