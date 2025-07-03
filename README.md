# Simple Node.js MCP Agent

A super simple AI agent built with Node.js that uses **Model Context Protocol (MCP)** and **Docker Model Runner** for local AI inference.

## Features

- **Local AI Models** via Docker Model Runner (qwen3)
- **MCP Tools**: Web search (DuckDuckGo) + File operations  
- **Simple Web UI** for chatting with the agent
- **Docker Compose** setup - just one command to run
- ⚡ **Lightweight** - minimal Node.js implementation

## Quick Start

### Prerequisites
- **Docker Desktop 4.43.0+** or **Docker Engine** 
- **A laptop with GPU** (or use Docker Offload)
- **Docker Compose 2.38.1+** (Linux)

### Run the Agent

1. **Clone this repository**:
```bash
git clone https://github.com/ajeetraina/simple-nodejs-mcp-agent.git
cd simple-nodejs-mcp-agent
```

2. **Start everything** with Docker Compose:
```bash
docker compose up --build
```

3. **Open your browser** to: http://localhost:3000

That's it! 🎉

## Try These Examples

- **"Search for latest AI news"** - Uses DuckDuckGo MCP
- **"List files in current directory"** - Uses filesystem MCP  
- **"What is quantum computing?"** - Web search + AI reasoning
- **"Search for Node.js best practices"** - Technical research

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Web Browser   │◄──►│  Node.js Agent  │◄──►│  MCP Gateway    │
│  (Frontend UI)  │    │   (app.js)      │    │   (Tools)       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                  │                     │
                                  ▼                     ▼
                       ┌─────────────────┐    ┌─────────────────┐
                       │ Docker Model    │    │ MCP Servers:    │
                       │ Runner (qwen3)  │    │ • DuckDuckGo    │
                       │                 │    │ • Filesystem    │
                       └─────────────────┘    └─────────────────┘
```

## Project Structure

```
simple-nodejs-mcp-agent/
├── app.js              # Main Node.js agent
├── package.json        # Dependencies  
├── Dockerfile          # Container config
├── compose.yaml        # Docker Compose setup
├── public/
│   └── index.html      # Web UI
├── sample-data/        # Sample files (auto-created)
└── README.md           # This file
```

## How It Works

1. **User sends message** via web UI
2. **Node.js agent** analyzes the request  
3. **Calls MCP tools** (search web, read files, etc.)
4. **Sends context to local AI** model (qwen3)
5. **Returns intelligent response** to user

## Customization

### Add More MCP Servers
Edit `compose.yaml`:

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
  qwen3:
    model: ai/llama3.2:3B-Q4_0  # Change model
    context_size: 16384         # Adjust context
```

### Use OpenAI Instead
Create `secret.openai-api-key` file:
```
sk-your-key-here
```

Then run:
```bash
docker compose -f compose.yaml -f compose.openai.yaml up
```

## Available MCP Tools

- **🔍 search_web**: Search the internet via DuckDuckGo
- **📁 read_file**: Read files from filesystem  
- **📋 list_files**: List directory contents

## Troubleshooting

**Port 3000 already in use?**
```bash
# Change port in compose.yaml
ports:
  - "3001:3000"  # Use port 3001 instead
```

**Model download taking too long?**
```bash
# Use smaller model
model: ai/qwen3:1.5B-Q4_0
```

**GPU not detected?**
- Ensure Docker Desktop has GPU access enabled
- Or use Docker Offload for cloud inference

## License

MIT License - Feel free to use and modify!

## Next Steps

Want to extend this agent? Try adding:
- More MCP servers (GitHub, Slack, Postgres)
- Multi-agent workflows  
- Memory/conversation history
- Custom tools and functions
- Web scraping capabilities

Happy building! 🚀
