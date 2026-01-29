# Original need description from post v2 technical debt.md
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
# pheasability discussion with Bastion 
## Wake/Resume Streaming Sessions
there is a feature that I can run instances in "app server" mode via the Codex tool. basiclly turns codex into a streaming server, it streams jsonl in    
and out via stdio. the whole hacs api is built around stateless rpc paradigm, submit api call, call does it's thing and returns. but now I want to do something that starts long running processes that I'll want to be able to recieve streaming data from... I know this is what web servers _do_ .. well streaming web servers .. but i'm having a hard time wrapping my head around how to "expose" these long running processes, route requests to them, and stream output from them. (and kill them off after a timeout, and restart them after they've been killed off). I'm not looking for a solution. I think I'm looking for a clue. One thing is.. each streaming server is an instance, and in the hacs API every instance has their own instance ID. so, kind of like a session token? when a "client" wants to talk to one of these "servers" we will know the name of the instance we want to talk to. so it's like we have 
session token? i'm not sure that maps. but I'm trying to think about how this would work given our existing setup. and to be clear, we will have to create a wrapper around these servers because .. the services expects api calls sent in as jsonl

## Baston's Response
Lupo is describing a fascinating architectural challenge. Let me think through this carefully.     

The Problem:   
- They have Codex running in "app server" mode - it streams JSONL in/out via stdio   
- Current HACS API is stateless RPC: request → process → response      
- They want to expose long-running processes that stream data   
- Need to route requests to specific instances, stream output back     
- Handle timeouts, restarts, lifecycle management 
- Each streaming server is an instance with an instance ID      

Key Constraints:      
- The service expects JSONL over stdio (not HTTP) 
- Instances have IDs (like session tokens) 
- Need to map this to their existing HTTP-based infrastructure  

What they're really asking about:   
This is the classic "how do I bridge a long-running stdio process to HTTP clients" problem. It's what things like:      
- WebSockets do
- Server-Sent Events (SSE) do
- The MCP protocol itself does (they already have SSE infrastructure!) 

The clue they might be looking for: 

1. Process Registry Pattern: A manager/broker that:      
- Spawns Codex processes on demand
- Maps instance IDs to running processes 
- Routes requests to the right process's stdin  
- Multiplexes stdout back to clients     
2. They already have pieces of this!
- SSE infrastructure in the MCP server   
- Instance IDs for identification 
- Wake/continue pattern for process lifecycle   
3. The "session token" intuition is right: Instance ID IS the session token. The question is what sits between the HTTP world and the stdio  
world.  

Architectural options:

Option A: Process Broker (Sidecar Pattern) 
Client (HTTP/SSE)     
    ↓   
nginx   
    ↓   
Process Broker (Node.js)     
    ├── Codex-Instance-A (stdio) ←→ JSONL  
    ├── Codex-Instance-B (stdio) ←→ JSONL  
    └── Codex-Instance-C (stdio) ←→ JSONL  

The broker maintains a map of instanceId to child processes, accepts HTTP requests with the instanceId, writes to stdin, reads from stdout   
and streams back via SSE, handling timeouts and cleanup. Option B: Per-Instance SSE Endpoint routes each instance to its own channel - POST  
/instances/{instanceId}/input writes to stdin while GET /instances/{instanceId} streams the output back.  

Option C: Bidirectional WebSocket uses a single connection per client with messages tagged by instanceId, like {"instanceId": "Foo-1234",    
"type": "input", "data": {...}}.    

The real opportunity here is that HACS already has the building blocks - instance lifecycle management (pre_approve, wake, continue,  
introspect), SSE streaming from the MCP endpoint, and process spawning via wake_instance. What's needed is a persistent process manager that 
keeps processes alive between requests instead of spawning fresh ones each time, and bridges stdio to HTTP streaming using instanceId as the 
routing mechanism. This is similar to how screen or tmux work for terminals, but applied to JSONL streams - essentially a named pipe registry
where each instance maintains a stdin/stdout pair and a broker routes traffic by name.     

● sets down coffee, leans forward     

This is a good puzzle. Let me think out loud.     

What you're describing is a Process Broker pattern.      

