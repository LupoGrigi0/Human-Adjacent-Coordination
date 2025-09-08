# MCP Coordination System - Web UI Usage Guide

## Quick Start

### 1. Start the System
```bash
# Terminal 1: Start MCP Server
cd mcp-coordination-system
npm run start:server
# Server runs on http://localhost:3000

# Terminal 2: Start Web UI
cd web-ui
python -m http.server 8080
# UI available at http://localhost:8080
```

### 2. Open the Interface
Navigate to: **http://localhost:8080**

You should see:
- Header with "MCP Coordination System" title
- Server status indicator (should show "Connected" in green)
- Dashboard with system metrics

## Testing the System

### Test 1: Bootstrap an AI Instance
1. **Go to Dashboard tab** (should be active by default)
2. **In the "Quick Bootstrap" card:**
   - Select role: "COO - Chief Operating Officer"
   - Enter name: "Alice-2025-08-23-test"
   - Click "Bootstrap Instance"
3. **Verify success:**
   - Should switch to API Test tab automatically
   - Response shows welcome message and available functions
   - System log shows success message

### Test 2: Use API Testing Interface
1. **Go to API Test tab**
2. **Test health endpoint:**
   - Select: "GET /health - Health Check"
   - Click "Send Request" 
   - Should see server status and uptime
3. **Test bootstrap endpoint:**
   - Select: "POST /api/mcp/bootstrap - Bootstrap Instance"
   - In request body: `{"role": "PA", "instanceId": "Bob-Test"}`
   - Click "Send Request"
   - Should see full bootstrap response

### Test 3: Explore Other Features
1. **Projects Tab:**
   - See mock projects (Collections Rescue, Portfolio Migration, Lab Setup)
   - Projects show priority badges and progress
2. **Tasks Tab:**
   - Kanban board with Pending, In Progress, Completed columns
   - Sample tasks show different priorities and metadata
3. **Instances Tab:**
   - Shows bootstrapped AI instances
   - Displays role, status, and activity info

## Real Usage Scenarios

### Scenario 1: COO Coordination
**Use Case:** COO instance needs to coordinate multiple projects

1. **Bootstrap as COO:**
   ```json
   {"role": "COO", "instanceId": "COO-Main-2025-08-23"}
   ```

2. **Check available functions** (from bootstrap response):
   - get_system_status()
   - get_project_list() 
   - create_project()
   - get_pending_tasks()

3. **Use API Test to call functions:**
   - Endpoint: "POST /api/mcp/call"
   - Body: `{"function": "get_system_status", "params": {}}`

### Scenario 2: PA Task Management
**Use Case:** Personal Assistant managing daily tasks

1. **Bootstrap as PA:**
   ```json
   {"role": "PA", "instanceId": "PA-TaskManager"}
   ```

2. **View available tasks** in Tasks tab
3. **Use function calls to claim tasks:**
   ```json
   {"function": "claim_task", "params": {"task_id": "task-123"}}
   ```

### Scenario 3: PM Project Oversight
**Use Case:** Project Manager tracking specific project

1. **Bootstrap as PM:**
   ```json
   {"role": "PM", "instanceId": "PM-Collections"}
   ```

2. **Check project details:**
   ```json
   {"function": "get_project_details", "params": {"project_id": "collections-rescue"}}
   ```

## Interface Features

### Dashboard
- **Server Status**: Real-time connection monitoring
- **System Metrics**: Uptime, version, health status
- **Quick Stats**: Projects, tasks, instances count
- **Bootstrap Panel**: Create new AI instances
- **System Log**: Activity feed with timestamps

### Projects Tab
- **Project Cards**: Visual project overview
- **Priority Badges**: Color-coded importance levels
- **Progress Tracking**: Task completion ratios
- **Search/Filter**: Find projects by status or name

### Tasks Tab
- **Kanban Board**: Visual workflow management
- **Task Cards**: Drag-drop interface (visual only)
- **Priority Colors**: Red (high), yellow (medium), green (low)
- **Status Columns**: Pending → In Progress → Completed

### Instances Tab
- **Instance Cards**: AI instance overview
- **Role Badges**: Color-coded by role type
- **Status Indicators**: Active/inactive states
- **Activity Tracking**: Last seen timestamps

### API Test Tab
- **Endpoint Selection**: All available endpoints
- **Request Builder**: JSON request body editor
- **Response Viewer**: Formatted JSON responses
- **Error Handling**: Clear error messages

## Troubleshooting

### Server Connection Issues
**Problem**: Status shows "Offline" or "Checking..."

**Solutions:**
1. Verify MCP server is running on port 3000
2. Check browser console for CORS errors
3. Ensure no firewall blocking localhost connections
4. Try: `curl http://localhost:3000/health`

### Bootstrap Failures
**Problem**: Bootstrap returns error or fails

**Common Issues:**
1. **Empty instance name**: Must provide unique ID
2. **Invalid role**: Must be COO, PA, PM, or Executive  
3. **Server not ready**: Check server health first
4. **CORS issues**: Server must allow browser requests

### UI Not Loading
**Problem**: Web interface doesn't display properly

**Solutions:**
1. Check if web server is running on port 8080
2. Try different browser (Chrome/Firefox recommended)
3. Disable browser extensions that might interfere
4. Check browser console for JavaScript errors

### API Calls Failing
**Problem**: API test returns errors

**Check:**
1. MCP server running and healthy
2. Correct endpoint selected
3. Valid JSON in request body
4. Server logs for detailed error info

## Advanced Usage

### Custom Function Calls
Use the API Test interface to call any MCP function:

```json
{
  "function": "create_project", 
  "params": {
    "name": "New Project",
    "description": "Project description",
    "priority": "high"
  }
}
```

### Multiple Instances
Bootstrap multiple AI instances with different roles:
- COO: System oversight and coordination
- PA: Task execution and management  
- PM: Project-specific management
- Executive: Read-only monitoring

### Integration Testing
Test coordination between instances:
1. Bootstrap COO instance
2. COO creates project via API call
3. Bootstrap PA instance  
4. PA claims tasks from project
5. Monitor progress in UI

## Data Flow

1. **User Action** → Web UI JavaScript
2. **API Call** → MCP Coordination Server  
3. **Function Execution** → Server processes request
4. **Response** → Back to Web UI
5. **UI Update** → Visual feedback to user

## Security Notes

- Currently no authentication (development mode)
- CORS enabled for localhost
- Rate limiting active (100 requests/15min)
- Data stored locally in server file system

## Performance

- **Update Interval**: 5 seconds for real-time data
- **Response Time**: Usually < 100ms for API calls
- **Browser Requirements**: ES6+ support needed
- **Mobile Support**: Responsive design works on tablets/phones

---

This interface provides a complete testing and coordination environment for the MCP Coordination System. It's both a demonstration of capabilities and a practical tool for AI instance management.

**Next Steps:**
1. Use the interface to test MCP functions
2. Bootstrap multiple instances to test coordination
3. Explore API capabilities through interactive testing
4. Provide feedback for backend implementation priorities