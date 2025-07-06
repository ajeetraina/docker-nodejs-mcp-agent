# Simple Node.js MCP Agent

A simple AI agent built with Node.js that follows the **Agentic Compose** pattern using Model Context Protocol (MCP) and Docker Model Runner for local AI inference.

## Features

- ✅ **Standard Agentic Compose Architecture** - Follows the same pattern as Spring AI demos
- 🧠 Local AI Models via Docker Model Runner (gemma3-qat)
- 🔧 MCP Tools: Web search (DuckDuckGo) 
- 🌐 Simple Web UI for chatting with the agent
- 🐳 Docker Compose setup - just one command to run
- ⚡ Lightweight - minimal Node.js implementation

## Quick Start

### Prerequisites
- Docker Desktop 4.43.0+ or Docker Engine  
- Docker Compose 2.38.1+ (for models syntax support)
- A laptop with GPU (or use Docker Offload)

### Run the Agent

1. Clone this repository:
```bash
git clone https://github.com/ajeetraina/simple-nodejs-mcp-agent.git
cd simple-nodejs-mcp-agent
```

2. Start everything with Docker Compose:
```bash
docker compose up --build
```

3. Open your browser to: http://localhost:3000

That's it!

## Try These Examples

- "Search for latest AI news" - Uses DuckDuckGo MCP
- "What is quantum computing?" - Web search + AI reasoning
- "Search for Node.js best practices" - Technical research

## Agentic Compose Architecture

This project follows the **standard 4-layer Agentic Compose pattern** used across the ecosystem:

```
┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
│   Web Browser   │◄──►│ Node.js Agent   │◄──►│  MCP Gateway    │
│  (Frontend UI)  │   │    (app.js)     │   │  (use_api_socket)│
└─────────────────┘   └─────────────────┘   └─────────────────┘
                        │                     │
                        ▼                     ▼
                ┌─────────────────┐   ┌─────────────────┐
                │ Docker Model    │   │ MCP Servers:    │
                │ Runner (gemma3) │   │ • DuckDuckGo    │
                │                 │   │                 │
                └─────────────────┘   └─────────────────┘
```

### Architecture Layers:
1. **Agent Application Layer**: Node.js app with Express UI
2. **MCP Gateway Layer**: Docker MCP Gateway with API socket
3. **MCP Tools Layer**: DuckDuckGo search integration  
4. **Model Layer**: Local gemma3-qat via Docker Model Runner

## Configuration Pattern

Following **Spring AI Agentic Compose** conventions:

```yaml
services:
  app:
    environment:
      - MCP_GATEWAY_URL=http://mcp-gateway:8811  # Standard naming
    models:
      gemma:
        endpoint_var: MODEL_RUNNER_URL
        model_var: MODEL_RUNNER_MODEL

  mcp-gateway:
    image: docker/mcp-gateway:latest
    use_api_socket: true  # Critical for proper MCP communication
    command:
      - --transport=sse
      - --servers=duckduckgo

models:
  gemma:
    model: ai/gemma3-qat  # Standard optimized model
```

## Project Structure

```
simple-nodejs-mcp-agent/
├── app.js              # Main Node.js agent
├── package.json        # Dependencies  
├── Dockerfile          # Container config
├── compose.yaml        # Standard Agentic Compose setup
├── compose.openai.yaml # OpenAI cloud override
├── public/
│   └── index.html      # Web UI
├── sample-data/        # Sample files (auto-created)
├── FIXES.md            # Configuration fixes applied
└── README.md           # This file
```

## How It Works

1. User sends message via web UI
2. Node.js agent analyzes the request  
3. Calls MCP tools through Gateway (search web, read files, etc.)
4. Sends context to local AI model (gemma3-qat)
5. Returns intelligent response to user

## Customization

### Add More MCP Servers
Edit `compose.yaml` following the standard pattern:

```yaml
mcp-gateway:
  command:
    - --servers=duckduckgo,filesystem,github,postgres
    # Add any MCP servers you want!
```

### Use Different Model
Edit `compose.yaml`:

```yaml
models:
  gemma:
    model: ai/llama3.2:3B-Q4_0   # Change model
```

## Available MCP Tools

- search_web: Search the internet via DuckDuckGo
- read_file: Read files from filesystem  
- list_files: List directory contents

## Alternative: Cloud Models

For testing without local GPU requirements:

```bash
echo "your-openai-key" > secret.openai-api-key
docker compose -f compose.yaml -f compose.openai.yaml up
```

## Troubleshooting

**Port 3000 already in use?**
```bash
# Change port in compose.yaml
ports:
  - "3001:3000"  # Use port 3001 instead
```

**Model download taking too long?**
```bash
# Use smaller model in compose.yaml
model: ai/gemma3:2B-Q4_0
```

**MCP Gateway issues?**
- Ensure `use_api_socket: true` is set
- Check gateway logs: `docker compose logs mcp-gateway`
- Verify port 8811 is available

## Requirements

- Docker Compose 2.38.1+ (required for models syntax)
- Docker Model Runner enabled in Docker Desktop
- gemma3-qat model (will be pulled automatically)

## Compatibility

This project follows the **Agentic Compose** standard used by:
- Spring AI MCP demos
- CrewAI implementations  
- LangGraph agents
- ADK multi-agent systems

All use the same 4-layer architecture and configuration patterns.

## License

MIT License - Feel free to use and modify!

## Next Steps

Want to extend this agent? Try adding:
- More MCP servers (GitHub, Slack, Postgres)
- Multi-agent workflows  
- Memory/conversation history
- Custom tools and functions
- Web scraping capabilities

See the [Agentic Compose repository](https://github.com/ajeetraina/compose-for-agents) for more examples!