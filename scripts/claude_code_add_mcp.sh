export SSE_SERVER_URL="https://localhost:3444/mcp"
claude mcp add --scope user --transport stdio  coordination-system-proxy cmd /c node "D:\\Lupo\\Source\\AI\\CladueCOO\\mcp-coordination-system\\mcp-proxy-client.js" 
# claude mcp add --scope user --transport sse  coordination-system-SSE url $SSE_SERVER_URL env "NODE_TLS_REJECT_UNAUTHORIZED : 0"