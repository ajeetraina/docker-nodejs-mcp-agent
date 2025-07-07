// Enhanced app.js with official MCP TypeScript SDK
const express = require('express');
const http = require('http');
const path = require('path');
const { MCPMonitor, createMonitoringWebSocketServer } = require('./monitoring-middleware');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { SSEClientTransport } = require('@modelcontextprotocol/sdk/client/sse.js');

const app = express();
const server = http.createServer(app);

// Initialize monitoring
const monitor = new MCPMonitor();

// Apply monitoring middleware
app.use(monitor.requestMonitoring());
app.use(express.json());
app.use(express.static('public'));

// Official MCP Client using the TypeScript SDK
class OfficialMCPClient {
  constructor(baseUrl, monitor) {
    this.baseUrl = baseUrl.replace('/sse', '');
    this.sseUrl = `${this.baseUrl}/sse`;
    this.monitor = monitor;
    this.client = null;
    this.transport = null;
    this.connected = false;
  }

  async connect() {
    if (this.connected) return;

    try {
      console.log(`[MCP-SDK] Connecting to ${this.sseUrl}`);
      this.monitor.logActivity('MCP_CONNECT_START', {
        endpoint: this.sseUrl,
        timestamp: new Date().toISOString()
      });

      // Create SSE transport using official SDK
      this.transport = new SSEClientTransport(new URL(this.sseUrl));
      
      // Create MCP client using official SDK
      this.client = new Client(
        {
          name: "simple-nodejs-mcp-agent",
          version: "1.0.0"
        },
        {
          capabilities: {
            tools: {}
          }
        }
      );

      // Connect the client
      await this.client.connect(this.transport);
      this.connected = true;

      console.log(`[MCP-SDK] Connected successfully`);
      this.monitor.updateHealthStatus('mcp', 'healthy', {
        endpoint: this.sseUrl,
        connected: true,
        sdk: 'official'
      });
      
      this.monitor.logActivity('MCP_CONNECT_SUCCESS', {
        endpoint: this.sseUrl,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      console.error(`[MCP-SDK] Connection failed:`, error);
      this.monitor.updateHealthStatus('mcp', 'error', {
        endpoint: this.sseUrl,
        error: error.message,
        sdk: 'official'
      });
      throw error;
    }
  }

  async callTool(toolName, arguments) {
    await this.connect();
    
    const tracker = this.monitor.trackMCPCall(toolName, arguments, Date.now());
    const startTime = Date.now();

    try {
      console.log(`[MCP-SDK] Calling tool: ${toolName}`, arguments);
      
      // Use official SDK to call tool
      const result = await this.client.callTool({
        name: toolName,
        arguments: arguments
      });

      const responseTime = Date.now() - startTime;
      console.log(`[MCP-SDK] Tool call successful:`, result);
      
      tracker.end(true, responseTime, result);
      this.monitor.updateHealthStatus('mcp', 'healthy');
      
      return result;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      console.error(`[MCP-SDK] Tool call failed:`, error);
      
      tracker.end(false, responseTime, null);
      this.monitor.updateHealthStatus('mcp', 'error', {
        error: error.message,
        tool: toolName
      });
      throw error;
    }
  }

  async listTools() {
    await this.connect();
    
    try {
      console.log(`[MCP-SDK] Listing available tools`);
      const result = await this.client.listTools();
      console.log(`[MCP-SDK] Available tools:`, result);
      return result;
    } catch (error) {
      console.error(`[MCP-SDK] Failed to list tools:`, error);
      throw error;
    }
  }

  async testConnection() {
    try {
      console.log(`[MCP-SDK] Testing connection...`);
      await this.connect();
      
      // Try to list tools to verify connection
      await this.listTools();
      
      console.log(`[MCP-SDK] Connection test passed`);
      return true;
    } catch (error) {
      console.error(`[MCP-SDK] Connection test failed:`, error.message);
      return false;
    }
  }

  async disconnect() {
    if (this.client && this.connected) {
      try {
        await this.client.close();
        this.connected = false;
        console.log(`[MCP-SDK] Disconnected`);
        this.monitor.logActivity('MCP_DISCONNECT', {
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error(`[MCP-SDK] Disconnect error:`, error);
      }
    }
  }
}

// Enhanced SimpleAgent with official MCP SDK
class SimpleAgent {
  constructor() {
    const rawEndpoint = process.env.MCP_ENDPOINT || process.env.MCP_GATEWAY_URL || 'http://mcp-gateway:8811';
    this.mcpEndpoint = rawEndpoint.replace('/sse', '');
    
    // Initialize official MCP client
    this.mcpClient = new OfficialMCPClient(this.mcpEndpoint, monitor);
    
    this.modelEndpoint = process.env.MODEL_RUNNER_URL || 'http://model-runner.docker.internal:12434/v1';
    this.model = process.env.MODEL_RUNNER_MODEL || 'ai/gemma3-qat';
    this.warmupDone = false;
    
    console.log(`[CONFIG] MCP Endpoint: ${this.mcpEndpoint}`);
    console.log(`[CONFIG] MCP SSE Endpoint: ${this.mcpEndpoint}/sse`);
    console.log(`[CONFIG] Model Endpoint: ${this.modelEndpoint}`);
    console.log(`[CONFIG] Model: ${this.model}`);
    console.log(`[CONFIG] Using Official MCP SDK`);
    
    // Update initial health status
    monitor.updateHealthStatus('app', 'healthy', {
      mcpEndpoint: this.mcpEndpoint,
      modelEndpoint: this.modelEndpoint,
      model: this.model,
      mcpSdk: 'official'
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
      
    console.log(`[MODEL] Calling model at: ${endpoint}`);
    
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
      
      console.log(`[MODEL] Request body:`, JSON.stringify(requestBody, null, 2));
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(requestBody)
      });
      
      console.log(`[MODEL] Response status: ${response.status}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[MODEL] Error:`, errorText);
        tracker.end(false, { status: response.status, error: errorText });
        monitor.updateHealthStatus('model', 'error', {
          status: response.status,
          error: errorText,
          endpoint
        });
        throw new Error(`Model API error: ${response.status} - ${errorText}`);
      }
      
      const data = await response.json();
      console.log(`[MODEL] Response received, choices: ${data.choices?.length}`);
      
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
      console.error('[MODEL] Call failed:', error);
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
      console.log('[MODEL] Warming up...');
      monitor.logActivity('MODEL_WARMUP_START', {
        model: this.model,
        timestamp: new Date().toISOString()
      });
      
      try {
        await this.callModel('Hello');
        this.warmupDone = true;
        console.log('[MODEL] Warmed up successfully');
        monitor.logActivity('MODEL_WARMUP_SUCCESS', {
          model: this.model,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.log('[MODEL] Warmup failed, will try on first request:', error.message);
        monitor.logActivity('MODEL_WARMUP_FAILED', {
          model: this.model,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    }
  }

  async testMCPConnection() {
    try {
      console.log('[MCP-SDK] Testing connection...');
      const isConnected = await this.mcpClient.testConnection();
      if (isConnected) {
        console.log('[MCP-SDK] Connection test passed');
        monitor.updateHealthStatus('mcp', 'healthy', {
          endpoint: this.mcpEndpoint,
          connected: true,
          sdk: 'official'
        });
        return true;
      } else {
        console.log('[MCP-SDK] Connection test failed');
        monitor.updateHealthStatus('mcp', 'warning', {
          endpoint: this.mcpEndpoint,
          connected: false,
          sdk: 'official'
        });
        return false;
      }
    } catch (error) {
      console.error('[MCP-SDK] Connection test error:', error.message);
      monitor.updateHealthStatus('mcp', 'error', {
        endpoint: this.mcpEndpoint,
        error: error.message,
        sdk: 'official'
      });
      return false;
    }
  }

  async listMCPTools() {
    try {
      console.log('[MCP-SDK] Listing available tools...');
      const tools = await this.mcpClient.listTools();
      return tools;
    } catch (error) {
      console.error('[MCP-SDK] Failed to list tools:', error.message);
      return { error: error.message };
    }
  }

  async callMCPTool(tool, params) {
    try {
      console.log(`[MCP-SDK] Calling tool: ${tool} with params:`, params);
      const result = await this.mcpClient.callTool(tool, params);
      return result;
    } catch (error) {
      console.error('[MCP-SDK] Tool call failed:', error.message);
      return { 
        error: `MCP call failed: ${error.message}\n\nUsing Official MCP SDK. Check:\n1. MCP Gateway is running: docker compose ps\n2. MCP Gateway logs: docker compose logs mcp-gateway\n3. Gateway supports the requested tool\n4. Network connectivity between services` 
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
    console.log(`[QUERY] Processing: ${query}`);
    
    monitor.logActivity('QUERY_START', {
      query,
      timestamp: new Date().toISOString()
    });

    // Test MCP connection first
    await this.testMCPConnection();
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
      console.log('[TOOL] Selected DuckDuckGo search via MCP SDK:', toolCall);
      monitor.logActivity('TOOL_SELECTED', {
        tool: 'search',
        reason: 'search_keywords_detected',
        timestamp: new Date().toISOString()
      });
      toolResult = await this.callMCPTool(toolCall.tool, toolCall.params);
    } else if (this.needsFileOperation(query)) {
      toolCall = { tool: "none", params: {} };
      console.log('[TOOL] File operation detected - providing general guidance');
      monitor.logActivity('TOOL_SELECTED', {
        tool: 'none',
        reason: 'file_operation_detected',
        timestamp: new Date().toISOString()
      });
    } else {
      toolCall = { tool: "none", params: {} };
      console.log('[TOOL] No tool needed for this query');
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
        mcpSdk: 'official',
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
      console.error('[QUERY] Error processing query:', error);
      monitor.logActivity('QUERY_ERROR', {
        query,
        error: error.message,
        timestamp: new Date().toISOString()
      });
      
      return {
        query,
        error: error.message,
        response: "Sorry, I encountered an error processing your request.",
        timestamp: new Date().toISOString(),
        mcpSdk: 'official'
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

app.get('/health', async (req, res) => {
  const mcpConnected = await agent.testMCPConnection();
  
  const healthData = {
    status: 'healthy', 
    mcpEndpoint: agent.mcpEndpoint,
    mcpSSEEndpoint: `${agent.mcpEndpoint}/sse`,
    mcpConnected: mcpConnected,
    mcpSdk: 'official',
    modelEndpoint: agent.modelEndpoint,
    model: agent.model,
    timestamp: new Date().toISOString(),
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

// Test MCP connection endpoint
app.get('/test-mcp', async (req, res) => {
  try {
    const isConnected = await agent.testMCPConnection();
    res.json({ 
      connected: isConnected,
      endpoint: agent.mcpEndpoint,
      sseEndpoint: `${agent.mcpEndpoint}/sse`,
      sdk: 'official',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ 
      error: error.message,
      connected: false,
      endpoint: agent.mcpEndpoint,
      sdk: 'official',
      timestamp: new Date().toISOString()
    });
  }
});

// List available MCP tools
app.get('/mcp-tools', async (req, res) => {
  try {
    const tools = await agent.listMCPTools();
    res.json({
      tools: tools,
      endpoint: agent.mcpEndpoint,
      sdk: 'official',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
      endpoint: agent.mcpEndpoint,
      sdk: 'official',
      timestamp: new Date().toISOString()
    });
  }
});

// Serve monitoring dashboard
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Initialize WebSocket server for real-time monitoring
const wss = createMonitoringWebSocketServer(server, monitor);

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[SERVER] Shutting down gracefully...');
  monitor.logActivity('SHUTDOWN_START', {
    timestamp: new Date().toISOString()
  });
  
  // Disconnect MCP client
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
  console.log(`[SERVER] Simple MCP Agent with Official SDK running on port ${PORT}`);
  console.log(`[SERVER] Dashboard: http://localhost:${PORT}/dashboard`);
  console.log(`[SERVER] Metrics API: http://localhost:${PORT}/metrics`);
  console.log(`[SERVER] Health Check: http://localhost:${PORT}/health`);
  console.log(`[SERVER] Test MCP: http://localhost:${PORT}/test-mcp`);
  console.log(`[SERVER] MCP Tools: http://localhost:${PORT}/mcp-tools`);
  console.log(`[CONFIG] MCP Endpoint: ${agent.mcpEndpoint}`);
  console.log(`[CONFIG] MCP SSE Endpoint: ${agent.mcpEndpoint}/sse`);
  console.log(`[CONFIG] Model Endpoint: ${agent.modelEndpoint}`);
  console.log(`[CONFIG] Model: ${agent.model}`);
  console.log(`[CONFIG] Using Official MCP TypeScript SDK`);
  console.log(`[CONFIG] WebSocket monitoring enabled`);
  
  monitor.logActivity('SERVER_START', {
    port: PORT,
    mcpSdk: 'official',
    timestamp: new Date().toISOString()
  });
  
  // Test connections on startup
  await agent.testMCPConnection();
  agent.warmupModel();
});

module.exports = { app, server, monitor, agent };