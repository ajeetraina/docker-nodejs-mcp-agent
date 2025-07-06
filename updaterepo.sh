#!/bin/bash

# Enhanced Simple NodeJS MCP Agent Repository Update Script
# This script clones the repository and applies all enhanced files

set -e  # Exit on any error

# Configuration
REPO_URL="https://github.com/ajeetraina/simple-nodejs-mcp-agent.git"
REPO_DIR="simple-nodejs-mcp-agent"
BRANCH_NAME="enhanced-model-runner-setup"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if git is installed
check_dependencies() {
    print_status "Checking dependencies..."
    
    if ! command -v git &> /dev/null; then
        print_error "Git is not installed. Please install git first."
        exit 1
    fi
    
    if ! command -v docker &> /dev/null; then
        print_warning "Docker is not installed. You'll need it to run the application."
    fi
    
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        print_warning "Docker Compose is not installed. You'll need it to run the application."
    fi
    
    print_success "Dependencies checked"
}

# Clone or update repository
setup_repository() {
    print_status "Setting up repository..."
    
    if [ -d "$REPO_DIR" ]; then
        print_warning "Directory $REPO_DIR already exists. Removing..."
        rm -rf "$REPO_DIR"
    fi
    
    print_status "Cloning repository..."
    git clone "$REPO_URL" "$REPO_DIR"
    cd "$REPO_DIR"
    
    # Create new branch for enhanced setup
    print_status "Creating branch: $BRANCH_NAME"
    git checkout -b "$BRANCH_NAME"
    
    print_success "Repository setup complete"
}

# Create enhanced compose.yaml
create_compose_yaml() {
    print_status "Creating enhanced compose.yaml..."
    
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
      - MCP_GATEWAY_URL=http://mcp-gateway:8811
      # Fixed: Docker Model Runner uses port 12434 and /v1 endpoint
      - MODEL_RUNNER_URL=http://model-runner.docker.internal:12434/v1
      - MODEL_RUNNER_MODEL=ai/gemma3-qat
    depends_on:
      - mcp-gateway
    networks:
      - agent-network
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    models:
      gemma:
        endpoint_var: MODEL_RUNNER_URL
        model_var: MODEL_RUNNER_MODEL

  mcp-gateway:
    image: docker/mcp-gateway:latest
    use_api_socket: true
    ports:
      - "8811:8811"
    command:
      - --transport=sse
      - --servers=duckduckgo
      - --tools=search,fetch_content
    networks:
      - agent-network
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8811/health"]
      interval: 30s
      timeout: 10s
      retries: 3

# Model configuration for Docker Model Runner
models:
  gemma:
    model: ai/gemma3-qat
    context_size: 8192
    runtime_flags:
      - --no-prefill-assistant
      - --temperature=0.7
    health_check:
      enabled: true
      endpoint: "/v1/models"
      interval: "30s"

# Network configuration
networks:
  agent-network:
    driver: bridge
    name: simple-nodejs-agent-network
EOF
    
    print_success "Enhanced compose.yaml created"
}

# Create compose.offload.yaml
create_compose_offload() {
    print_status "Creating compose.offload.yaml..."
    
    cat > compose.offload.yaml << 'EOF'
# Override file for larger models with cloud GPU offloading
# Usage: docker compose -f compose.yaml -f compose.offload.yaml up --build

services:
  app:
    environment:
      # Override model for larger variant
      - MODEL_RUNNER_MODEL=ai/gemma3:27B-Q4_K_M
      # Increase timeout for larger model inference
      - MODEL_TIMEOUT=120000
      - MODEL_CONTEXT_SIZE=16384
    models:
      gemma:
        endpoint_var: MODEL_RUNNER_URL
        model_var: MODEL_RUNNER_MODEL

# Enhanced model configuration for larger model
models:
  gemma:
    model: ai/gemma3:27B-Q4_K_M
    context_size: 16384  # Larger context window
    runtime_flags:
      - --no-prefill-assistant
      - --temperature=0.7
      - --max-tokens=4096
      - --gpu-layers=32  # Enable GPU acceleration
    resource_requirements:
      memory: "16GB"
      vram: "16GB"
    health_check:
      enabled: true
      endpoint: "/v1/models"
      interval: "60s"  # Longer interval for larger model
      timeout: "30s"
EOF
    
    print_success "compose.offload.yaml created"
}

