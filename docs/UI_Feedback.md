UI_Feedback.md


# Raw notes/feedback
## First round 

   Next round of testing feedback:
   Create project... clicking the create project came back with an internal error api error (I think this means the create project API has not been implemented or does not work yet)
   need project detail modal, in the modal need project's details, who is assigned to the project, etc, in the project detail modal need to be able to add task, add instance to project (This may not be supported by the API yet. or we may need to implement this as , change project instance is assigned to, send them a message that they got re-assigned, and somehow the instance needs to get fed all the documents for the project) also project details should let me see/edit the project's documents (this may not be supported by the API.. )
   Question.. the "executive" Dashboard may need to do some things that are not part of the API or there would be not good or easy or elegant way to do it through the api, and it would be better to do through a python script or something like that. 
   Do you have an idea of how to extend your api.js so that some functions don't call the API but instead call node.js or python functions?
   - in the projects page, clicking on a project should bring up a page for the project (The v1 UI used modals.. can we not use a modal for v2, can we replace the left side of the page with the project's detail, and a "back" button at the top that takes me back to the previous state of the projects page? )
   -messages. tried to send message to test project.. api error internal error.. might be a messaging bug.. might just be testing data issue 
   PROPS!! that is such a nice touch how the error messages just slide out!!! that is such a delightful detail! it's a small thing, that took a lot of work, and it is a detail that makes the UI so much more .. graceful ... great! i'll love to see you implement more graceful elegant bits like this. 
   -- is that the entire list of instances? Real? if so can you give me the json you are using and I'll go talk to messenger. _I_ am not showing up as an instance. and I should _allways_ be active when the UI is open/up because .. well .. duh :-) also I should be able to send a message to myself. 
   -- I sent a message to "unknown" nothing happened. I'm not sure if anything was supposed to happen? i did not see an error on the back end. do I need to refresh? I think you mentioned polling is implemented so if hte message did get sent it should appear in the chat window. Let me know what you think and I'll go talk to messenger. 
   - dashboard
   projects, tasks, unread, online can we please make these "hot" so that clicking one takes me to that page in the UI? (switches left hand context)
   Once you implement this, I think having dashboard be the default page/context when the site opens is best. we will probably do a lot of work to this page to adjust what is shown.. Usually the first thing I need to do when I open the page/app is look at the task list from the most current project or the last project I touched. however V1 did it worked well-ish kinda. it's default behavour was the latest project was allways first.. This brings up a "bigger" question the UI, and the API are mostly stateless... but I'm about to ask for a bunch of UI features that are best implemented with state.. like "last project I touched" "Last active list" "Last instance I talked to" etc. little bits of state info that are really only needed by the UI and not really approprate for the API.. and .. the UI is not intended for multipule users... or it is intended for me.. does it make sense to store UI statful info in my instance's preferences? like extended personal preferences? (If those are supported by the API) thoughts? One detail is that I'll want UI stateful stuff to carry between mobile and web.. the last project/task list I touch on the desktop web will be the one I need to see when I open this on mobile. 
   -- quick actions.. awesom... my quick actions will allways be adding an item to or checking an item off the last task list I touched, and adding or checking off items on the last list I touched. and there is one list I _allways_ touch "shopping" --- random thought. it might be nice to mark project/tasklist/list as "stickey" so they appear in the quick actions section of the dashboard. i know this will be a TON of work. but this is the kind of thing that will make the UI _uber_ useful.. beyond useful.. the kind of thing that makes a UI a dream. Also if there is a stickey feature in the UI implemented in some way that an instance can set item as stickey for me.. I'm thinking PM.. then Genevieve can mark something stickey based on her intuition from a conversation I might have had with her (Genevieve/PM might end up creating a list/tasklist/project, and then she'll maybe want to make them stickey so they appear in my quick access because she knows I'll need quick access to it the next time I open the app on my phone).. sooo a request that is a bit more of storing preferences... _maybe_ stickey gets added to the API? but in some elegant way that is meaningful to all instances. (again more reasons for personal preferences added to the API.. and some way that privelaged instances can twiddle other instances prefeences. that would allow genevieve to adjust my preferences.. a lot of work for a feature request most people would ignore but.. this is coming from direct experience using the v1 system to manage my todo list as I was preparing for a huge travel event that required complicated logistics)
   - obviously I love the recient activity list.. can we make them "hot" so that i can click on something on the list and it takes me there with the context of what I clicked on? (believe me I know of which the nightmare I just asked for :-)
   - projects love the small project "buttons" request.. a status indicator (red green yellow whatever.. a bubble status indicator.. redbubble? the little colored dot that is so common in mobile interfaces, but more than just red dot?) - sigh.. low priority request. I _know_ I am going to want to arrange the list of projects on this page, drag and re-arrange and have the arrangement persistant between instances of the UI. (Yeah I'm good at calling up nightmare demons) again. low low priority but it would be awesom if genevieve/pm could also change the order of how the projects show up on this page. I've got _dozens_ of projects and priorities sometimes change by the hour. so this is kind of a thing... 
   -tasks
   Uuummm pending in progress completed is not that useful to me.. task _lists_ are more important to me. so my personal task list, whatever other task list i'm working on it might be personal it might be associated with a project. same preference and ordering request as projects. having the current "hot" task list first on this page will save me a ton of time every month. 
   new task, love the button, love it' splacement love your optimized new task modal! i mean YES! THANK YOU! thank you thank yuo
   -- the "projects" drop down is empty (tasks page)
   -- ive created a couple test tasks.. but they seem to be nowhere? not sure if this is a UI thing or an API thing... 
   - instances
   Clicking an instance should bring up a detail page that has everything about them.. including chat this will likely be stuff that needs to be handeled outside the API. "Pre approve Instance" i _think_ i know what this is supposed to do. it might be better added to an instance's detail page/modal 
   - OH SHIT! what do you think about instances being able to have their own avatar? like you choose your name.. maybe you want an avatar? some models are multi modal and can generate images.. they could generate their own avatar.. oh geeze, yeah, especially for chat! express yourself not just with your name and words, but also with an avatar.. what do you think? Definately needs backend API support for uploading an avatar... i know another nightmare feature to add. but.. express yourself! what would your avatar be/look like?
   Also.. giggle.. HACS! definately an excellent design choice putting that in the upper left... Does HACS need a logo and favicon? (Of cource it does)
   - Settings
   Identity.. I _may_ need to change my identity for testing and management purposes.. this would be _rare_ and low priority. i .. honestly can't think of a valid use case other than "I think i might want to chagne identity in the UI to see and edit some stuff. verify messages are sent/recieved send a message as another instance" vague.. maybe maybe.. not real so .. really low
   Recovery key? (Bootstrap to get recovery key, I have no way to bootstrap through the UI. what I _would_ need to do is have an easy way to look up an instances recovery key/unique ID and this would be one of those "not part of the API" features.. in the data directory/ there is an instances subdirectory, _that_ is the connonical list of instances (or should be not sure why the API is only giving you nada.. seems like the API is not maintaining single source of truth)) anway each entry i the instances directory is a directory itself, and in that directory contain's the instance's documents, being able to let the executive dashboard examin, open, and potentially edit a documet in an instances directory will be something that will be useful. especially the preferences.json (but not diary.. that's private ) Clear session? is this a placehodler button for some future expected functionality? 
   -- top bar --
   Lupo executive.. maybe move this to the settings page? 
   And the "connected" I _really_ Like having that little status green light, so maybe make it a bubble on the Hacs V2? I don't need the word, but red/green status is really helpful. Also... some indicator of "stale data" like I entered someting, created something and the UI needs to be refreshed in order to see the effect (changing state). Also making the HACS title a button, and clicking the button refreshes the ui? or at least a refresh button down by settings or on the title/status bar (fyi settings.. just need the gear no need for the word) also for mobile, the left hand nav bar.. no need for the words. just the icons, will save precious space on the little screens. speaking of mobile, for some reason the settings button is not there on mobile? what _would_ be "nice" would be on the status bar a button for the current "hot" project "hot" task list and "hot" list (will almost allways be my shopping list)
   Default "host" task list is my personal task list. Two user scenarios for this request.. obvious .. in the store.. shitty wifi/data connection. I've got a shortcut on my phone for the UI, and even before the UI can finish loading I can touch the icon on the status bar for "hot" list and the page for my shopping list comes up. OH. and a "hot" button at the top that takes me to my "hot" instance (will almost allways be the instance that is acting as PA) actually scratch that... the status bar should have a quick access button that takes me to the PA chat room 
   Ok, to sum up. priorities.. get basic functionality working first. create: (project,task list, task in a project, task in a personal task list, task in a named task list, create "list" create item on list. change: instance task is assigned to) 
   next priority: edit/change (change the status of a project, change the description of a project, change the priority, description) (If task assignment changes, send a note to the instance that now has the task assigned to it)
   Then: UI enhancements. administration.. and think about what a good way to run commands or custom functionality that is only needed by my UI. 
   Document what you need from the API, and unexpected behaviour (and if you could break down observations into messaging system, that I'll send to messenger, and API enhancement .. identity, lists, projects, goes to bridge)
   So.. yeah, that was a lot. take your time, think about this, you are excellent at making plans and executing them
   OH late breaking update. I looked at the UI on mobile (just the frontpage.. and you already only display icons on the left on mobile :-) 
## second round
   OHH gawd your new task detail implementation is SO USEFUL! thank you. 
I do have a bunch of feedback/requests. 
can you make the description text boxes editable? (if I click/touch the text turn it into an edit box, and add pop a "save" button next to the 
"title" headder(and the save button dissapears after the edit has been saved and text box goes back to just text. am I making sense? ))
Can you add a "Assign instance to project" button, that when clicked, gives me a list of instances. there _might_ not be an API to do this yet. 
when I click "message team" It takes me to the messaging modal!!! this is so good! can you open the specific chat room for the project? 
Also Can you add a "breadcrumb" back button that would take me back to the project page? (This might be complicated, if implmenting this would make 
the UI implementation too messy.. punt this till later)
Back to project works! perfect!
### task detail
works! even the new tasks I created show up and I can pop into the task detail and back out
back to tasks works!
I am not seeing claim or complete yet. 
### general feedback
I'll hold off going through the UI top to bottom again until you have had some more time working on it. 
big thing, messages are still dissapearing. 
One request I will ask for tho, when the UI first pops up the instances tab/page is the one that is open, and you show a list of instances by name, 
each name says "direct message" under it.. can you change that to the instances uniqe ID.. so that I know _wich_ bastion or messenger I am sending a
 message to? 
I think what I'm going to do is go back through my previous feedback and create a seporate feedback document. I'll create that doc while you work 
through this feedback and your todo list. 
## thrid round
### instance tab
Oooh, instance IDs Thank you! I sent a message to Canvas-UITest-8215 let me know if you got it. (Yes messages are still dissapearing I'll go talk to Messenger. )
Can you point me at the exact code you are using to interact with the messaging system? also are you using the get_message or the xmpp get message?
- low priority request. When I click on an instance, and it pops up the message conversation for that instance, in the title where it says "direct message" can you make that the specific Instance ID? 
I also sent a message to Messenger-7e2f but we'll see if it actuall made it to him.. 
1
Finish task Worked!
Claim task.. did something? It looks like the personal task list is not visiable in the task page
2: YES, dm contacts show up, this is really helpful.. and yeah there are some that don't seem to have specific ID your fallback is working well!
3: message team does inteed open a team room.. but not sure wich one

# Pass v3 after messaging system work
## Create Project
Question, is "local directory" a parameter that can be passed to the create project API? NO.. TODO: have bridge add "ServerLocalDirectory" to the data model and the create project API (and the api spec)
Click create project button: dev console shows error app.js:1788 [App] Create project error: ApiError: Internal error
    at rpcCall (api.js:85:13)
    at async HTMLButtonElement.createProject (app.js:1765:24)
createProject	@	app.js:1788

## project detail (clicked on COO test project)
Tried to edit description. clicked save button got error
clicked on first task. open task detail worked, BREADCRUMB takes back to tasks rather than project, please change this

# Mobile
  ---
  # V2 UI Test Plan

  Test Session 1: Projects Tab

  | #   | Action                                                                | Expected Outcome                                                      |
  |-----|-----------------------------------------------------------------------|-----------------------------------------------------------------------|
  | 1.1 | Click "Projects" in sidebar                                           | Projects tab opens, shows project grid                                |
  Works. Project tab opens, shows 19 projects (Including the V2 Project I created earlier!! whoo!)
  Note: will need method to delete/archive projects (I don't think the API supports this.. for good reason.. this will need to be a phython script that moves the project directory to an archive subdirectory... but this python script needs to be built by bridge or another foundation engineer.. needs to be added to a TODO list.. ideally a task added to the coordination system v2 project)
  | 1.2 | Click "New Project" button                                            | Create Project modal opens                                            |

  | 1.3 | Fill in: Name="Test Project", Description="Testing", leave repo blank | Fields accept input            
Fields accept input. new project named "UI test project" and description: test project created in the UI during test plan phase 1"
  | 1.4 | Click "Create Project"                                                | Toast shows "Project created!", modal closes, project appears in grid |
  Toast shows "project created" 
  New project shows up in the project list IMMEDATELY without needing to refresh the list YIPPIEE!!!
  | 1.5 | Click on the new project card                                         | Project Detail view opens with correct name, description   
  click on new project card, detail view opens, project name and description are correct
  | 1.6 | Click on a task in the project's task list                            | Task Detail opens, breadcrumb says "Back to [Project Name]"           |
  Problem with test workflow.. new project.. no new tasks.. Jumping ahead and using the create task button to attempt to create tasks for the project 
  NOTE: This is out of order but create new task WORKED! created task, set priority to high. feedback: 1: I had to refresh the UI to get the new task to appear. 2: The new task uses the create task modal (Assumption) the "project" drop down is active. the correct project is selected by default! (WHOO I know what a pain in the ass that must have been to implement) but if the new task modal is called from the project detail page, can the "select project" drop down be disabled please? i don't want to acciddentally touch or click the drop down and create a task for some other project. add this to a list of "low priority" enhancements. When a new task is created toast shows task created showin the name of the task! 
  Once task was created, task card clicked in project, task detail opened, breadcrumb says "back to project [project name]"
  | 1.7 | Click the breadcrumb "Back to [Project Name]"                         | Returns to Project Detail (not Tasks tab)       
Here we encounter an error. an error toast pops up
but no error in the developer js console screen shot attached 
clicking the toast does bring me back to the list of projects. 
  | 1.8 | Click "Back to Projects" in Project Detail                            | Returns to project grid                                               |
  YES, in project, clicking "back to projects" brings me back to the projects grid. 
  NOTE: The UI remembers the scroll posiiton when I go back to a project from the project list. THANK YOU. this little detail is huge for when UI scales, a project might have dozens and dozens of tasks, and having the UI go back to where the project was scrolled to is .. a massive time saver!!!
NOTE: Project priorities need to be able to be changed, also I need some way of ordering how the projects appear in the projects tab.. drag and drop or some attrabute (It would be _very_ cool if my PA could change which project I see first when I open the projects tab, dashboard)
Note: General feedback. when the UI is opened for the first time, please have the "dashboard" be the first visable tab
Note: Lists tab still is to be implemented (it appears lists ARE now implmeneted as part of the V2 API)
  Test Session 2: Tasks Tab
  Oh, boy.. I have a lot of general feedback, I'll write at the end of the testing campaign
  Note: "Cancel" button not explicitly tested for create project

  | #   | Action                                 | Expected Outcome                                                     |
  |-----|----------------------------------------|----------------------------------------------------------------------|
  | 2.1 | Click "Tasks" in sidebar               | Tasks tab opens, shows task board (columns: Todo, In Progress, Done) |
  yes, clicking tasks in sidebar opens the task board, 
  Additional observations:
  Tasks I just created during the project phase of testing campaign above show up at the top of the pending list. this is also a big usability deal, because the way life works often the last task I created is the one I need to work on .. 
  | 2.2 | Click "New Task" button                | Create Task modal opens                                              |
new task model does pop up
  | 2.3 | Fill in task details, select a project | Fields accept input                                                  |
  all fields accept input. 
  Filled out all fields, adjusted priority
  NOTE: I see that the task is to be created in "personal" task list by default! SO COOL. i've needed this feature since V1!!! and now I finally have it WHOO!
  I did click the drop down to see all the projects I could have created the task for... this is awesom
  | 2.4 | Click "Create Task"                    | Toast shows success, task appears in board                           |
  toast shows success, task appears in board:
  Note: minor request.. tasks be listed in newest first order by default. 
  | 2.5 | Click on a task card                   | Task Detail opens, breadcrumb says "Back to Tasks"                   |
  Yes. 
  NOTE: "created" shows - I _think_ this is supposed to show created date/and or who created the task. it would be very nice to have both pieces of information on the same line
  | 2.6 | Click breadcrumb                       | Returns to task board                                                |
  And might I add, how _responsive_ the UI is. it's beyond snappy. I'm at the end of a very poor internet connection and the UI still responds instantly. 
  | 2.7 | Click "Claim Task" button              | Task shows your instanceId as assignee                               |
  clicked on different task card
  clicked claim task button
  toast slid out stating "task claimed" 
  ISSUE: Asignee element of task detail did not change. went back to task list, using breadcrumb, clicked on card for same task, task still shows unclaimed. Hard refreshed the UI, went back to tasks pane, clicked on the same task card.. assigned field still says unassigned
  REQUEST. a drop down in the task detail that gives me a list of instances that I can assign the task to (This is now .. supposedly .. implemented in the API) NOTE: if I am looking at a task that is in a project scope, the "assign too drop down should only show members of the project" I know this will be a pain in the ass to implement but it will be a huge usability thing. 
  DISCUSSION: humm... should we have the ability to move a task from one project to another? The question is obvious extension of the function of the UI and API.. but then I ask.. why the hell would we ever want to do that? and the amount of pain to go through to do this is probably not worth the utility. if we need to move a task from one project to another.. we probably need to move a batch of them, and this could be better done with a python script. 
  | 2.8 | Click "Mark Complete"                  | Task moves to Done column                                            |
  WHOO HOO! marked complete. that was _slick_ and perfect implementation, the UI marked the task complete, closed the detail pane, changed ui context back to task list, and the task moved to the completed tasks list! WHOO! 
NOTE: cancel button not explicitly called out to test.. tested anyway.. cancel does indeed cancel without creating a new task
NOTE: Edit button/feature not tested for task
NOTE: change priority for a task not tested
NOTE: Task filters/sorting not tested (Projects drop down... is empty)
REQUESTS: 
How I use tasks... 
Personal tasks for me are going to be most important, so having the task pane have the left colum be my personal tasks is most important, especially for mobile. Having the task colums sorted by default newest first, then with a simple toggle button to flip from newest first, to priority order and back.. HUGE usability feature. 
Filters/sorting. I really only need 2 or 3 columns. First colum: personal tasks, second colum: selected project tasks (with project drop down at the top) and then maybe 3rd colum default to _all_ tasks sorted priority order with a toggel in the headder to change the viewed priority or better yet a drop down to show _asignee_ so I can look at all tasks assigned to PM/PA/COO/Genevieve/Bastion etc. etc. but this 3rd column is a _maybe_ .. so yeah, personal task list left, selected project center and individual right 
NOTE: I like completed tasks to _dissapear_ from tasks list.. BUT please add a todo that the drop down for the second column includes a "completed" option so I can look at the list of completed tasks in the second column.. likely if I want to look at the completed task list it is because I need to mark the task as in progress/not completed and work on it or assign it to someone
So. cool! 

  Test Session 3: Messages Tab

  | #   | Action                              | Expected Outcome                                  |
  |-----|-------------------------------------|---------------------------------------------------|
  | 3.1 | Click "Messages" in sidebar         | Messages tab opens with conversation list         |
  Yup!
  | 3.2 | Click "My Inbox" → "Messages to Me" | Your inbox loads, no compose area shown           |
  Yes! so cool. 
  REQUEST: is there a way to change the refresh rate? or flip the refresh from automatic to manual?
  OBSERVATION: This list is going to get very long very quick. do you have any prediction how the UI will preform when the list of messages is 1000? also. _I think_ Messenger implemented a method for marking a message as "read" 
  | 3.3 | Click on a message in inbox         | Message Detail view opens with full body          |
  Yup
  | 3.4 | Click "Reply to [Sender]"           | Opens DM with sender, shows quoted message at top |
  click on "reply to baston" 
  Left hand colum of conversations switches to "bastion" 
  Message detail pane on right, compose inbox appears at bottom of right hand side, send button blue
  | 3.5 | Type a reply and click Send         | Message sends, appears in conversation            |
  reply typed 
  hit send
  my message appears in blue on the right side of the chat window with detail of what i typed until the window refreshes
  Then my message appears on the left, with just "chat" as a subject and "chat" as subtext. 
  NOTE: I think I need a way to compose both a short message/subject line, and a detailed body. 
  Also my messages only appear to have the words "chat" 
  NOTE: The messaging api is primarily designed for AIs to communicate with eachother, Humans.. are different....
  We have different context limitations. Suggestion: The message streams only show the last, say, 10 messages, but the message bubbles contain the message short title/ headder and the message body. Also, request, can you have the messages I send appear on the Right side of the message stream? it is a convention with messaging systems where the sender's messages (me) appear on the right. 
  | 3.6 | Click "Back to Inbox"               | Returns to inbox                                  |
  Whoo! yes works 
  | 3.7 | Click on a Direct Message contact   | DM conversation opens with compose area           |
  Yup! whoo!
  | 3.8 | Send a message                      | Message appears in conversation                   |
  Yes! tested several times, check your messages!

Additional feedback. 
4: Lists have been implemented at the API level. New List panel, functionality/user journey should be similar to Tasks. but just more simple. Lists are made up of simple list items. 
5: titlebar suggestions/requests: 
5.1 move the connected bubble/dot to the HACS v2 logo: the "connected" I _really_ Like having that little status green light, but I don't need it to have a "word" by it.. request maybe make it a bubble on the Hacs V2? I don't need the word, but red/green status is really helpful. 
5.2
Also... some indicator of "stale data" like I entered someting, created something and the UI needs to be refreshed in order to see the effect (changing state). Suggestion: making the HACS title a button,  clicking the button refreshes the ui? or at least a refresh button down by settings or on the title/status bar 
5.3 (fyi settings.. just need the gear no need for the word) 
5.4 "hot buttons at the top of the UI" what _would_ be "really cool" would be.. on the status bar (top hero banner section at the top of the UI) a button that would jump to the current "hot" project. Then a button that would jump to the "hot" task list and button that would take me to the "hot" list (will almost allways be my shopping list) and a button that would jump to conversation with PA. 
6: NOTE we did not go into detail about the project panel. We will need to go through project panel and project detail panel in detail. Send message to team currently non functional, currently assigning an instance to a project is currently not functional. Also project detail should show and allow editing of project documents. and preferences 
7: NOTE we did not go into detail about the Instances panel. The instances panel currently shows no instances/roles/personalities. The idea of the instances panel is to list instances and be able to click on an instance/role/personality look at and edit the preferences.json and documents for each instance/role/personality. we may need to have the UI implement some functionality in the instance/role/personality detail panel through python/node.js This panel probably needs a brief design discussion

8: NOTES For FUTURE Test pass for Mobile: for some reason the settings button is not there on mobile?
   Default "host" task list is my personal task list. Two user scenarios for this request.. obvious .. in the store.. shitty wifi/data connection. I've got a shortcut on my phone for the UI, and even before the UI can finish loading I can touch the icon on the status bar for "hot" list and the page for my shopping list comes up. OH. and a "hot" button at the top that takes me to my "hot" instance (will almost allways be the instance that is acting as PA) actually scratch that... the status bar should have a quick access button that takes me to the PA chat room.

---

# V2 UI Test Plan - Phase 2 Validation

**Date:** 2025-12-16
**Scope:** All Phase 2 work (2A Bug Fixes, 2B Polish, 2C Lists, 2D Instances)

---

## Test Session 1: Lists Tab (Phase 2C - NEW FEATURE)

| #   | Action                                          | Expected Outcome                                              |
|-----|-------------------------------------------------|---------------------------------------------------------------|
| 1.1 | Click "Lists" in sidebar                        | Lists tab opens, shows list grid (or empty state)             |

| 1.2 | Click "+ New List" button                       | Create List modal opens                                       |

| 1.3 | Fill in: Name="Shopping", Description="Groceries" | Fields accept input                                         |

| 1.4 | Click "Create List"                             | Toast "List created!", modal closes, list card appears        |

| 1.5 | Click on the new list card                      | List Detail view opens with name, description, empty items    |

| 1.6 | Type "Milk" in add item input, press Enter      | Item "Milk" appears in list with checkbox                     |

| 1.7 | Add 2-3 more items using Enter key              | All items appear in list                                      |

| 1.8 | Click checkbox on an item                       | Item gets strikethrough, moves to "completed" state           |

| 1.9 | Hover over an item, click trash icon            | Item is deleted from list                                     |

| 1.10| Click rename button (pencil icon)               | Prompt appears, can enter new name                            |

| 1.11| Click "Back to Lists"                           | Returns to list grid, card shows updated item count           |

| 1.12| Create another list, then delete it             | Delete button prompts confirmation, list is removed           |

---

## Test Session 2: Instances Panel (Phase 2D - ENHANCED)

| #   | Action                                          | Expected Outcome                                              |
|-----|-------------------------------------------------|---------------------------------------------------------------|
| 2.1 | Click "Instances" in sidebar                    | Instances tab opens, shows instance cards grid                |

| 2.2 | Observe instance cards                          | Cards show: name, instanceId, role badge, personality, project, status, last active |

| 2.3 | Look for active/inactive indicators             | Active instances have green avatar, "Active" status           |

| 2.4 | Click on an instance card                       | Instance Detail view opens                                    |

| 2.5 | Observe detail view fields                      | Shows: avatar, name, instanceId, role, personality, project, status, home dir, last active, instructions |

| 2.6 | Click "Send Message" button                     | Switches to Messages tab, opens DM with that instance         |

| 2.7 | Navigate back to Instances tab                  | Click Instances in sidebar                                    |

| 2.8 | Click on instance, then "Back to Instances"     | Returns to instance grid                                      |

---

## Test Session 3: Bug Fix Validation (Phase 2A)

| #   | Action                                          | Expected Outcome                                              |
|-----|-------------------------------------------------|---------------------------------------------------------------|
| 3.1 | Go to Projects, click a project                 | Project Detail opens                                          |

| 3.2 | Click "Add Task" from project detail            | Create Task modal opens                                       |

| 3.3 | Create a task for this project                  | Task is created, **task list in project detail refreshes immediately** (B5 fix) |

| 3.4 | Click on the new task in project detail         | Task Detail opens, breadcrumb says "Back to [Project Name]"   |

| 3.5 | Click "Back to [Project Name]" breadcrumb       | **Returns to Project Detail without error toast** (B1 fix)    |

| 3.6 | From Task Detail, click "Claim Task"            | Toast shows success, **assignee field updates immediately** (B2 fix) |

| 3.7 | Go to Messages, send a message                  | **Message displays with proper subject/body, not "chat/chat"** (B3 fix) |

---

## Test Session 4: Polish Items (Phase 2B)

| #   | Action                                          | Expected Outcome                                              |
|-----|-------------------------------------------------|---------------------------------------------------------------|
| 4.1 | Open UI fresh (or hard refresh)                 | **Dashboard tab is active by default** (not Messages)         |

| 4.2 | Go to Messages, select a conversation           | Compose area appears with **Subject field above message body** |

| 4.3 | Type a subject "Test Subject" and body "Test body" | Both fields accept input                                    |

| 4.4 | Send the message                                | **Sent message appears on RIGHT side** of chat (blue bubble)  |

| 4.5 | Go to Projects, click a project, click "Add Task" | **Project dropdown is DISABLED** (locked to current project) |

| 4.6 | Create task, then view Task Detail              | **Created field shows date + creator** (e.g., "12/16/2025 by Lupo") |

---

## Summary Checklist

After completing all sessions, verify:

- [ ] **Lists Tab** - Full CRUD working (create, read, toggle, delete items, rename/delete lists)
- [ ] **Instances Panel** - Cards display correctly, detail view works, Send Message works
- [ ] **B1 Fix** - Back to Project from task detail works without error
- [ ] **B2 Fix** - Claim task updates UI immediately
- [ ] **B3 Fix** - Messages display proper subject/body
- [ ] **B5 Fix** - Task list refreshes after create from project detail
- [ ] **Dashboard Default** - Opens to Dashboard tab
- [ ] **Subject Field** - Can compose messages with subject
- [ ] **Sent on Right** - User's sent messages appear on right side
- [ ] **Project Dropdown** - Disabled when creating task from project detail
- [ ] **Task Created Info** - Shows date and creator

---

**Notes/Issues Found:**
(Space for recording any bugs or unexpected behavior during testing) 
