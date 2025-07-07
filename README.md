# Simple Node.js MCP Agent


An AI agent built with Node.js using Model Context Protocol (MCP) and Docker Model Runner for local AI inference.

![image](https://github.com/user-attachments/assets/79e3013e-4ea1-4bf2-92c4-b9671d401cac)


## Quick Start

```bash
# Local development
docker compose up --build

# With OpenAI 
echo "your-api-key" > secret.openai-api-key
docker compose -f compose.yaml -f compose.openai.yaml up

# With larger models 
docker compose -f compose.yaml -f compose.offload.yaml up --build
```

## Demo with Dashboard

```
docker compose -f compose.yaml -f compose.monitoring.yaml up --build
```

## Architecture

This project follows the standard 4-layer pattern used across the ecosystem:

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

By default, this project uses Docker Model Runner to handle LLM inference locally — after initial setup, no external API keys are required. 
The agent can operate offline for basic AI responses, though web search features require internet connectivity.


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

### Cloud-based GPU Resources

For cloud-based GPU resources with larger models (requires 16+ GB VRAM):
```bash
docker compose -f compose.yaml -f compose.offload.yaml up --build
```

**Benefits:**
- Uses `ai/gemma3:27B-Q4_K_M` for enhanced reasoning
- Larger context window (8192 tokens) for complex queries
- Automatic cloud GPU provisioning when local resources insufficient
- Seamless scaling from development to production workloads

### OpenAI Integration

If you'd prefer to use OpenAI instead:

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


### Over the Cloud (gemma3:27B)
- **Cold Start**: 60-120 seconds
- **Warm Inference**: 3-8 seconds  
- **Memory Usage**: ~16GB VRAM
- **Context Window**: 8192 tokens (expandable to 16384)
- **Enhanced Reasoning**: Better complex query handling