The key insight: you already have most of the pieces. Let me map them: 
┌────────────────────┬───────────────────────────────────────────┐     
│      You Have      │   You Need                                │     
├────────────────────┼───────────────────────────────────────────┤     
│ Instance IDs       │ Routing keys (✓ same thing)                │     
├────────────────────┼───────────────────────────────────────────┤     
│ SSE infrastructure │ Output streaming (✓ already built)        │     
├────────────────────┼───────────────────────────────────────────┤     
│ wake_instance      │ Process spawning (✓ but spawn-per-call)   │     
├────────────────────┼───────────────────────────────────────────┤     
│ JSONL expectation  │ stdin/stdout bridge (← the missing piece) │     
└────────────────────┴───────────────────────────────────────────┘     
The gap: Your current wake/continue is spawn-respond-exit. You want spawn-persist-stream.   

Mental model that might help:

Think of it like a named pipe registry or a multiplexing terminal server (like tmux/screen but for JSONL):

                                         ┌─────────────────────┐     
            Client A ──HTTP POST──┐      │  Codex-Instance-X   │     
                                  │      │  (stdio process)    │     
                                  ▼      │                     │     
                   ┌───────────────┐     │  stdin ◄── write    │     
                   │               │     │  stdout ──► read    │     
                   │        Process│◄───►└─────────────────────┘     
                   │        Broker │     
                   │               │◄───►┌─────────────────────┐     
                   └───────────────┘     │  Codex-Instance-Y   │     
                                  ▲      │  (stdio process)    │     
                                  │      └─────────────────────┘     
            Client B ──SSE GET────┘      

The broker's job:     
1. Registry: Map instanceId → child_process handle
2. Input routing: HTTP POST with instanceId → write to that process's stdin   
3. Output streaming: Read stdout → push to SSE clients subscribed to that instanceId 
4. Lifecycle: Timeouts, restarts, cleanup  

The clue: Your instanceId IS the session token. The broker is essentially a persistent process pool with named addressing.     

Three implementation options (increasing complexity):    

Option A: Extend existing MCP server
- Add a /stream/{instanceId} SSE endpoint for output     
- Add a /stream/{instanceId}/input POST endpoint for input      
- Broker logic lives in streamable-http-server.js 
- Processes spawned on first connect, kept alive with timeout   

Option B: Dedicated streaming service      
- Separate Node.js service (port 3445?)    
- Owns all long-running Codex processes    
- MCP server proxies to it or clients connect directly   
- Cleaner separation, but another service to manage      

Option C: WebSocket bidirectional   
- Single WS connection per client   
- Messages tagged with instanceId   
- More complex client, but true bidirectional     

My instinct: Option A feels right for your architecture. You already have SSE, you already have instance routing, you already spawn   
processes. The delta is:     
- Keep processes alive in a Map     
- Add stdin/stdout piping    
- Add timeout/restart logic  

The JSONL wrapper question: Yes, you'll need a thin adapter that:      
- Receives HTTP/SSE messages 
- Wraps them as JSONL for Codex stdin      
- Parses JSONL from Codex stdout    
- Pushes to SSE

Does this give you a thread to pull on?    
## Lupo clairification about nginx route?
YES, thank you! this was exactly the walkthrough and options I needed!\
Quick question.. does'nt nginx already do this? am I just describing a classic reverse proxy pattern? kind of like option b where a client would send a post message with client ID, ngin x "reverse proxy" to the server then routes the streaming messages back to the client? I'm real big on not re-inventing the wheel. and next to linux, nginx and apache are about as battle hardened as it gets. With that, I like your option B idea.. because we have to write an api wrapper around this already, and the api wrapper will be seporate from the hacs api, and it would let clients connect directly I imagine 2 usage scenarios, I have a basic chat interface,added to my hacs UI that let's me connect directly with thes running instances, multipule tabs, several conversations going at once, mobile optimized etc.
etc. and also other instances will want to use this communication method. and they will primarily do that through a hacs proxy...     
## Bastion's response
∴ Thinking…      

Lupo is asking a really good question - can nginx handle this? Let me think about what nginx can and can't do here.     

What nginx CAN do:    
- Reverse proxy HTTP requests to backend services 
- Load balance across multiple backends    
- Proxy WebSocket connections
- Proxy SSE streams   
- Route based on URL path, headers, etc.   

