#!/bin/bash

# complete-setup.sh - Automated setup for Simple Node.js MCP Agent
# Run this script in your simple-nodejs-mcp-agent directory

set -e

echo "🚀 Setting up Simple Node.js MCP Agent..."
echo "=========================================="

# Create directory structure
echo "📁 Creating directory structure..."
mkdir -p src public

# Create compose.yaml
echo "📝 Creating compose.yaml..."
cat > compose.yaml << 'EOF'
services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
      - MCP_GATEWAY_URL=http://mcp-gateway:8811/sse
    depends_on:
      - mcp-gateway
    models:
      gemma:
        endpoint_var: MODEL_RUNNER_URL
        model_var: MODEL_RUNNER_MODEL

  mcp-gateway:
    image: docker/mcp-gateway:latest
    ports:
      - "8811:8811"
    command:
      - --transport=sse
      - --servers=duckduckgo
      - --tools=search,fetch_content

models:
  gemma:
    model: ai/gemma3:4B-Q4_0
    context_size: 8192
EOF

# Create Dockerfile
echo "📝 Creating Dockerfile..."
cat > Dockerfile << 'EOF'
FROM node:20-slim

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Create non-root user
RUN useradd --create-home --shell /bin/bash app && \
    chown -R app:app /app

USER app

EXPOSE 3000

CMD ["npm", "start"]
EOF

# Create package.json
echo "📝 Creating package.json..."
cat > package.json << 'EOF'
{
  "name": "simple-nodejs-mcp-agent",
  "version": "1.0.0",
  "description": "A simple AI agent built with Node.js that uses Model Context Protocol (MCP)",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "node --watch server.js"
  },
  "keywords": ["mcp", "ai", "agent", "nodejs", "docker"],
  "author": "Ajeet Singh Raina",
  "license": "MIT",
  "dependencies": {
    "express": "^4.19.2",
    "cors": "^2.8.5",
    "eventsource": "^2.0.2",
    "node-fetch": "^3.3.2",
    "openai": "^4.56.0",
    "ws": "^8.18.0",
    "uuid": "^9.0.1"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
EOF

# Create .env.example
echo "📝 Creating .env.example..."
cat > .env.example << 'EOF'
# Application Configuration
NODE_ENV=development
PORT=3000

# MCP Gateway Configuration
MCP_GATEWAY_URL=http://mcp-gateway:8811/sse

# Model Configuration
MODEL_RUNNER_URL=http://host.docker.internal:11434
MODEL_RUNNER_MODEL=gemma3:4B-Q4_0

# Optional: OpenAI API Key (if using cloud models instead of local)
# OPENAI_API_KEY=your_openai_api_key_here
EOF

echo "✅ Setup complete!"
echo ""
echo "🔧 Next steps:"
echo "1. Run: chmod +x complete-setup.sh && ./complete-setup.sh"
echo "2. Copy remaining files from Claude's artifacts:"
echo "   - server.js"
echo "   - src/mcpAgent.js" 
echo "   - public/index.html"
echo "   - README.md"
echo "   - debug-mcp.js"
echo "3. Test: docker compose up --build"
echo "4. Push to GitHub: git add . && git commit -m 'feat: Complete MCP Agent' && git push"
