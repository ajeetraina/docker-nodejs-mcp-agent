# Simple Node.js MCP Agent

A production-ready AI agent built with Node.js that implements the Agentic Compose pattern using Model Context Protocol (MCP) and Docker Model Runner for local AI inference.

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

### Standard Agentic Compose Pattern
```yaml
services:
  app:
    environment:
      - MCP_GATEWAY_URL=http://mcp-gateway:8811
    models:
      gemma:
        endpoint_var: MODEL_RUNNER_URL
        model_var: MODEL_RUNNER_MODEL

  mcp-gateway:
    image: docker/mcp-gateway:latest
    use_api_socket: true
    command:
      - --transport=sse
      - --servers=duckduckgo

models:
  gemma:
    model: ai/gemma3-qat
```

### Environment Variables
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

- **Cold Start**: Initial model loading requires 30-60 seconds
- **Warm Inference**: Subsequent queries process in 2-5 seconds
- **Memory Usage**: Approximately 4GB for gemma3-qat model
- **Concurrent Users**: Supports multiple simultaneous requests

## Compatibility

This implementation is compatible with other Agentic Compose frameworks:
- Spring AI MCP demonstrations
- CrewAI multi-agent systems
- LangGraph workflow implementations
- ADK agent development kit

All use identical configuration patterns and architectural principles.

## Troubleshooting

### Common Issues

**Model API 404 Errors**
- Verify Docker Model Runner is enabled
- Check model endpoint configuration
- Ensure gemma3-qat model is available

**MCP Gateway Connection Failures**
- Confirm `use_api_socket: true` setting
- Verify gateway container is running
- Check port 8811 availability

**Performance Issues**
- Ensure adequate GPU resources
- Consider using smaller models for development
- Monitor Docker resource allocation

### Diagnostic Commands
```bash
# Check service status
docker compose ps

# View application logs
docker compose logs app

# Test model runner
curl http://localhost:11434/api/tags

# Verify MCP gateway
curl http://localhost:8811/health
```

## Development

### Project Structure
```
simple-nodejs-mcp-agent/
├── app.js                    # Main application server
├── package.json              # Node.js dependencies
├── Dockerfile               # Container configuration
├── compose.yaml             # Standard deployment
├── compose.openai.yaml      # Cloud model override
├── public/index.html        # Web interface
└── README.md               # Documentation
```

### Extension Points

The agent can be extended with additional capabilities:
- Additional MCP servers (GitHub, Slack, PostgreSQL)
- Custom tool implementations
- Multi-agent coordination
- Conversation memory and context persistence
- Authentication and authorization layers

## License

MIT License - See LICENSE file for details

## Contributing

Contributions are welcome. Please ensure all changes maintain compatibility with the standard Agentic Compose pattern.