// app.js - Simple Node.js MCP Agent (Performance Optimized)
const express = require('express');

const app = express();
app.use(express.json());
app.use(express.static('public'));

class SimpleAgent {
  constructor() {
    // Always use the base endpoint for JSON-RPC calls (remove /sse if present)
    const rawEndpoint = process.env.MCP_ENDPOINT || 'http://mcp-gateway:8811';
    this.mcpEndpoint = rawEndpoint.replace('/sse', ''); // Ensure we use base endpoint for POST requests
    
    this.modelEndpoint = process.env.MODEL_RUNNER_URL || 'http://model-runner.docker.internal/engines/v1';
    this.model = process.env.MODEL_RUNNER_MODEL || 'ai/llama3.2:1B-Q8_0'; // Optimized model for demos
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
        temperature: 0.1,  // Lower temperature for faster, more deterministic responses
        max_tokens: 100    // Limit tokens for speed
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

  async callMCP(tool, params) {
    try {
      console.log(`🔧 Calling MCP tool: ${tool} with params:`, params);
      
      // MCP JSON-RPC request format
      const mcpRequest = {
        jsonrpc: "2.0",
        id: Math.floor(Math.random() * 100000),
        method: "tools/call",
        params: {
          name: tool,
          arguments: params
        }
      };

      console.log(`🌐 Connecting to MCP base endpoint: ${this.mcpEndpoint}`);
      
      const response = await fetch(this.mcpEndpoint, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(mcpRequest)
      });

      console.log(`📡 MCP Response status: ${response.status}`);

      if (response.ok) {
        const result = await response.json();
        console.log(`✅ MCP ${tool} success:`, result);
        
        if (result.error) {
          throw new Error(`MCP error: ${result.error.message || JSON.stringify(result.error)}`);
        }
        
        return result.result;
      } else {
        const errorText = await response.text();
        console.log(`❌ MCP request failed: ${response.status} ${response.statusText}`);
        console.log(`📄 Response body: ${errorText}`);
        throw new Error(`MCP request failed: ${response.status} ${response.statusText} - ${errorText}`);
      }
      
    } catch (error) {
      console.error('💥 MCP call failed:', error);
      return { error: error.message };
    }
  }

  // Enhanced tool selection logic with correct DuckDuckGo tool names
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

    // Warm up model on first request
    await this.warmupModel();

    let toolCall;
    let toolResult = null;

    // Enhanced tool selection with correct DuckDuckGo tool names
    if (this.needsWebSearch(query)) {
      // Use the correct DuckDuckGo search tool name and parameters
      toolCall = { 
        tool: "search", 
        params: { 
          query: query, 
          max_results: 5 
        } 
      };
      console.log('🔍 Selected DuckDuckGo search tool:', toolCall);
      toolResult = await this.callMCP(toolCall.tool, toolCall.params);
    } else if (this.needsFileOperation(query)) {
      // For file operations, provide helpful information
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
    model: agent.model
  });
});

// Start server and warm up model
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', async () => {
  console.log(`🐳 Simple MCP Agent running on port ${PORT}`);
  console.log(`🔌 MCP Base Endpoint: ${agent.mcpEndpoint}`);
  console.log(`🧠 Model Endpoint: ${agent.modelEndpoint}`);
  console.log(`🤖 Model: ${agent.model}`);
  
  // Start warming up model in background
  agent.warmupModel();
});
