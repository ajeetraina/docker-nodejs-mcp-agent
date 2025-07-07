// Enhanced app.js with fixed MCP client implementation
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

// Simplified MCP Client that follows proper MCP protocol
class MCPClient {
  constructor(baseUrl, monitor) {
    this.baseUrl = baseUrl.replace('/sse', '');
    this.monitor = monitor;
    this.requestId = 1;
  }

  async callTool(toolName, params) {
    const requestId = this.requestId++;
    
    // Standard MCP JSON-RPC 2.0 message format
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
      console.log(`[MCP] Calling tool ${toolName} at ${this.baseUrl}`);
      console.log(`[MCP] Request:`, JSON.stringify(message, null, 2));
      
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'simple-nodejs-mcp-agent/1.0'
        },
        body: JSON.stringify(message)
      });

      const responseTime = Date.now() - startTime;
      console.log(`[MCP] Response status: ${response.status}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[MCP] Error response:`, errorText);
        
        tracker.end(false, responseTime, { status: response.status, error: errorText });
        this.monitor.updateHealthStatus('mcp', 'error', {
          status: response.status,
          error: errorText,
          tool: toolName
        });
        
        // Provide more specific error messages based on status code
        if (response.status === 405) {
          throw new Error(`Method Not Allowed - MCP Gateway doesn't accept POST requests to ${this.baseUrl}. The gateway might be configured differently or require a different endpoint.`);
        } else if (response.status === 404) {
          throw new Error(`Not Found - MCP Gateway endpoint ${this.baseUrl} doesn't exist. Check if the gateway is running and the URL is correct.`);
        } else if (response.status === 403) {
          throw new Error(`Forbidden - Access denied to MCP Gateway. Check authentication or permissions.`);
        } else {
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
      }

      const result = await response.json();
      console.log(`[MCP] Response:`, JSON.stringify(result, null, 2));

      if (result.error) {
        tracker.end(false, responseTime, result.error);
        this.monitor.updateHealthStatus('mcp', 'warning', {
          lastError: result.error,
          tool: toolName
        });
        throw new Error(`MCP Error: ${result.error.message || JSON.stringify(result.error)}`);
      }

      tracker.end(true, responseTime, result.result || result);
      this.monitor.updateHealthStatus('mcp', 'healthy');
      
      return result.result || result;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      tracker.end(false, responseTime, null);
      this.monitor.updateHealthStatus('mcp', 'error', {
        error: error.message,
        tool: toolName
      });
      console.error(`[MCP] Tool call failed:`, error.message);
      throw error;
    }
  }

  async testConnection() {
    try {
      console.log(`[MCP] Testing connection to ${this.baseUrl}`);
      
      // Try a simple health check first
      const healthResponse = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });

      if (healthResponse.ok) {
        const health = await healthResponse.json();
        console.log(`[MCP] Health check passed:`, health);
        return true;
      }
      
      // If no health endpoint, try the base endpoint
      const baseResponse = await fetch(this.baseUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });

      console.log(`[MCP] Base endpoint response: ${baseResponse.status}`);
      return baseResponse.status !== 404;
      
    } catch (error) {
      console.error(`[MCP] Connection test failed:`, error.message);
      return false;
    }
  }
}

// Enhanced SimpleAgent with fixed MCP client
class SimpleAgent {
  constructor() {
    const rawEndpoint = process.env.MCP_ENDPOINT || process.env.MCP_GATEWAY_URL || 'http://mcp-gateway:8811';
    this.mcpEndpoint = rawEndpoint.replace('/sse', '');
    
    // Initialize simplified MCP client
    this.mcpClient = new MCPClient(this.mcpEndpoint, monitor);
    
    this.modelEndpoint = process.env.MODEL_RUNNER_URL || 'http://model-runner.docker.internal:12434/v1';
    this.model = process.env.MODEL_RUNNER_MODEL || 'ai/gemma3-qat';
    this.warmupDone = false;
    
    console.log(`[CONFIG] MCP Endpoint: ${this.mcpEndpoint}`);
    console.log(`[CONFIG] Model Endpoint: ${this.modelEndpoint}`);
    console.log(`[CONFIG] Model: ${this.model}`);
    
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
      console.log('[MCP] Testing connection...');
      const isConnected = await this.mcpClient.testConnection();
      if (isConnected) {
        console.log('[MCP] Connection test passed');
        monitor.updateHealthStatus('mcp', 'healthy', {
          endpoint: this.mcpEndpoint,
          connected: true
        });
        return true;
      } else {
        console.log('[MCP] Connection test failed');
        monitor.updateHealthStatus('mcp', 'warning', {
          endpoint: this.mcpEndpoint,
          connected: false
        });
        return false;
      }
    } catch (error) {
      console.error('[MCP] Connection test error:', error.message);
      monitor.updateHealthStatus('mcp', 'error', {
        endpoint: this.mcpEndpoint,
        error: error.message
      });
      return false;
    }
  }

  async callMCPTool(tool, params) {
    try {
      console.log(`[MCP] Calling tool: ${tool} with params:`, params);
      const result = await this.mcpClient.callTool(tool, params);
      return result;
    } catch (error) {
      console.error('[MCP] Tool call failed:', error.message);
      return { 
        error: `MCP call failed: ${error.message}\n\nTroubleshooting tips:\n1. Check if MCP Gateway is running: docker compose ps\n2. Check MCP Gateway logs: docker compose logs mcp-gateway\n3. Verify gateway configuration in compose.yaml\n4. Ensure network connectivity between services\n5. Try restarting the services: docker compose restart` 
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
      console.log('[TOOL] Selected DuckDuckGo search via MCP:', toolCall);
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

app.get('/health', async (req, res) => {
  const mcpConnected = await agent.testMCPConnection();
  
  const healthData = {
    status: 'healthy', 
    mcpEndpoint: agent.mcpEndpoint,
    mcpConnected: mcpConnected,
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
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ 
      error: error.message,
      connected: false,
      endpoint: agent.mcpEndpoint,
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
  
  if (wss) {
    wss.close();
  }
  
  process.exit(0);
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', async () => {
  console.log(`[SERVER] Simple MCP Agent with monitoring running on port ${PORT}`);
  console.log(`[SERVER] Dashboard: http://localhost:${PORT}/dashboard`);
  console.log(`[SERVER] Metrics API: http://localhost:${PORT}/metrics`);
  console.log(`[SERVER] Health Check: http://localhost:${PORT}/health`);
  console.log(`[SERVER] Test MCP: http://localhost:${PORT}/test-mcp`);
  console.log(`[CONFIG] MCP Endpoint: ${agent.mcpEndpoint}`);
  console.log(`[CONFIG] Model Endpoint: ${agent.modelEndpoint}`);
  console.log(`[CONFIG] Model: ${agent.model}`);
  console.log(`[CONFIG] WebSocket monitoring enabled`);
  
  monitor.logActivity('SERVER_START', {
    port: PORT,
    timestamp: new Date().toISOString()
  });
  
  // Test connections on startup
  await agent.testMCPConnection();
  agent.warmupModel();
});

module.exports = { app, server, monitor, agent };