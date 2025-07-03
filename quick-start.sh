#!/bin/bash

# 🤖 Simple Node.js MCP Agent - Quick Setup Script
# This script will clone the repo and start the agent

set -e

echo "🤖 Simple Node.js MCP Agent Setup"
echo "================================="
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker Desktop first:"
    echo "   https://www.docker.com/products/docker-desktop/"
    exit 1
fi

# Check if Docker Compose is available
if ! docker compose version &> /dev/null; then
    echo "❌ Docker Compose is not available. Please update Docker Desktop."
    exit 1
fi

echo "✅ Docker is installed and ready"
echo ""

# Clone the repository if not already in it
if [ ! -f "package.json" ]; then
    echo "📥 Cloning repository..."
    git clone https://github.com/ajeetraina/simple-nodejs-mcp-agent.git
    cd simple-nodejs-mcp-agent
    echo "✅ Repository cloned"
else
    echo "✅ Already in project directory"
fi

echo ""
echo "🚀 Starting the Simple MCP Agent..."
echo ""
echo "This will:"
echo "  • Download the qwen3 AI model (~2GB)"
echo "  • Start the MCP gateway with DuckDuckGo & filesystem tools"
echo "  • Launch the Node.js agent with web UI"
echo ""

# Start the services
docker compose up --build

echo ""
echo "🎉 Setup complete!"
echo ""
echo "📝 Usage:"
echo "  • Web UI: http://localhost:3000"
echo "  • Try: 'Search for latest AI news'"
echo "  • Try: 'List files in sample-data directory'"
echo ""
echo "🛑 To stop: Press Ctrl+C"
echo ""
echo "☁️  Optional - Use OpenAI instead of local model:"
echo "   1. Create file: secret.openai-api-key"
echo "   2. Add your API key: sk-..."
echo "   3. Run: docker compose -f compose.yaml -f compose.openai.yaml up"