# Create compose.openai.yaml
create_compose_openai() {
    print_status "Creating compose.openai.yaml..."
    
    cat > compose.openai.yaml << 'EOF'
# Override file for OpenAI API instead of local model
# Usage: docker compose -f compose.yaml -f compose.openai.yaml up

services:
  app:
    environment:
      # Override to use OpenAI instead of local model runner
      - MODEL_RUNNER_URL=https://api.openai.com/v1
      - MODEL_RUNNER_MODEL=gpt-4o-mini
      - OPENAI_API_KEY_FILE=/run/secrets/openai_api_key
      - USE_OPENAI=true
    secrets:
      - openai_api_key
    models:
      openai:
        endpoint_var: MODEL_RUNNER_URL
        model_var: MODEL_RUNNER_MODEL

# OpenAI model configuration
models:
  openai:
    model: gpt-4o-mini
    context_size: 128000
    api_type: "openai"
    runtime_flags:
      - --temperature=0.7
      - --max-tokens=4096
    health_check:
      enabled: true
      endpoint: "/v1/models"
      interval: "30s"

# Secrets configuration for OpenAI API key
secrets:
  openai_api_key:
    file: ./secret.openai-api-key
EOF
    
    print_success "compose.openai.yaml created"
}

# Create enhanced Dockerfile
create_dockerfile() {
    print_status "Creating enhanced Dockerfile..."
    
    cat > Dockerfile << 'EOF'
# Multi-stage build for optimized Node.js MCP Agent
FROM node:18-alpine AS base

# Install system dependencies including curl for health checks
RUN apk add --no-cache \
    curl \
    dumb-init \
    && rm -rf /var/cache/apk/*

# Set working directory
WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S agent -u 1001 -G nodejs

# Copy package files
COPY package*.json ./

# Development stage
FROM base AS dependencies
RUN npm ci --include=dev

# Production stage
FROM base AS production-dependencies
RUN npm ci --only=production && npm cache clean --force

# Build stage
FROM dependencies AS build
COPY . .
# Add any build steps here if needed
# RUN npm run build

# Final production stage
FROM base AS production

# Copy production dependencies
COPY --from=production-dependencies /app/node_modules ./node_modules

# Copy application code
COPY --chown=agent:nodejs . .

# Ensure proper permissions
RUN chown -R agent:nodejs /app

# Switch to non-root user
USER agent

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "app.js"]
EOF
    
    print_success "Enhanced Dockerfile created"
}

# Create enhanced package.json
create_package_json() {
    print_status "Creating enhanced package.json..."
    
    cat > package.json << 'EOF'
{
  "name": "simple-nodejs-mcp-agent",
  "version": "1.0.0",
  "description": "A Simple NodeJS MCP Agent with Docker Model Runner integration",
  "main": "app.js",
  "scripts": {
    "start": "node app.js",
    "dev": "nodemon app.js",
    "test": "jest",
    "lint": "eslint .",
    "health": "curl -f http://localhost:3000/health"
  },
  "dependencies": {
    "express": "^4.18.2",
    "axios": "^1.6.0",
    "cors": "^2.8.5",
    "helmet": "^7.1.0",
    "morgan": "^1.10.0",
    "compression": "^1.7.4",
    "dotenv": "^16.3.1",
    "winston": "^3.11.0",
    "@modelcontextprotocol/sdk": "^0.5.0",
    "eventsource": "^2.0.2"
  },
  "devDependencies": {
    "nodemon": "^3.0.1",
    "jest": "^29.7.0",
    "eslint": "^8.54.0",
    "supertest": "^6.3.3"
  },
  "engines": {
    "node": ">=18.0.0",
    "npm": ">=8.0.0"
  },
  "keywords": [
    "nodejs",
    "mcp",
    "model-context-protocol",
    "docker",
    "model-runner",
    "ai",
    "agent",
    "gemma",
    "llm"
  ],
  "author": "Ajeet Raina",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/ajeetraina/simple-nodejs-mcp-agent.git"
  },
  "bugs": {
    "url": "https://github.com/ajeetraina/simple-nodejs-mcp-agent/issues"
  },
  "homepage": "https://github.com/ajeetraina/simple-nodejs-mcp-agent#readme"
}
EOF
    
    print_success "Enhanced package.json created"
}

# Create enhanced app.js (truncated for script - will reference original)
create_app_js() {
    print_status "Creating enhanced app.js..."
    
    # Check if app.js exists and backup
    if [ -f "app.js" ]; then
        cp app.js app.js.backup
        print_status "Original app.js backed up as app.js.backup"
    fi
    
    cat > app.js << 'EOF'
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const winston = require('winston');
const path = require('path');
require('dotenv').config();

// Initialize logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    }),
    new winston.transports.File({ filename: 'agent.log' })
  ]
});

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration from environment variables
const MCP_GATEWAY_URL = process.env.MCP_GATEWAY_URL || 'http://mcp-gateway:8811';
const MODEL_RUNNER_URL = process.env.MODEL_RUNNER_URL || 'http://model-runner.docker.internal:12434/v1';
const MODEL_RUNNER_MODEL = process.env.MODEL_RUNNER_MODEL || 'ai/gemma3-qat';
const USE_OPENAI = process.env.USE_OPENAI === 'true';

// Middleware
app.use(helmet());
app.use(cors());
app.use(compression());
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Simple Agent Class
class SimpleAgent {
  constructor() {
    this.mcpGatewayUrl = MCP_GATEWAY_URL;
    this.modelRunnerUrl = MODEL_RUNNER_URL;
    this.modelName = MODEL_RUNNER_MODEL;
    this.useOpenAI = USE_OPENAI;
  }

  // Determine if query requires MCP tools
  needsMCPTools(query) {
    const searchKeywords = [
      'search', 'find', 'lookup', 'what is', 'who is', 'when did', 'where is',
      'current', 'latest', 'recent', 'news', 'today', 'weather', 'price'
    ];
    
    return searchKeywords.some(keyword => 
      query.toLowerCase().includes(keyword.toLowerCase())
    );
  }

  // Execute MCP tool via gateway
  async executeMCPTool(tool, parameters) {
    try {
      const response = await axios.post(`${this.mcpGatewayUrl}/execute`, {
        tool,
        parameters
      }, {
        timeout: 30000,
        headers: { 'Content-Type': 'application/json' }
      });
      
      logger.info('MCP tool executed successfully', { tool, parameters });
      return response.data;
    } catch (error) {
      logger.warn('MCP tool execution failed', { 
        tool, 
        parameters, 
        error: error.message 
      });
      return null;
    }
  }

  // Call model runner for inference
  async callModel(prompt, context = null) {
    try {
      const payload = {
        model: this.modelName,
        messages: [
          {
            role: 'system',
            content: 'You are a helpful AI assistant. If provided with search results or context, use them to provide accurate and relevant responses.'
          },
          {
            role: 'user',
            content: context ? `Context: ${JSON.stringify(context)}\n\nQuery: ${prompt}` : prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 2048
      };

      const endpoint = `${this.modelRunnerUrl}/chat/completions`;
      const headers = { 'Content-Type': 'application/json' };

      if (this.useOpenAI && process.env.OPENAI_API_KEY) {
        headers['Authorization'] = `Bearer ${process.env.OPENAI_API_KEY}`;
      }

      const response = await axios.post(endpoint, payload, {
        timeout: this.useOpenAI ? 30000 : 120000,
        headers
      });

      logger.info('Model inference completed successfully');
      return response.data.choices[0].message.content;
    } catch (error) {
      logger.error('Model inference failed', { error: error.message });
      throw error;
    }
  }

  // Main processing method
  async processQuery(query) {
    let toolUsed = null;
    let context = null;

    if (this.needsMCPTools(query)) {
      logger.info('Query requires MCP tools', { query });
      context = await this.executeMCPTool('search', { query });
      toolUsed = context ? 'search' : null;
    }

    const response = await this.callModel(query, context);

    return {
      query,
      toolUsed,
      response,
      timestamp: new Date().toISOString(),
      model: this.modelName,
      context: context ? 'Used search results' : 'Direct model response'
    };
  }
}

// Initialize agent
const agent = new SimpleAgent();

// Routes
app.get('/health', async (req, res) => {
  try {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      configuration: {
        mcpGatewayUrl: MCP_GATEWAY_URL,
        modelRunnerUrl: MODEL_RUNNER_URL,
        modelName: MODEL_RUNNER_MODEL,
        useOpenAI: USE_OPENAI
      },
      services: {}
    };

    // Check MCP Gateway
    try {
      await axios.get(`${MCP_GATEWAY_URL}/health`, { timeout: 5000 });
      health.services.mcpGateway = 'connected';
    } catch (error) {
      health.services.mcpGateway = 'disconnected';
    }

    // Check Model Runner
    try {
      const endpoint = `${MODEL_RUNNER_URL}/models`;
      const headers = USE_OPENAI && process.env.OPENAI_API_KEY ? {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      } : {};
      await axios.get(endpoint, { timeout: 10000, headers });
      health.services.modelRunner = 'connected';
    } catch (error) {
      health.services.modelRunner = 'disconnected';
    }

    res.json(health);
  } catch (error) {
    logger.error('Health check failed', { error: error.message });
    res.status(500).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Main chat endpoint
app.post('/chat', async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({
        error: 'Message is required and must be a string',
        timestamp: new Date().toISOString()
      });
    }

    logger.info('Processing chat request', { message });
    const result = await agent.processQuery(message);
    logger.info('Chat request completed successfully');
    res.json(result);

  } catch (error) {
    logger.error('Chat request failed', { error: error.message });
    res.status(500).json({
      error: 'Failed to process request',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  logger.error('Unhandled error', { error: error.message, stack: error.stack });
  res.status(500).json({
    error: 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

// Start server
const server = app.listen(PORT, '0.0.0.0', () => {
  logger.info(`Simple NodeJS MCP Agent started on port ${PORT}`);
  logger.info('Configuration:', {
    mcpGatewayUrl: MCP_GATEWAY_URL,
    modelRunnerUrl: MODEL_RUNNER_URL,
    modelName: MODEL_RUNNER_MODEL,
    useOpenAI: USE_OPENAI
  });
});

// Graceful shutdown
const gracefulShutdown = (signal) => {
  logger.info(`${signal} received, shutting down gracefully`);
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

module.exports = app;
EOF
    
    print_success "Enhanced app.js created"
}

# Create .env file
create_env_file() {
    print_status "Creating .env file..."
    
    cat > .env << 'EOF'
# Agent Service Configuration
NODE_ENV=production
PORT=3000

# MCP Gateway Configuration
MCP_GATEWAY_URL=http://mcp-gateway:8811

# Model Runner Configuration
MODEL_RUNNER_URL=http://model-runner.docker.internal:12434/v1
MODEL_RUNNER_MODEL=ai/gemma3-qat

# OpenAI Configuration (optional)
USE_OPENAI=false
# OPENAI_API_KEY=your-api-key-here

# Logging Configuration
LOG_LEVEL=info

# Model Settings
MODEL_TIMEOUT=120000
MODEL_CONTEXT_SIZE=8192
EOF
    
    print_success ".env file created"
}

# Create README updates
create_readme_updates() {
    print_status "Creating README-ENHANCEMENTS.md..."
    
    cat > README-ENHANCEMENTS.md << 'EOF'
# Enhanced Simple NodeJS MCP Agent

## 🚀 What's New

This enhanced version includes:

- ✅ **Model Runner Integration**: Uses port 12434 with `/v1` endpoint
- ✅ **Enhanced Architecture**: Proper networking and health checks
- ✅ **Production Ready**: Security, logging, and error handling
- ✅ **Multiple Deployment Options**: Standard, Cloud GPU, OpenAI
- ✅ **Comprehensive Monitoring**: Health endpoints and service checks

## Quick Start

### Standard Deployment
```bash
docker compose up --build
```

### Cloud GPU (Large Model)
```bash
docker compose -f compose.yaml -f compose.offload.yaml up --build
```

### OpenAI Integration
```bash
echo "your-openai-api-key" > secret.openai-api-key
docker compose -f compose.yaml -f compose.openai.yaml up --build
```

## API Testing

```bash
# Health check
curl http://localhost:3000/health

# Chat with search
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What is the latest Docker news?"}'

# Direct model query  
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Explain Docker Compose"}'
```

## Configuration

### Models Available
- **ai/gemma3-qat** (Standard - 4GB RAM)
- **ai/gemma3:27B-Q4_K_M** (Large - 16GB VRAM)
- **gpt-4o-mini** (OpenAI)

### Environment Variables
```bash
MODEL_RUNNER_URL=http://model-runner.docker.internal:12434/v1
MODEL_RUNNER_MODEL=ai/gemma3-qat
MCP_GATEWAY_URL=http://mcp-gateway:8811
```

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Node.js App   │───▶│  MCP Gateway    │───▶│  DuckDuckGo     │
│   (Port 3000)   │    │  (Port 8811)    │    │  Search API     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │
         │              ┌─────────────────┐
         └──────────────▶│  Model Runner   │
                        │  (Port 12434)   │
                        │  ai/gemma3-qat  │
                        └─────────────────┘
```

## Troubleshooting

### Common Issues
1. **Model Runner Connection**: Check `http://localhost:3000/health`
2. **Memory Issues**: Use smaller model or increase Docker memory
3. **MCP Gateway**: Verify gateway connectivity

### Logs
```bash
docker compose logs -f app
docker compose logs -f mcp-gateway
```
EOF
    
    print_success "README-ENHANCEMENTS.md created"
}

# Commit changes
commit_changes() {
    print_status "Committing changes..."
    
    # Configure git if not already configured
    if ! git config user.name &> /dev/null; then
        print_warning "Git user.name not set. Please configure:"
        echo "git config --global user.name 'Your Name'"
        echo "git config --global user.email 'your.email@example.com'"
        read -p "Enter your name: " git_name
        read -p "Enter your email: " git_email
        git config user.name "$git_name"
        git config user.email "$git_email"
    fi
    
    # Add all files
    git add .
    
    # Commit with detailed message
    git commit -m "Enhanced setup with Model Runner port 12434 and improved architecture

- Updated compose.yaml to use Model Runner port 12434 with /v1 endpoint
- Added ai/gemma3-qat model configuration
- Enhanced Dockerfile with multi-stage build and security
- Improved app.js with better MCP integration and error handling
- Added compose.offload.yaml for cloud GPU deployments
- Added compose.openai.yaml for OpenAI integration
- Enhanced package.json with updated dependencies
- Added comprehensive health checks and monitoring
- Added proper Docker networking and restart policies
- Created .env file for easy configuration
- Added README-ENHANCEMENTS.md with usage instructions"
    
    print_success "Changes committed successfully"
}

# Main execution
main() {
    echo -e "${BLUE}"
    echo "=========================================="
    echo "Enhanced Simple NodeJS MCP Agent Setup"
    echo "=========================================="
    echo -e "${NC}"
    
    check_dependencies
    setup_repository
    
    print_status "Creating enhanced files..."
    create_compose_yaml
    create_compose_offload
    create_compose_openai
    create_dockerfile
    create_package_json
    create_app_js
    create_env_file
    create_readme_updates
    
    commit_changes
    
    echo -e "${GREEN}"
    echo "=========================================="
    echo "✅ Enhancement Complete!"
    echo "=========================================="
    echo -e "${NC}"
    
    print_success "Repository enhanced successfully!"
    print_status "Location: $(pwd)"
    print_status "Branch: $BRANCH_NAME"
    
    echo ""
    print_status "Next steps:"
    echo "1. Push to remote: git push origin $BRANCH_NAME"
    echo "2. Create pull request on GitHub"
    echo "3. Test the setup: docker compose up --build"
    
    echo ""
    print_status "Quick test commands:"
    echo "cd $REPO_DIR"
    echo "docker compose up --build"
    echo "curl http://localhost:3000/health"
}

# Run main function
main "$@"
