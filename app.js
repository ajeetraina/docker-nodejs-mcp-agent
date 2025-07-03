// app.js - Simple Node.js MCP Agent (Real SSE Implementation)
const express = require('express');

const app = express();
app.use(express.json());
app.use(express.static('public'));

class MCPSSEClient {
  constructor(baseEndpoint) {
    this.baseEndpoint = baseEndpoint.replace('/sse', '');
    this.sseEndpoint = `${this.baseEndpoint}/sse`;
    this.connected = false;
    this.messageId = 1;
    this.pendingRequests = new Map();
    this.eventSource = null;
  }

  async connect() {
    if (this.connected) return;
    
    console.log(`🔌 Establishing SSE connection to: ${this.sseEndpoint}`);
    
    try {
      // First, establish SSE connection
      const response = await fetch(this.sseEndpoint, {
        method: 'GET',
        headers: {
          'Accept': 'text/event-stream',
          'Cache-Control': 'no-cache'
        }
      });

      console.log(`📡 SSE connection response: ${response.status}`);
      
      if (!response.ok) {
        throw new Error(`Failed to establish SSE connection: ${response.status}`);
      }

      this.connected = true;
      console.log(`✅ SSE connection established`);
      
    } catch (error) {
      console.error(`❌ Failed to connect to SSE endpoint:`, error);
      throw error;
    }
  }

  async callTool(toolName, params) {
    await this.connect();
    
    const requestId = this.messageId++;
    const message = {
      jsonrpc: "2.0",
      id: requestId,
      method: "tools/call",
      params: {
        name: toolName,
        arguments: params
      }
    };

    try {
      console.log(`📤 Sending MCP message to base endpoint:`, message);
      
      // Send JSON-RPC message to base endpoint (not /sse)
      const response = await fetch(this.baseEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(message)
      });

      console.log(`📡 Message response status: ${response.status}`);

      if (response.ok) {
        const result = await response.json();
        console.log(`✅ MCP call success:`, result);
        
        if (result.error) {
          throw new Error(`MCP error: ${result.error.message || JSON.stringify(result.error)}`);
        }
        
        return result.result || result;
      } else {
        const errorText = await response.text();
        console.log(`❌ MCP call failed: ${response.status} - ${errorText}`);
        
        // If still getting 405, the gateway might require a different approach
        if (response.status === 405) {
          throw new Error(`Method not allowed. The Docker MCP Gateway might require a different client implementation or authentication. Check gateway configuration.`);
        }
        
        throw new Error(`MCP call failed: ${response.status} - ${errorText}`);
      }
    } catch (error) {
      console.error(`💥 MCP tool call failed:`, error);
      throw error;
    }
  }

  disconnect() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.connected = false;
    console.log(`🔌 SSE connection closed`);
  }
}

class SimpleAgent {
  constructor() {
    const rawEndpoint = process.env.MCP_ENDPOINT || 'http://mcp-gateway:8811';
    this.mcpEndpoint = rawEndpoint.replace('/sse', '');
    
    // Initialize MCP SSE client
    this.mcpClient = new MCPSSEClient(this.mcpEndpoint);
    
    this.modelEndpoint = process.env.MODEL_RUNNER_URL || 'http://model-runner.docker.internal/engines/v1';
    this.model = process.env.MODEL_RUNNER_MODEL || 'ai/llama3.2:1B-Q8_0';
    this.warmupDone = false;
  }

