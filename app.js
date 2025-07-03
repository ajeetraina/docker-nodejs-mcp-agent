// app.js - Simple Node.js MCP Agent
const express = require('express');

const app = express();
app.use(express.json());
app.use(express.static('public'));

class SimpleAgent {
  constructor() {
    this.mcpEndpoint = process.env.MCP_ENDPOINT || 'http://mcp-gateway:8811/sse';
    this.modelEndpoint = process.env.MODEL_RUNNER_URL || 'http://model-runner.docker.internal/engines/v1';
    this.model = process.env.MODEL_RUNNER_MODEL || 'ai/qwen3:8B-Q4_0';
  }

  async callModel(prompt, tools = []) {
    const response = await fetch(`${this.modelEndpoint}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        tools: tools,
        temperature: 0.7
      })
    });
    
    const data = await response.json();
    return data.choices[0].message;
  }

  async callMCP(tool, params) {
    try {
      console.log(`Calling MCP tool: ${tool} with params:`, params);
      
      // Use proper MCP endpoint (remove /sse for POST requests)
      const mcpBaseEndpoint = this.mcpEndpoint.replace('/sse', '');
      
      // Use proper MCP protocol over HTTP POST
      const mcpRequest = {
        jsonrpc: "2.0",
        id: Date.now(),
        method: "tools/call",
        params: {
          name: tool,
          arguments: params
        }
      };

      const response = await fetch(mcpBaseEndpoint, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream'
        },
        body: JSON.stringify(mcpRequest)
      });

      if (!response.ok) {
        throw new Error(`MCP call failed: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      console.log(`MCP ${tool} success:`, result);
      
      // Handle MCP response format
      if (result.error) {
        throw new Error(`MCP error: ${result.error.message || result.error}`);
      }
      
      return result.result || result;
      
    } catch (error) {
      console.error('MCP call failed:', error);
      return { error: error.message };
    }
  }

  async processQuery(query) {
    console.log(`Processing query: ${query}`);

    // Step 1: Determine what tools to use
    const planPrompt = `
Given this query: "${query}"

Available MCP tools:
- search_web: Search the web using DuckDuckGo (use for questions needing current information)

Respond with just the tool name and parameters in JSON format.
Example: {"tool": "search_web", "params": {"q": "search terms"}}

If this is just a greeting or simple question that doesn't need web search, respond with:
{"tool": "none", "params": {}}
`;

    try {
      const plan = await this.callModel(planPrompt);
      let toolCall;
      
      try {
        toolCall = JSON.parse(plan.content);
      } catch {
        // Fallback to no tool for simple queries
        toolCall = { tool: "none", params: {} };
      }

      console.log('Tool plan:', toolCall);

      let toolResult = null;
      let finalResponse;

      // Step 2: Execute the MCP tool if needed
      if (toolCall.tool && toolCall.tool !== 'none') {
        toolResult = await this.callMCP(toolCall.tool, toolCall.params);
        
        // Step 3: Generate final response with tool result
        const responsePrompt = `
Query: ${query}
Tool used: ${toolCall.tool}
Tool result: ${JSON.stringify(toolResult, null, 2)}

Provide a helpful, concise answer based on the tool result.
`;
        finalResponse = await this.callModel(responsePrompt);
      } else {
        // Step 3: Generate direct response without tools
        const responsePrompt = `
Query: ${query}

Provide a helpful, friendly response. This is a simple question that doesn't require web search or tools.
`;
        finalResponse = await this.callModel(responsePrompt);
      }
      
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

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🤖 Simple MCP Agent running on port ${PORT}`);
  console.log(`📡 MCP Endpoint: ${agent.mcpEndpoint}`);
  console.log(`🧠 Model Endpoint: ${agent.modelEndpoint}`);
});
