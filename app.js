// Enhanced app.js with comprehensive monitoring integration
const express = require('express');
const http = require('http');
const path = require('path');
const { MCPMonitor, createMonitoringWebSocketServer } = require('./monitoring-middleware');

const app = express();
const server = http.createServer(app);

// Initialize monitoring
const monitor = new MCPMonitor();

// Apply monitoring middleware
app.use(monitor.requestMonitoring());
app.use(express.json());
app.use(express.static('public'));

// Enhanced MCPSSEClient with monitoring
class MCPSSEClient {
  constructor(baseEndpoint, monitor) {
    this.baseEndpoint = baseEndpoint.replace('/sse', '');
    this.sseEndpoint = `${this.baseEndpoint}/sse`;
    this.connected = false;
    this.messageId = 1;
    this.pendingRequests = new Map();
    this.eventSource = null;
    this.monitor = monitor;
  }

  async connect() {
    if (this.connected) return;
    
    console.log(`Establishing SSE connection to: ${this.sseEndpoint}`);
    this.monitor.logActivity('MCP_CONNECT_START', {
      endpoint: this.sseEndpoint,
      timestamp: new Date().toISOString()
    });
    
    try {
      const response = await fetch(this.sseEndpoint, {
        method: 'GET',
        headers: {
          'Accept': 'text/event-stream',
          'Cache-Control': 'no-cache'
        }
      });

      console.log(`SSE connection response: ${response.status}`);
      
      if (!response.ok) {
        throw new Error(`Failed to establish SSE connection: ${response.status}`);
      }

      this.connected = true;
      console.log(`SSE connection established`);
      
      this.monitor.updateHealthStatus('mcp', 'healthy', {
        endpoint: this.sseEndpoint,
        connected: true
      });
      
      this.monitor.logActivity('MCP_CONNECT_SUCCESS', {
        endpoint: this.sseEndpoint,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      console.error(`Failed to connect to SSE endpoint:`, error);
      this.monitor.updateHealthStatus('mcp', 'error', {
        endpoint: this.sseEndpoint,
        error: error.message
      });
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

    // Start monitoring the MCP call
    const tracker = this.monitor.trackMCPCall(toolName, params, Date.now());
    const startTime = Date.now();

    try {
      console.log(`Sending MCP message to base endpoint:`, message);
      
      const response = await fetch(this.baseEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(message)
      });

      console.log(`Message response status: ${response.status}`);
      const responseTime = Date.now() - startTime;

      if (response.ok) {
        const result = await response.json();
        console.log(`MCP call success:`, result);
        
        if (result.error) {
          tracker.end(false, responseTime, result.error);
          this.monitor.updateHealthStatus('mcp', 'warning', {
            lastError: result.error,
            tool: toolName
          });
          throw new Error(`MCP error: ${result.error.message || JSON.stringify(result.error)}`);
        }
        
        tracker.end(true, responseTime, result.result || result);
        this.monitor.updateHealthStatus('mcp', 'healthy');
        
        return result.result || result;
      } else {
        const errorText = await response.text();
        console.log(`MCP call failed: ${response.status} - ${errorText}`);
        
        tracker.end(false, responseTime, { status: response.status, error: errorText });
        this.monitor.updateHealthStatus('mcp', 'error', {
          status: response.status,
          error: errorText,
          tool: toolName
        });
        
        if (response.status === 405) {
          throw new Error(`Method not allowed. The Docker MCP Gateway might require a different client implementation or authentication. Check gateway configuration.`);
        }
        
        throw new Error(`MCP call failed: ${response.status} - ${errorText}`);
      }
    } catch (error) {
      const responseTime = Date.now() - startTime;
      tracker.end(false, responseTime, null);
      this.monitor.updateHealthStatus('mcp', 'error', {
        error: error.message,
        tool: toolName
      });
      console.error(`MCP tool call failed:`, error);
      throw error;
    }
  }

  disconnect() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.connected = false;
    console.log(`SSE connection closed`);
    this.monitor.logActivity('MCP_DISCONNECT', {
      timestamp: new Date().toISOString()
    });
  }
}

// Enhanced SimpleAgent with monitoring
class SimpleAgent {
  constructor() {
    const rawEndpoint = process.env.MCP_ENDPOINT || process.env.MCP_GATEWAY_URL || 'http://mcp-gateway:8811';
    this.mcpEndpoint = rawEndpoint.replace('/sse', '');
    
    // Initialize MCP SSE client with monitoring
    this.mcpClient = new MCPSSEClient(this.mcpEndpoint, monitor);
    
    this.modelEndpoint = process.env.MODEL_RUNNER_URL || 'http://model-runner.docker.internal:12434/v1';
    this.model = process.env.MODEL_RUNNER_MODEL || 'ai/gemma3-qat';
    this.warmupDone = false;
    
    console.log(`Configuration:`);
    console.log(`   MCP Endpoint: ${this.mcpEndpoint}`);
    console.log(`   Model Endpoint: ${this.modelEndpoint}`);
    console.log(`   Model: ${this.model}`);
    
    // Update initial health status
    monitor.updateHealthStatus('app', 'healthy', {
      mcpEndpoint: this.mcpEndpoint,
      modelEndpoint: this.modelEndpoint,
      model: this.model
    });
  }