  async callModel(prompt, tools = []) {
    const response = await fetch(`${this.modelEndpoint}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        tools: tools,
        temperature: 0.1,
        max_tokens: 100
      })
    });
    
    const data = await response.json();
    return data.choices[0].message;
  }

  async warmupModel() {
    if (!this.warmupDone) {
      console.log('🔥 Warming up model...');
      try {
        await this.callModel('test');
        this.warmupDone = true;
        console.log('✅ Model warmed up');
      } catch (error) {
        console.log('⚠️ Model warmup failed, will try on first request');
      }
    }
  }

  async callMCPTool(tool, params) {
    try {
      console.log(`🔧 Calling MCP tool: ${tool} with params:`, params);
      
      const result = await this.mcpClient.callTool(tool, params);
      return result;
      
    } catch (error) {
      console.error('💥 MCP tool call failed:', error);
      return { 
        error: `MCP call failed: ${error.message}\n\nTroubleshooting tips:\n1. Check if Docker MCP Gateway is properly configured\n2. Verify the gateway is running in the correct transport mode\n3. The gateway might require specific client authentication\n4. Try using the official Docker Desktop MCP integration instead` 
      };
    }
  }

  needsWebSearch(query) {
    const searchKeywords = ['search', 'latest', 'current', 'news', 'recent', 'what is', 'how to', 'best practices', 'find'];
    const queryLower = query.toLowerCase();
    return searchKeywords.some(keyword => queryLower.includes(keyword));
  }

  needsFileOperation(query) {
    const fileKeywords = ['list files', 'directory', 'folder contents', 'ls', 'dir'];
    const queryLower = query.toLowerCase();
    return fileKeywords.some(keyword => queryLower.includes(keyword));
  }

  async processQuery(query) {
    console.log(`🎯 Processing query: ${query}`);

    await this.warmupModel();

    let toolCall;
    let toolResult = null;

    if (this.needsWebSearch(query)) {
      toolCall = { 
        tool: "search", 
        params: { 
          query: query, 
          max_results: 5 
        } 
      };
      console.log('🔍 Selected DuckDuckGo search via MCP SSE:', toolCall);
      toolResult = await this.callMCPTool(toolCall.tool, toolCall.params);
    } else if (this.needsFileOperation(query)) {
      toolCall = { tool: "none", params: {} };
      console.log('📁 File operation detected - providing general guidance');
    } else {
      toolCall = { tool: "none", params: {} };
      console.log('💭 No tool needed for this query');
    }

    // Generate response with model
    let responsePrompt;
    if (toolCall.tool !== 'none' && toolResult && !toolResult.error) {
      responsePrompt = `Query: ${query}\nSearch results: ${JSON.stringify(toolResult).substring(0, 500)}...\nAnswer briefly based on the results:`;
    } else if (toolResult && toolResult.error) {
      responsePrompt = `Query: ${query}\nNote: Search functionality is not available (${toolResult.error}). Answer based on your knowledge:`;
    } else {
      responsePrompt = `Answer briefly: ${query}`;
    }

    try {
      const finalResponse = await this.callModel(responsePrompt);
      
      return {
        query,
        toolUsed: toolCall.tool === 'none' ? null : toolCall.tool,
        toolResult: toolResult,
        response: finalResponse.content,
        timestamp: new Date().toISOString(),
        note: toolResult && toolResult.error ? "Search tools are currently unavailable. Response based on model knowledge." : null
      };
    } catch (error) {
      console.error('❌ Error processing query:', error);
      return {
        query,
        error: error.message,
        response: "Sorry, I encountered an error processing your request.",
        timestamp: new Date().toISOString()
      };
    }
  }
}

const agent = new SimpleAgent();

// API Routes
app.post('/chat', async (req, res) => {
  const { message } = req.body;
  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  const result = await agent.processQuery(message);
  res.json(result);
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    mcpEndpoint: agent.mcpEndpoint,
    mcpSSEEndpoint: `${agent.mcpEndpoint}/sse`,
    modelEndpoint: agent.modelEndpoint,
    model: agent.model,
    transport: 'SSE',
    note: 'Attempting to connect to Docker MCP Gateway via SSE transport'
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Shutting down gracefully...');
  if (agent.mcpClient) {
    agent.mcpClient.disconnect();
  }
  process.exit(0);
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', async () => {
  console.log(`🐳 Simple MCP Agent running on port ${PORT}`);
  console.log(`🔌 MCP Base Endpoint: ${agent.mcpEndpoint}`);
  console.log(`📡 MCP SSE Endpoint: ${agent.mcpEndpoint}/sse`);
  console.log(`🧠 Model Endpoint: ${agent.modelEndpoint}`);
  console.log(`🤖 Model: ${agent.model}`);
  console.log(`🚀 Transport: Server-Sent Events (SSE)`);
  console.log(`ℹ️  Note: If MCP calls fail, the agent will fall back to model knowledge`);
  
  agent.warmupModel();
});