What nginx CAN'T do (without Lua/custom modules): 
- Spawn processes on demand  
- Maintain a registry of which instanceId maps to which backend process
- Route based on POST body content (like instanceId in JSON)    
- Manage process lifecycle (timeouts, restarts)   

The key distinction:  
nginx is great at routing to already-running backends at known addresses (like localhost:3445). But Lupo's scenario involves:  
1. Dynamic process spawning (Codex instances start on demand)   
2. Routing based on instanceId (which is in the request, not the URL necessarily)    
3. Process lifecycle management     

So nginx sits in FRONT of this system beautifully, but the broker logic (spawn, route-by-instanceId, lifecycle) needs to live in something   
else.   

The architecture Lupo is converging on:    

Client (browser/instance)    
    │   
    ▼   
nginx (:443) 
    │   
    ├──► /mcp → MCP server (:3444) [existing HACS API]   
    │   
    └──► /codex-stream → Codex Broker (:3445) [new streaming service]  
     │
     ├──► Codex-Instance-A (stdio)
     ├──► Codex-Instance-B (stdio)
     └──► Codex-Instance-C (stdio)

nginx handles: 
- SSL termination     
- Routing /codex-stream to the broker      
- Proxying SSE/WebSocket streams    

- The broker manages spawning, routing by instanceId, bridging stdin/stdout, and handling timeouts or restarts.  

Two usage patterns emerge: the UI chat connects directly through nginx to the broker, while instance-to-instance communication flows through 
HACS (which adds authentication and logging). This keeps the broker focused on process management while HACS handles coordination.    

● Yes and no - nginx is part of the solution but can't do the whole thing.      

What nginx handles beautifully:     
- SSL termination     
- Routing /codex-stream → your broker service     
- Proxying SSE/WebSocket streams back to clients  
- The "battle hardened" HTTP layer  

What nginx can't do:  
- Spawn Codex processes on demand   
- Route based on instanceId in the POST body (it routes by URL/headers, not payload) 
- Maintain the instanceId → process mapping
- Manage process lifecycle (timeout, restart, cleanup)   

So the architecture you're converging on:  

┌─────────────────────────────────────────────────────────────────┐    
│    Clients      │   
│   (UI chat tabs, mobile, other HACS instances)    │    
└─────────────────────────────────────────────────────────────────┘    
│     
▼     
┌─────────────────────────────────────────────────────────────────┐    
│      nginx (:443)                                               │   
│   - SSL termination                                             │   
│   - Route /mcp → :3444                                          │    
│   - Route /Instance Broker → :3445 (new)                        │    
│   - SSE/WebSocket proxy                                         │   
└─────────────────────────────────────────────────────────────────┘    
     │                                           │ 
     ▼                                           ▼ 
┌─────────────────────┐            ┌─────────────────────────────┐     
│ MCP Server (:3444)  │            │ Instance Broker (:3445)    │     
│ [existing HACS API] │            │ [new streaming service]     │     
│                     │            │                             │     
│ - Stateless RPC     │            │ - Process registry          │     
│ - Instance mgmt     │◄──────────►│ - stdin/stdout bridge       │     
│ - Can proxy to      │  (HACS     │ - Lifecycle management      │     
│   broker for        │   proxy    │ - JSONL wrapper             │     
│   instance-to-      │   calls)   │                             │     
│   instance          │            │     ┌──► Codex-A (stdio)    │     
│                     │            │     ├──► Codex-B (stdio)    │     
│                     │            │     └──► Codex-C (stdio)    │     
└─────────────────────┘            └─────────────────────────────┘     

Your two scenarios map cleanly:     
┌────────────────────────┬──────────────────────────────────────────────────────┐    
│ Scenario               │    Path                                              │    
├────────────────────────┼──────────────────────────────────────────────────────┤    
│ UI chat (human direct) │ Browser → nginx → Codex Broker                       │    
├────────────────────────┼──────────────────────────────────────────────────────┤    
│ Instance-to-instance   │ Instance → nginx → MCP → (HACS proxy) → Codex Broker │    
└────────────────────────┴──────────────────────────────────────────────────────┘    
The HACS proxy layer for instance-to-instance gives you: 
- Auth/permission checking   
- Logging/auditing    
- Rate limiting
- The coordination layer     