  async callModel(prompt, tools = []) {
    let endpoint;
    if (this.modelEndpoint.includes('openai.com')) {
      endpoint = `${this.modelEndpoint}/chat/completions`;
    } else {
      const baseEndpoint = this.modelEndpoint.replace(/\/+$/, '');
      if (baseEndpoint.includes('/engines/v1') || baseEndpoint.includes('/v1')) {
        endpoint = `${baseEndpoint}/chat/completions`;
      } else {
        endpoint = `${baseEndpoint}/v1/chat/completions`;
      }
    }
      
    console.log(`Calling model at: ${endpoint}`);
    
    // Start monitoring the model call
    const tracker = monitor.trackModelCall(this.model, prompt);
    
    try {
      const headers = { 
        'Content-Type': 'application/json'
      };
      
      if (this.modelEndpoint.includes('openai.com') && process.env.OPENAI_API_KEY) {
        headers['Authorization'] = `Bearer ${process.env.OPENAI_API_KEY}`;
      }
      
      const requestBody = {
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 500
      };
      
      if (this.modelEndpoint.includes('openai.com') && tools.length > 0) {
        requestBody.tools = tools;
      }
      
      console.log(`Request body:`, JSON.stringify(requestBody, null, 2));
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(requestBody)
      });
      
      console.log(`Model API response status: ${response.status}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Model API error details:`, errorText);
        tracker.end(false, { status: response.status, error: errorText });
        monitor.updateHealthStatus('model', 'error', {
          status: response.status,
          error: errorText,
          endpoint
        });
        throw new Error(`Model API error: ${response.status} - ${errorText}`);
      }
      
      const data = await response.json();
      console.log(`Model response received, choices: ${data.choices?.length}`);
      
      const result = data.choices[0].message;
      tracker.end(true, result);
      monitor.updateHealthStatus('model', 'healthy');
      
      // Mark model as warmed up after first successful call
      if (!this.warmupDone) {
        this.warmupDone = true;
        monitor.logActivity('MODEL_WARMUP_COMPLETE', {
          model: this.model,
          timestamp: new Date().toISOString()
        });
      }
      
