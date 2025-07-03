// app.js - Simple Node.js MCP Agent (Performance Optimized)
const express = require('express');

const app = express();
app.use(express.json());
app.use(express.static('public'));

class SimpleAgent {
  constructor() {
    this.mcpEndpoint = process.env.MCP_ENDPOINT || 'http://mcp-gateway:8811/sse';
    this.modelEndpoint = process.env.MODEL_RUNNER_URL || 'http://model-runner.docker.internal/engines/v1';
    this.model = process.env.MODEL_RUNNER_MODEL || 'ai/qwen3:1.5B-Q4_0'; // Faster model
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
      console.log(`Calling MCP tool: ${tool} with params:`, params);
      
      // Quick pattern matching for common endpoints
      const baseUrl = this.mcpEndpoint.replace('/sse', '');
      const endpoints = [
        `${baseUrl}/messages`,
        `${baseUrl}`,
        `${baseUrl}/mcp`,
      ];
      
      const mcpRequest = {
        jsonrpc: "2.0",
        id: Date.now(),
        method: "tools/call",
        params: {
          name: tool,
          arguments: params
        }
      };

      for (const endpoint of endpoints) {
        try {
          console.log(`Trying MCP endpoint: ${endpoint}`);
          
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Accept': 'application/json, text/event-stream'
            },
            body: JSON.stringify(mcpRequest)
          });

          if (response.ok) {
            const result = await response.json();
            console.log(`MCP ${tool} success with endpoint ${endpoint}:`, result);
            
            if (result.error) {
              throw new Error(`MCP error: ${result.error.message || result.error}`);
            }
            
            return result.result || result;
          } else {
            console.log(`Failed ${endpoint}: ${response.status} ${response.statusText}`);
          }
        } catch (err) {
          console.log(`Error with ${endpoint}:`, err.message);
          continue;
        }
      }
      
      throw new Error(`All MCP endpoints failed for tool: ${tool}`);
      
    } catch (error) {
      console.error('MCP call failed:', error);
      return { error: error.message };
    }
  }

  // Simplified, faster tool planning
  needsWebSearch(query) {
    const searchKeywords = ['search', 'latest', 'current', 'news', 'recent', 'what is', 'how to', 'best practices'];
    const queryLower = query.toLowerCase();
    return searchKeywords.some(keyword => queryLower.includes(keyword));
  }

  async processQuery(query) {
    console.log(`Processing query: ${query}`);

    // Warm up model on first request
    await this.warmupModel();

    let toolCall;
    let toolResult = null;

    // Fast keyword-based tool selection (no model call needed!)
    if (this.needsWebSearch(query)) {
      toolCall = { tool: "search_web", params: { q: query } };
      console.log('Fast tool plan:', toolCall);
      
      // Try MCP call
      toolResult = await this.callMCP(toolCall.tool, toolCall.params);
    } else {
      toolCall = { tool: "none", params: {} };
      console.log('Fast tool plan:', toolCall);
    }

    // Generate response with model
    let responsePrompt;
    if (toolCall.tool !== 'none' && toolResult && !toolResult.error) {
      responsePrompt = `Query: ${query}\nSearch results: ${JSON.stringify(toolResult)}\nAnswer briefly:`;
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
      console.error('Error processing query:', error);
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
    modelEndpoint: agent.modelEndpoint 
  });
});

// Start server and warm up model
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', async () => {
  console.log(`🤖 Simple MCP Agent running on port ${PORT}`);
  console.log(`📡 MCP Endpoint: ${agent.mcpEndpoint}`);
  console.log(`🧠 Model Endpoint: ${agent.modelEndpoint}`);
  
  // Start warming up model in background
  agent.warmupModel();
});
