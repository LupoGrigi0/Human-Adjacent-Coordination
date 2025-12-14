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

