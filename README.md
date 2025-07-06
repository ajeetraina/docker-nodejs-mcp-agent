# Simple Node.js MCP Agent

An AI agent built with Node.js that implements the Agentic Compose pattern using Model Context Protocol (MCP) and Docker Model Runner for local AI inference.

## Architecture

This project follows the standard 4-layer Agentic Compose architecture pattern used across the ecosystem:

### Layer 1: Agent Application
- **Technology**: Node.js with Express.js web server
- **Components**: SimpleAgent class, MCPSSEClient, REST API endpoints
- **Function**: Query processing, routing, response coordination

### Layer 2: MCP Gateway
- **Technology**: Docker MCP Gateway with Server-Sent Events transport
- **Configuration**: `use_api_socket: true` for proper communication
- **Function**: Security layer and routing for MCP tool requests

### Layer 3: MCP Tools
- **Available Tools**: DuckDuckGo web search, file operations
- **Protocol**: Model Context Protocol via standardized JSON-RPC
- **Function**: External capability integration

### Layer 4: Model Runtime
- **Technology**: Docker Model Runner with gemma3-qat model
- **API**: OpenAI-compatible chat completions endpoint
- **Function**: Local language model inference

## Request Processing Flow

1. **Input Reception**: User submits query via web interface
2. **Query Analysis**: Agent analyzes query for required capabilities
3. **Tool Selection**: Determines if MCP tools are needed based on keywords
4. **MCP Execution**: If search required, calls DuckDuckGo via MCP Gateway
5. **Context Assembly**: Combines tool results with user query
6. **Model Inference**: Calls local gemma3-qat model with assembled context
7. **Response Formation**: Structures response with metadata and tool information
8. **Client Delivery**: Returns JSON response to web interface

## Configuration

By default, this project uses Docker Model Runner to handle LLM inference locally — no internet connection or external API key is required.



### Environment Variables used in this example
- `MCP_GATEWAY_URL`: MCP Gateway endpoint (standard naming)
- `MODEL_RUNNER_URL`: Docker Model Runner API endpoint
- `MODEL_RUNNER_MODEL`: Model identifier for inference
- `PORT`: Application server port (default: 3000)

## Prerequisites

- Docker Desktop 4.43.0+ or Docker Engine
- Docker Compose 2.38.1+ (required for models syntax)
- Docker Model Runner enabled in Docker Desktop
- Minimum 4GB RAM for model execution

## Installation and Deployment

### Local Development
```bash
git clone https://github.com/ajeetraina/simple-nodejs-mcp-agent.git
cd simple-nodejs-mcp-agent
docker compose up --build
```

### Docker Offload for GPU Workloads
For cloud-based GPU resources with larger models (requires 16+ GB VRAM):
```bash
docker compose -f compose.yaml -f compose.offload.yaml up --build
```

**Docker Offload benefits:**
- Uses `ai/gemma3:27B-Q4_K_M` (15.5GB) for enhanced reasoning
- Larger context window (8192 tokens) for complex queries
- Automatic cloud GPU provisioning when local resources insufficient
- Seamless scaling from development to production workloads

### Cloud Model Alternative
For environments without GPU resources:
```bash
echo "your-openai-api-key" > secret.openai-api-key
docker compose -f compose.yaml -f compose.openai.yaml up
```

## API Endpoints

### Health Check
```
GET /health
Response: System status and configuration
```

### Chat Interface
```
POST /chat
Body: {"message": "user query"}
Response: {
  "query": "string",
  "toolUsed": "string|null", 
  "response": "string",
  "timestamp": "ISO string"
}
```

## Error Handling

The agent implements comprehensive error handling:

- **MCP Gateway Failures**: Automatic fallback to model-only responses
- **Model API Errors**: Detailed error reporting with troubleshooting guidance
- **Network Timeouts**: Graceful degradation with informative messages
- **Invalid Queries**: Input validation with helpful error responses

## Performance Characteristics

### Local Development (gemma3-qat)
- **Cold Start**: 30-60 seconds
- **Warm Inference**: 2-5 seconds
- **Memory Usage**: ~4GB
- **Context Window**: 8192 tokens

### Docker Offload (gemma3:27B)
- **Cold Start**: 60-120 seconds
- **Warm Inference**: 3-8 seconds  
- **Memory Usage**: ~16GB VRAM
- **Context Window**: 8192 tokens (expandable to 16384)
- **Enhanced Reasoning**: Better complex query handling

## Development

### Project Structure
```
simple-nodejs-mcp-agent/
├── app.js                    # Main application server
├── package.json              # Node.js dependencies
├── Dockerfile               # Container configuration
├── compose.yaml             # Standard deployment
├── compose.openai.yaml      # Cloud model override
├── compose.offload.yaml     # Docker Offload with larger model
├── public/index.html        # Web interface
├── TECHNICAL_FLOW.md        # System flow documentation
└── README.md               # Documentation
```


