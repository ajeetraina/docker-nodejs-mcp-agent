// monitoring-middleware.js - Enhanced monitoring for MCP Agent
const express = require('express');
const EventEmitter = require('events');

class MCPMonitor extends EventEmitter {
  constructor() {
    super();
    this.metrics = {
      startTime: Date.now(),
      requests: {
        total: 0,
        successful: 0,
        failed: 0,
        byEndpoint: {}
      },
      mcp: {
        calls: 0,
        successful: 0,
        failed: 0,
        tools: {},
        responseTimes: []
      },
      model: {
        calls: 0,
        successful: 0,
        failed: 0,
        responseTimes: [],
        warmup: false
      },
      health: {
        lastCheck: null,
        status: 'starting',
        components: {
          app: 'unknown',
          mcp: 'unknown',
          model: 'unknown'
        }
      }
    };
    
    this.recentActivity = [];
    this.maxActivityHistory = 100;
  }

  // Request monitoring middleware
  requestMonitoring() {
    return (req, res, next) => {
      const startTime = Date.now();
      const endpoint = req.path;
      
      // Initialize endpoint metrics
      if (!this.metrics.requests.byEndpoint[endpoint]) {
        this.metrics.requests.byEndpoint[endpoint] = { count: 0, totalTime: 0 };
      }
      
      // Log request start
      this.logActivity('REQUEST_START', {
        method: req.method,
        endpoint,
        ip: req.ip || req.connection.remoteAddress,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString()
      });

      // Override res.json to capture response - Fixed version
      const originalJson = res.json.bind(res);
      res.json = (data) => {
        const responseTime = Date.now() - startTime;
        
        // Update metrics
        this.metrics.requests.total++;
        this.metrics.requests.byEndpoint[endpoint].count++;
        this.metrics.requests.byEndpoint[endpoint].totalTime += responseTime;
        
        if (res.statusCode >= 200 && res.statusCode < 400) {
          this.metrics.requests.successful++;
        } else {
          this.metrics.requests.failed++;
        }
        
        // Log response
        this.logActivity('REQUEST_END', {
          endpoint,
          statusCode: res.statusCode,
          responseTime,
          success: res.statusCode >= 200 && res.statusCode < 400,
          timestamp: new Date().toISOString()
        });
        
        this.emit('request_completed', {
          endpoint,
          statusCode: res.statusCode,
          responseTime,
          success: res.statusCode >= 200 && res.statusCode < 400
        });
        
        return originalJson(data);
      };
      
      next();
    };
  }

  // MCP call monitoring
  trackMCPCall(toolName, params, startTime) {
    this.metrics.mcp.calls++;
    
    if (!this.metrics.mcp.tools[toolName]) {
      this.metrics.mcp.tools[toolName] = { count: 0, totalTime: 0, successful: 0, failed: 0 };
    }
    
    this.metrics.mcp.tools[toolName].count++;
    
    this.logActivity('MCP_CALL_START', {
      tool: toolName,
      params: JSON.stringify(params).substring(0, 200),
      timestamp: new Date().toISOString()
    });
    
    return {
      end: (success, responseTime, result) => {
        this.metrics.mcp.responseTimes.push(responseTime);
        this.metrics.mcp.tools[toolName].totalTime += responseTime;
        
        if (success) {
          this.metrics.mcp.successful++;
          this.metrics.mcp.tools[toolName].successful++;
        } else {
          this.metrics.mcp.failed++;
          this.metrics.mcp.tools[toolName].failed++;
        }
        
        this.logActivity('MCP_CALL_END', {
          tool: toolName,
          success,
          responseTime,
          result: result ? JSON.stringify(result).substring(0, 200) : 'error',
          timestamp: new Date().toISOString()
        });
        
        this.emit('mcp_call_completed', {
          tool: toolName,
          success,
          responseTime,
          result
        });
      }
    };
  }

  // Model call monitoring
  trackModelCall(model, prompt) {
    this.metrics.model.calls++;
    const startTime = Date.now();
    
    this.logActivity('MODEL_CALL_START', {
      model,
      promptLength: prompt.length,
      timestamp: new Date().toISOString()
    });
    
    return {
      end: (success, result) => {
        const responseTime = Date.now() - startTime;
        this.metrics.model.responseTimes.push(responseTime);
        
        if (success) {
          this.metrics.model.successful++;
          if (!this.metrics.model.warmup) {
            this.metrics.model.warmup = true;
            this.logActivity('MODEL_WARMUP', {
              message: 'Model is now warmed up',
              timestamp: new Date().toISOString()
            });
          }
        } else {
          this.metrics.model.failed++;
        }
        
        this.logActivity('MODEL_CALL_END', {
          model,
          success,
          responseTime,
          resultLength: result ? (typeof result === 'string' ? result.length : JSON.stringify(result).length) : 0,
          timestamp: new Date().toISOString()
        });
        
        this.emit('model_call_completed', {
          model,
          success,
          responseTime,
          result
        });
      }
    };
  }

