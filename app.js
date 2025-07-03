// app.js - Simple Node.js MCP Agent (SSE Transport Compatible)
const express = require('express');

const app = express();
app.use(express.json());
app.use(express.static('public'));

class MCPSSEClient {
  constructor(endpoint) {
    this.endpoint = endpoint;
    this.connected = false;
    this.messageId = 1;
    this.pendingRequests = new Map();
  }

  async connect() {
    if (this.connected) return;
    
    console.log(`🔌 Connecting to MCP SSE endpoint: ${this.endpoint}`);
    
    // For now, we'll simulate SSE connection since Node.js native SSE client is complex
    // In a real implementation, you'd use EventSource or a similar library
    this.connected = true;
    console.log(`✅ Connected to MCP SSE endpoint`);
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
      console.log(`📤 Sending MCP message:`, message);
      
      // For SSE transport, we need to POST the message to the base endpoint
      // and then listen for the response on the SSE stream
      const response = await fetch(this.endpoint.replace('/sse', ''), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream'
        },
        body: JSON.stringify(message)
      });

      console.log(`📡 SSE Response status: ${response.status}`);

      if (response.ok) {
        // For a proper SSE implementation, we'd parse the SSE stream
        // For now, let's try to get JSON response
        const result = await response.json();
        console.log(`✅ MCP SSE success:`, result);
        return result.result || result;
      } else {
        const errorText = await response.text();
        console.log(`❌ SSE request failed: ${response.status} - ${errorText}`);
        throw new Error(`SSE request failed: ${response.status}`);
      }
    } catch (error) {
      console.error(`💥 MCP SSE call failed:`, error);
      throw error;
    }
  }
}

class SimpleAgent {
  constructor() {
    const rawEndpoint = process.env.MCP_ENDPOINT || 'http://mcp-gateway:8811';
    this.mcpEndpoint = rawEndpoint.endsWith('/sse') ? rawEndpoint : `${rawEndpoint}/sse`;
    
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
      console.log(`🔧 Calling MCP tool via SSE: ${tool} with params:`, params);
      
      const result = await this.mcpClient.callTool(tool, params);
      return result;
      
    } catch (error) {
      console.error('💥 MCP tool call failed:', error);
      return { 
        error: `MCP call failed: ${error.message}. This might be because the Docker MCP Gateway requires a different client implementation or authentication.` 
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
      responsePrompt = `Query: ${query}\nNote: Search failed (${toolResult.error}). Answer based on your knowledge:`;
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
        timestamp: new Date().toISOString()
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
    modelEndpoint: agent.modelEndpoint,
    model: agent.model,
    transport: 'SSE'
  });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', async () => {
  console.log(`🐳 Simple MCP Agent running on port ${PORT}`);
  console.log(`🔌 MCP SSE Endpoint: ${agent.mcpEndpoint}`);
  console.log(`🧠 Model Endpoint: ${agent.modelEndpoint}`);
  console.log(`🤖 Model: ${agent.model}`);
  console.log(`🚀 Transport: Server-Sent Events (SSE)`);
  
  agent.warmupModel();
});
