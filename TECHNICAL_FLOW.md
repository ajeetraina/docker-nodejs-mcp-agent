# System Flow Documentation

## Complete Request Processing Flow

### Phase 1: Request Initialization
```
1. User Interface
   └── HTML form submission
   └── JavaScript fetch() to /chat endpoint
   └── Request body: {"message": "user query"}

2. Express Server
   └── Route: POST /chat
   └── Middleware: express.json() parsing
   └── Handler: SimpleAgent.processQuery(message)
```

### Phase 2: Query Analysis
```
3. SimpleAgent.processQuery()
   └── Keyword analysis for capability requirements
   ├── needsWebSearch() - checks for search keywords
   ├── needsFileOperation() - checks for file keywords  
   └── Tool selection decision tree
```

### Phase 3: MCP Tool Execution (Conditional)
```
4. If search required:
   └── MCPSSEClient.callTool("search", params)
   ├── Connect to MCP Gateway via SSE transport
   ├── JSON-RPC message construction
   ├── HTTP POST to http://mcp-gateway:8811
   └── Gateway routing to DuckDuckGo MCP server

5. MCP Server Processing
   └── DuckDuckGo MCP server
   ├── Execute web search query
   ├── Parse and filter results
   └── Return structured search data
```

### Phase 4: Context Assembly
```
6. Result Processing
   ├── If MCP success: combine search results with query
   ├── If MCP failure: prepare fallback prompt
   └── Format prompt for model inference
```

### Phase 5: Model Inference
```
7. SimpleAgent.callModel()
   └── Endpoint: http://model-runner.docker.internal:11434/v1/chat/completions
   ├── Request body construction
   ├── OpenAI-compatible API call
   └── Docker Model Runner processing

8. Model Processing
   └── gemma3-qat model inference
   ├── Context window: 8192 tokens
   ├── Temperature: 0.1 (deterministic)
   ├── Max tokens: 500
   └── Response generation
```

### Phase 6: Response Assembly
```
9. Response Construction
   └── JSON object assembly
   ├── query: original user input
   ├── toolUsed: MCP tool identifier or null
   ├── toolResult: search data or error
   ├── response: model-generated text
   ├── timestamp: ISO 8601 format
   └── note: fallback indicators if applicable

10. Client Delivery
    └── HTTP 200 response with JSON payload
    └── Frontend JavaScript updates UI
```

## Error Handling Flows

### MCP Gateway Failure
```
Request → Query Analysis → MCP Attempt → Failure
                               ↓
                        Fallback to Model Only
                               ↓
                        Model Inference → Response
```

### Model Runner Failure  
```
Request → Query Analysis → MCP Success → Model Attempt → Failure
                                              ↓
                                        Error Response with Details
```

### Complete System Failure
```
Request → Any Component Failure → Generic Error Handler
                    ↓
            Structured Error Response with Troubleshooting
```

## Data Flow Patterns

### Successful MCP + Model Flow
```
User Query
    ↓
Keyword Detection (search, latest, find, etc.)
    ↓
MCP Gateway Connection (SSE transport)
    ↓
DuckDuckGo Search Execution
    ↓
Search Results Aggregation
    ↓
Context Prompt Assembly (query + results)
    ↓
Local Model Inference (gemma3-qat)
    ↓
Intelligent Response (search-informed)
```

### Model-Only Flow
```
User Query
    ↓
Keyword Detection (no search triggers)
    ↓
Direct Prompt Construction
    ↓
Local Model Inference (gemma3-qat)
    ↓
Knowledge-Based Response
```

## Technical Implementation Details

### MCPSSEClient Communication
```javascript
// Connection establishment
fetch(mcp-gateway:8811/sse, {
  method: 'GET',
  headers: {'Accept': 'text/event-stream'}
})

// Tool invocation
fetch(mcp-gateway:8811, {
  method: 'POST',
  body: {
    jsonrpc: "2.0",
    method: "tools/call",
    params: {name: "search", arguments: {...}}
  }
})
```

### Model Runner Integration
```javascript
// OpenAI-compatible API call
fetch(model-runner.docker.internal:11434/v1/chat/completions, {
  method: 'POST',
  body: {
    model: "ai/gemma3-qat",
    messages: [{role: "user", content: prompt}],
    temperature: 0.1,
    max_tokens: 500
  }
})
```

### Docker Compose Service Dependencies
```yaml
# Dependency chain
app → depends_on → mcp-gateway
app → models → gemma → docker-model-runner
mcp-gateway → docker-network → duckduckgo-mcp-server
```

## Performance Characteristics

### Latency Breakdown
- Network routing: 10-50ms
- MCP tool execution: 500-2000ms (web search)
- Model inference: 1000-5000ms (depending on GPU)
- Response assembly: 10-50ms
- **Total typical latency: 1.5-7 seconds**

### Resource Utilization
- Memory: 4GB+ for gemma3-qat model
- CPU: Moderate during inference
- GPU: High utilization during model inference
- Network: Minimal bandwidth requirements

### Scaling Considerations
- Model runner supports request queuing
- MCP Gateway handles concurrent tool calls
- Express server supports multiple simultaneous connections
- Docker Compose manages resource allocation

## Security Model

### Network Isolation
```
Frontend (port 3000) ← User Access
    ↓
App Container ← Internal Network
    ↓  
MCP Gateway (port 8811) ← Internal Network
    ↓
MCP Servers ← Containerized Isolation
```

### Data Flow Security
- No external API keys required for base functionality
- Local model inference (no data leaves system)
- MCP Gateway provides isolation layer
- Docker network segmentation

This comprehensive flow documentation explains how your Node.js MCP agent processes requests through the entire Agentic Compose architecture, from user input to final response delivery.