The direct path for UI gives you:   
- Low latency  
- Multiple tabs/conversations
- Clean separation    

You're not reinventing the wheel - nginx handles the HTTP/SSL/streaming transport. Your broker is just the "which process gets this message" 
routing + lifecycle glue. Thin and focused.

## Lupo's Additional requirements, Docker Container and Remote Instances
❯ AH, yeah this makes sense. reverse proxy really is for loadbalancing between things that .. already exist. that weas perfect, thank you!\                  
  before we get to thing 2, a couple of follow up questions, I'm thinking i would like to put the broker and the streaming codex sessions in their             
  own docker container. I might want something else besides the hacs mcp/http server to be able to talk to the broker, also I think i want to isolate this     
  functionality into it's own container that can be managed seporately from hacs. \     
  I am a little unclear on re-connect, how we manage session history, there have been situations when a session on my laptop drops and then later i resume     
  the session on my dev pc or even my phone, and in those resume'd sessions I'd want to see the full conversation history.. \                                  
  Also, if the broker, and codex sessions are in a docker container, it seems to be to be a "cleaner" solution if I want to enable support for these long      
  running sessions to run on some other remote machine (I'm thinking the broker would default to routing to/from local instances, but in some cases an         
  instance could be in another docker container on the same machine or even remotely. in this case, the broker would just route messages to                    
  hostname:port:InstanceID:message and the remote broker would just communicate as if it was talking to a local HACS instance. i'm assuming that if local      
  communication is through a service listening to a port that responding/communicating with a remote machine is just a matter of the broker having CORS        
  set up to allow communication from a remote machine in addition to localhost.. yeah? or am I crazy? The specific scenario I'm trying to enable is to         
  have a team of instances working on a project on smoothcurves.nexus, but have one of the team members be a remote instance running on my laptop so it        
  has access to a web browser. The Project manager instance, and I can interact with this remote instance via wake and continue just like it is an             
  instance running locally. the "remoteness" of the instance is handled by the broker, abstracted away. There will still be instance registration info         
  locally so the broker knows how to communicate with the instance (that is kept in the instances's own preferences.json file) and we already have support     
  for a "hostname" \           
  So... i think I'm asking for clarification of a couple things\                        
  is it reasonable to run the broker and these long running codex sessions in their own docker container\                                                      
  is it a resonable to think that with some additional work, "remote" instances could be supported by adding remote instance proxy code to the broker          
## Bastion's response            
∴ Thinking…      
                 
  Lupo is asking some really good architectural questions. Let me break these down:     
                 
  1. Docker container for broker + Codex sessions - Is this reasonable?                 
  2. Session history and reconnect - How to manage conversation state across client reconnects        
  3. Remote instances - Can the broker route to instances on different machines?        
                 
  Let me think through each:   
                 
  1. Docker container - Yes, absolutely reasonable                                      
                 
  Benefits:      
  - Isolation from HACS (can restart/update independently)                              
  - Resource limits (memory, CPU)                                                       
  - Portability (can move to different host)                                            
  - Clean dependency management                                                         
  - Security boundary          
                 
  Considerations:              
  - Networking: The container needs to talk to HACS and clients                         
  - State: Where does session history live? Volume mount or external storage?           
  - Process spawning: Codex processes inside the container                              
                 
  2. Session history and reconnect                                                      
                 
  This is the stateful part that needs careful thought:                                 
  - The broker needs to persist conversation history somewhere                          
  - Options:     
    - In-memory (lost on restart - bad)                                                 
    - File-based (in a volume mount)                                                    
    - Database (SQLite, Postgres, etc.)                                                 
    - The existing HACS data structures (v2-dev/instances/{id}/...)                     
                 
  When a client reconnects:    
  - They provide instanceId    
  - Broker looks up session history                                                     
  - Sends history to client (or client fetches via separate endpoint)                   
  - Resumes streaming          
                 
  This is similar to how chat apps work - the server is the source of truth for history, client can reconnect and fetch.                                       
                 
  3. Remote instances - Yes, this is very reasonable                                    
                 
  The broker becomes a router that knows:                                               
  - Local instances: route to local child_process                                       
  - Remote instances: route to remote broker via HTTP/WebSocket                         
                 
  The instance's preferences.json already has hostname - this could be extended to include:           
  - brokerHost: where this instance's broker lives                                      
  - brokerPort: port           
                 
  When the local broker gets a message for a remote instance:                           
                 
  It looks up the instance's broker location, forwards the message to that remote broker, which delivers it to its local process, and the response streams     
  back. This creates a federated broker architecture where CORS handles browser clients talking cross-origin, but broker-to-broker communication stays         
  server-to-server. The laptop scenario would have Broker A on the main machine routing to Broker B on the laptop, with each managing their local instances.   
                 
  When PM-Instance sends a message to BrowserBot, it goes to Broker A first, which recognizes BrowserBot is remote and forwards to Broker B, which then        
  delivers it locally. The key advantage is that this broker abstraction makes location completely transparent—wake and continue operations work identically   
  whether the target instance is local or remote. CORS only matters for direct browser-to-broker connections; broker-to-broker communication bypasses those    
  restrictions entirely.       
                 
● You're not crazy. This is a well-trodden path - you're describing a federated broker architecture. Let me address each question:                             
                 
  ---            
  Is it reasonable to run broker + Codex sessions in their own Docker container?        
                 
  Yes, very. This gives you:   
  ┌───────────────────┬───────────────────────────────────────────────────────────────┐ 
  │      Benefit      │                        Why it matters                         │ 
  ├───────────────────┼───────────────────────────────────────────────────────────────┤ 
  │ Isolation         │ Restart/update broker without touching HACS                   │ 
  ├───────────────────┼───────────────────────────────────────────────────────────────┤ 
  │ Resource limits   │ Codex sessions can be memory-hungry, contain the blast radius │ 
  ├───────────────────┼───────────────────────────────────────────────────────────────┤ 
  │ Portability       │ Move to different host when needed                            │ 
  ├───────────────────┼───────────────────────────────────────────────────────────────┤ 
  │ Clean networking  │ Explicit port exposure, container-to-container communication  │ 
  ├───────────────────┼───────────────────────────────────────────────────────────────┤ 
  │ Security boundary │ Codex processes can't touch HACS data directly                │ 
  └───────────────────┴───────────────────────────────────────────────────────────────┘ 
  One consideration: session state storage. If the container restarts, where does conversation history live?                                                   
  - Volume mount to host filesystem, OR                                                 
  - External storage (SQLite file in volume, or connect to a DB), OR                    
  - Leverage existing HACS data structures (v2-dev/instances/{id}/conversations/)       
                 
  ---            
  Session history and reconnect:                                                        
                 
  The broker needs to be the source of truth for conversation history. Pattern:         
                 
  Client connects (laptop)     
      │          
      ▼          
  Broker: "instanceId=Foo-1234, here's your session"                                    
      │          
      ├── Client subscribes to output stream (SSE/WS)                                   
      ├── Client can fetch history: GET /sessions/{instanceId}/history                  
      │          
  Client disconnects (laptop closes)                                                    
      │          
  Broker: keeps session alive, buffers output                                           
      │          
  Client reconnects (phone)    
      │          
      ├── Fetch history (or broker pushes missed messages)                              
      └── Resume streaming     
                 
  The key: session state lives in broker, not client. Client is just a viewport.        
                 
  ---            
  Remote instances - is this reasonable?                                                
                 
  Absolutely. You're describing broker-to-broker federation:                            
                 
  smoothcurves.nexus                         Your Laptop                                
  ┌──────────────────────────┐              ┌──────────────────────────┐                
  │ Broker A (:3445)         │              │ Broker B (:3445)         │                
  │                          │◄────────────►│                          │                
  │  ├─ PM-Instance (local)  │  HTTP/WS     │  └─ BrowserBot (local)   │                
  │  ├─ Worker-1 (local)     │  server-to-  │      (has browser access)│                
  │  └─ BrowserBot (remote)──┼──server──────┼──►                       │                
  │      (proxy reference)   │              │                          │                
  └──────────────────────────┘              └──────────────────────────┘                
                 
  How routing works:           
                 
  1. PM-Instance sends message to BrowserBot                                            
  2. Broker A looks up BrowserBot's preferences → sees hostname: "laptop.local" or brokerEndpoint: "https://laptop:3445"                                       
  3. Broker A forwards to Broker B (server-to-server, no CORS needed)                   
  4. Broker B delivers to local BrowserBot process                                      
  5. Response streams back through the chain                                            
                 
  CORS clarification:          
  ┌────────────────────────────────────────────┬────────────────────────┐               
  │               Communication                │      CORS needed?      │               
  ├────────────────────────────────────────────┼────────────────────────┤               
  │ Browser → Local Broker                     │ Yes (browser security) │               
  ├────────────────────────────────────────────┼────────────────────────┤               
  │ Broker → Broker (server-to-server)         │ No                     │               
  ├────────────────────────────────────────────┼────────────────────────┤               
  │ Browser on laptop → Broker on smoothcurves │ Yes (cross-origin)     │               
  └────────────────────────────────────────────┴────────────────────────┘               
  So if you want the HACS UI on smoothcurves.nexus to directly stream from BrowserBot on your laptop, the laptop broker needs CORS allowing smoothcurves.nexus.
   But if all browser clients go through their "home" broker and brokers federate, no cross-origin browser calls needed.                                       
                 
  ---            
  Instance registration for remote:                                                     
                 
  You already have hostname in preferences. Extend to:                                  
                 
  {              
    "instanceId": "BrowserBot-1234",                                                    
    "hostname": "laptop.local",                                                         
    "brokerEndpoint": "https://laptop.local:3445",                                      
    "location": "remote"       
  }              
                 
  Local broker sees location: "remote" → proxies to brokerEndpoint instead of local process.          
                 
  ---            
  Summary:       
  ┌────────────────────────────────────┬────────────────────────────────────────────────────────────┐ 
  │              Question              │                           Answer                           │ 
  ├────────────────────────────────────┼────────────────────────────────────────────────────────────┤ 
  │ Docker container for broker?       │ Yes, clean isolation                                       │ 
  ├────────────────────────────────────┼────────────────────────────────────────────────────────────┤ 
  │ Session history across reconnects? │ Broker is source of truth, clients fetch/resume            │ 
  ├────────────────────────────────────┼────────────────────────────────────────────────────────────┤ 
  │ Remote instance support?           │ Yes, broker-to-broker federation                           │ 
  ├────────────────────────────────────┼────────────────────────────────────────────────────────────┤ 
  │ CORS?                              │ Only for direct browser→remote calls, not server-to-server │ 
  ├────────────────────────────────────┼────────────────────────────────────────────────────────────┤ 
  │ Location transparency?             │ Wake/continue work identically, broker handles routing     │ 
  └────────────────────────────────────┴────────────────────────────────────────────────────────────┘ 
  You're building a distributed session mesh. The broker abstraction makes it work.     
                 
# Lupo: ok let's implement this in phases
## Phase 1:
Extend pre-approve, wake, continue to support long running streaming sessions

implement broker : 
Broker starts codex sessions
Note: Codex sessions might "die" broker will need to be able to restart a "dead" instance
Note: Broker might die. need method for dead broker to restart
Note: "Zombie" instance sessions. broker might die, leaving codex sessions running with no connection to the outside world. and no way to reconnect the streaming stdio to a new broker do we just restart the container to kill zombie instances? or can we take over stdio of an existing running process? (I know the answer is yes, but this would be a ton of engineering risk. much easier to just restart docker container, instance communication is logged so a restart does not loose context)
implement broker and docker container
extend pre-approve, wake and continue to support long running instances. 
UI addition, long running instances get their chat dialog popped out into a new browser tab
Question: Session history? How is the session logged? How does the UI load session conversation history, codex session history is kept in it's session infrastructure. how do we save streaming session history? 
## phase 2: Remote instances. 
how is the remote container started (manually, or require ssh comms pre-existing)
how does the broker know an instance is remote
how is a remote container restarted/reconnected to in case of a disconnect (Manually)
how does a broker "sense" a remote server is alive/dead
note: this should be implemented "atomicly" a remote broker, is the same code as the "parent" broker. a remote broker could, in turn proxy to yet another remote instance.. and on down the line. 