// app.js - Simple Node.js MCP Agent (Docker MCP Gateway Compatible)
const express = require('express');

const app = express();
app.use(express.json());
app.use(express.static('public'));

class SimpleAgent {
  constructor() {
    // Docker MCP Gateway endpoints
    const rawEndpoint = process.env.MCP_ENDPOINT || 'http://mcp-gateway:8811';
    this.mcpBaseEndpoint = rawEndpoint.replace('/sse', '');
    this.mcpSSEEndpoint = `${this.mcpBaseEndpoint}/sse`;
    
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

  async callDockerMCPGateway(tool, params) {
    try {
      console.log(`🔧 Calling Docker MCP Gateway tool: ${tool} with params:`, params);
      
      // Try Docker MCP Gateway streaming endpoint first
      const streamingEndpoint = `${this.mcpBaseEndpoint}/tools/call`;
      
      const gatewayRequest = {
        tool: tool,
        arguments: params
      };

      console.log(`🌐 Trying Docker MCP Gateway streaming endpoint: ${streamingEndpoint}`);
      
      const response = await fetch(streamingEndpoint, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(gatewayRequest)
      });

      console.log(`📡 Gateway Response status: ${response.status}`);

      if (response.ok) {
        const result = await response.json();
        console.log(`✅ Docker MCP Gateway success:`, result);
        return result;
      } else {
        // Try standard JSON-RPC format as fallback
        console.log(`⚠️ Streaming endpoint failed, trying JSON-RPC...`);
        return await this.fallbackToJSONRPC(tool, params);
      }
      
    } catch (error) {
      console.error('💥 Docker MCP Gateway call failed:', error);
      return { error: error.message };
    }
  }

  async fallbackToJSONRPC(tool, params) {
    const mcpRequest = {
      jsonrpc: "2.0",
      id: Math.floor(Math.random() * 100000),
      method: "tools/call",
      params: {
        name: tool,
        arguments: params
      }
    };

    // Try common Docker MCP Gateway endpoints
    const endpointsToTry = [
      `${this.mcpBaseEndpoint}/mcp`,
      `${this.mcpBaseEndpoint}/jsonrpc`,
      `${this.mcpBaseEndpoint}/api/v1/tools/call`,
      `${this.mcpBaseEndpoint}/gateway`,
      this.mcpBaseEndpoint
    ];

    for (const endpoint of endpointsToTry) {
      try {
        console.log(`🔄 Trying fallback endpoint: ${endpoint}`);
        
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify(mcpRequest)
        });

        console.log(`📡 Response from ${endpoint}: ${response.status}`);

        if (response.ok) {
          const result = await response.json();
          console.log(`✅ Success with ${endpoint}:`, result);
          
          if (result.error) {
            throw new Error(`MCP error: ${result.error.message || JSON.stringify(result.error)}`);
          }
          
          return result.result || result;
        } else if (response.status !== 405 && response.status !== 404) {
          const errorText = await response.text();
          console.log(`❌ Error at ${endpoint}: ${response.status} - ${errorText}`);
        }
      } catch (error) {
        if (!error.message.includes('fetch')) {
          throw error;
        }
        console.log(`⚠️ Network error with ${endpoint}, continuing...`);
      }
    }
    
    throw new Error(`All Docker MCP Gateway endpoints failed. Gateway might be SSE-only or require different authentication.`);
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
      // Try DuckDuckGo search through Docker MCP Gateway
      toolCall = { 
        tool: "search", 
        params: { 
          query: query, 
          max_results: 5 
        } 
      };
      console.log('🔍 Selected DuckDuckGo search through Docker MCP Gateway:', toolCall);
      toolResult = await this.callDockerMCPGateway(toolCall.tool, toolCall.params);
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
    mcpEndpoint: agent.mcpBaseEndpoint,
    mcpSSEEndpoint: agent.mcpSSEEndpoint,
    modelEndpoint: agent.modelEndpoint,
    model: agent.model
  });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', async () => {
  console.log(`🐳 Simple MCP Agent running on port ${PORT}`);
  console.log(`🔌 Docker MCP Gateway: ${agent.mcpBaseEndpoint}`);
  console.log(`📡 SSE Endpoint: ${agent.mcpSSEEndpoint}`);
  console.log(`🧠 Model Endpoint: ${agent.modelEndpoint}`);
  console.log(`🤖 Model: ${agent.model}`);
  
  agent.warmupModel();
});