  // Health monitoring
  updateHealthStatus(component, status, details = {}) {
    this.metrics.health.components[component] = status;
    this.metrics.health.lastCheck = Date.now();
    
    // Determine overall system status
    const componentStatuses = Object.values(this.metrics.health.components);
    if (componentStatuses.every(s => s === 'healthy')) {
      this.metrics.health.status = 'healthy';
    } else if (componentStatuses.some(s => s === 'error')) {
      this.metrics.health.status = 'error';
    } else {
      this.metrics.health.status = 'warning';
    }
    
    this.logActivity('HEALTH_UPDATE', {
      component,
      status,
      overall: this.metrics.health.status,
      details,
      timestamp: new Date().toISOString()
    });
    
    this.emit('health_updated', {
      component,
      status,
      overall: this.metrics.health.status,
      details
    });
  }

  // Activity logging
  logActivity(type, data) {
    const activity = {
      id: Date.now() + Math.random(),
      type,
      data,
      timestamp: Date.now()
    };
    
    this.recentActivity.push(activity);
    
    // Keep only recent activities
    if (this.recentActivity.length > this.maxActivityHistory) {
      this.recentActivity = this.recentActivity.slice(-this.maxActivityHistory);
    }
    
    this.emit('activity', activity);
  }

  // Get current metrics
  getMetrics() {
    const now = Date.now();
    const uptime = now - this.metrics.startTime;
    
    return {
      ...this.metrics,
      uptime,
      uptimeFormatted: this.formatUptime(uptime),
      averageResponseTime: this.calculateAverageResponseTime(),
      requestsPerMinute: this.calculateRequestsPerMinute(),
      mcpSuccessRate: this.calculateMCPSuccessRate(),
      modelSuccessRate: this.calculateModelSuccessRate(),
      averageMCPResponseTime: this.calculateAverageMCPResponseTime(),
      averageModelResponseTime: this.calculateAverageModelResponseTime(),
      recentActivity: this.recentActivity.slice(-20)
    };
  }

  // Helper calculations
  calculateAverageResponseTime() {
    const allTimes = [];
    Object.values(this.metrics.requests.byEndpoint).forEach(endpoint => {
      if (endpoint.count > 0) {
        allTimes.push(endpoint.totalTime / endpoint.count);
      }
    });
    return allTimes.length > 0 ? Math.round(allTimes.reduce((a, b) => a + b, 0) / allTimes.length) : 0;
  }

  calculateRequestsPerMinute() {
    const uptimeMinutes = (Date.now() - this.metrics.startTime) / 60000;
    return uptimeMinutes > 0 ? Math.round(this.metrics.requests.total / uptimeMinutes) : 0;
  }

  calculateMCPSuccessRate() {
    return this.metrics.mcp.calls > 0 ? 
      Math.round((this.metrics.mcp.successful / this.metrics.mcp.calls) * 100) : 100;
  }

  calculateModelSuccessRate() {
    return this.metrics.model.calls > 0 ? 
      Math.round((this.metrics.model.successful / this.metrics.model.calls) * 100) : 100;
  }

  calculateAverageMCPResponseTime() {
    return this.metrics.mcp.responseTimes.length > 0 ?
      Math.round(this.metrics.mcp.responseTimes.reduce((a, b) => a + b, 0) / this.metrics.mcp.responseTimes.length) : 0;
  }

  calculateAverageModelResponseTime() {
    return this.metrics.model.responseTimes.length > 0 ?
      Math.round(this.metrics.model.responseTimes.reduce((a, b) => a + b, 0) / this.metrics.model.responseTimes.length) : 0;
  }

  formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  // Reset metrics
  reset() {
    this.metrics = {
      startTime: Date.now(),
      requests: { total: 0, successful: 0, failed: 0, byEndpoint: {} },
      mcp: { calls: 0, successful: 0, failed: 0, tools: {}, responseTimes: [] },
      model: { calls: 0, successful: 0, failed: 0, responseTimes: [], warmup: false },
      health: { lastCheck: null, status: 'starting', components: { app: 'unknown', mcp: 'unknown', model: 'unknown' } }
    };
    this.recentActivity = [];
    this.logActivity('METRICS_RESET', { timestamp: new Date().toISOString() });
  }
}

// WebSocket server for real-time updates
function createMonitoringWebSocketServer(server, monitor) {
  const WebSocket = require('ws');
  const wss = new WebSocket.Server({ server });
  
  wss.on('connection', (ws) => {
    console.log('Monitoring client connected');
    
    // Send initial metrics
    ws.send(JSON.stringify({
      type: 'metrics',
      data: monitor.getMetrics()
    }));
    
    // Set up real-time event forwarding
    const forwardEvent = (eventType, data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: eventType,
          data,
          timestamp: Date.now()
        }));
      }
    };
    
    monitor.on('activity', (activity) => forwardEvent('activity', activity));
    monitor.on('request_completed', (data) => forwardEvent('request_completed', data));
    monitor.on('mcp_call_completed', (data) => forwardEvent('mcp_call_completed', data));
    monitor.on('model_call_completed', (data) => forwardEvent('model_call_completed', data));
    monitor.on('health_updated', (data) => forwardEvent('health_updated', data));
    
    // Send periodic metric updates
    const metricsInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'metrics_update',
          data: monitor.getMetrics()
        }));
      }
    }, 2000);
    
    ws.on('close', () => {
      clearInterval(metricsInterval);
      console.log('Monitoring client disconnected');
    });
  });
  
  return wss;
}

module.exports = {
  MCPMonitor,
  createMonitoringWebSocketServer
};