      return result;
    } catch (error) {
      console.error('Model call failed:', error);
      tracker.end(false, null);
      monitor.updateHealthStatus('model', 'error', {
        error: error.message,
        endpoint
      });
      throw error;
    }
  }

  async warmupModel() {
    if (!this.warmupDone) {
      console.log('Warming up model...');
      monitor.logActivity('MODEL_WARMUP_START', {
        model: this.model,
        timestamp: new Date().toISOString()
      });
      
      try {
        await this.callModel('Hello');
        this.warmupDone = true;
        console.log('Model warmed up');
        monitor.logActivity('MODEL_WARMUP_SUCCESS', {
          model: this.model,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.log('Model warmup failed, will try on first request:', error.message);
        monitor.logActivity('MODEL_WARMUP_FAILED', {
          model: this.model,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    }
  }

  async callMCPTool(tool, params) {
    try {
      console.log(`Calling MCP tool: ${tool} with params:`, params);
      const result = await this.mcpClient.callTool(tool, params);
      return result;
    } catch (error) {
      console.error('MCP tool call failed:', error);
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
    console.log(`Processing query: ${query}`);
    
    monitor.logActivity('QUERY_START', {
      query,
      timestamp: new Date().toISOString()
    });

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
      console.log('Selected DuckDuckGo search via MCP SSE:', toolCall);
      monitor.logActivity('TOOL_SELECTED', {
        tool: 'search',
        reason: 'search_keywords_detected',
        timestamp: new Date().toISOString()
      });
      toolResult = await this.callMCPTool(toolCall.tool, toolCall.params);
    } else if (this.needsFileOperation(query)) {
      toolCall = { tool: "none", params: {} };
      console.log('File operation detected - providing general guidance');
      monitor.logActivity('TOOL_SELECTED', {
        tool: 'none',
        reason: 'file_operation_detected',
        timestamp: new Date().toISOString()
      });
    } else {
      toolCall = { tool: "none", params: {} };
      console.log('No tool needed for this query');
      monitor.logActivity('TOOL_SELECTED', {
        tool: 'none',
        reason: 'no_tool_needed',
        timestamp: new Date().toISOString()
      });
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
      
      const result = {
        query,
        toolUsed: toolCall.tool === 'none' ? null : toolCall.tool,
        toolResult: toolResult,
        response: finalResponse.content,
        timestamp: new Date().toISOString(),
        note: toolResult && toolResult.error ? "Search tools are currently unavailable. Response based on model knowledge." : null
      };
      
      monitor.logActivity('QUERY_SUCCESS', {
        query,
        toolUsed: result.toolUsed,
        responseLength: result.response.length,
        timestamp: new Date().toISOString()
      });
      
      return result;
    } catch (error) {
      console.error('Error processing query:', error);
      monitor.logActivity('QUERY_ERROR', {
        query,
        error: error.message,
        timestamp: new Date().toISOString()
      });
      
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
  const healthData = {
    status: 'healthy', 
    mcpEndpoint: agent.mcpEndpoint,
    mcpSSEEndpoint: `${agent.mcpEndpoint}/sse`,
    modelEndpoint: agent.modelEndpoint,
    model: agent.model,
    transport: 'SSE',
    note: 'Following standard Agentic Compose pattern with monitoring',
    monitoring: monitor.getMetrics()
  };
  
  res.json(healthData);
});

// New monitoring endpoints
app.get('/metrics', (req, res) => {
  res.json(monitor.getMetrics());
});

app.get('/activity', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const activities = monitor.recentActivity.slice(-limit);
  res.json(activities);
});

app.post('/monitoring/reset', (req, res) => {
  monitor.reset();
  res.json({ message: 'Monitoring metrics reset' });
});

// Serve monitoring dashboard
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Initialize WebSocket server for real-time monitoring
const wss = createMonitoringWebSocketServer(server, monitor);

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down gracefully...');
  monitor.logActivity('SHUTDOWN_START', {
    timestamp: new Date().toISOString()
  });
  
  if (agent.mcpClient) {
    agent.mcpClient.disconnect();
  }
  
  if (wss) {
    wss.close();
  }
  
  process.exit(0);
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', async () => {
  console.log(`Simple MCP Agent with monitoring running on port ${PORT}`);
  console.log(`Dashboard available at: http://localhost:${PORT}/dashboard`);
  console.log(`Metrics API at: http://localhost:${PORT}/metrics`);
  console.log(`MCP Base Endpoint: ${agent.mcpEndpoint}`);
  console.log(`MCP SSE Endpoint: ${agent.mcpEndpoint}/sse`);
  console.log(`Model Endpoint: ${agent.modelEndpoint}`);
  console.log(`Model: ${agent.model}`);
  console.log(`Transport: Server-Sent Events (SSE)`);
  console.log(`WebSocket monitoring enabled on same port`);
  
  monitor.logActivity('SERVER_START', {
    port: PORT,
    timestamp: new Date().toISOString()
  });
  
  agent.warmupModel();
});

module.exports = { app, server, monitor, agent };