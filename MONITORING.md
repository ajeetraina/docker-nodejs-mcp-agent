# MCP Agent Monitoring and Testing Guide

This document provides comprehensive information about the monitoring and testing capabilities added to the Simple Node.js MCP Agent.

## 🎯 Overview

The monitoring enhancement adds real-time observability to your MCP agent, allowing you to:

- **Visualize component interactions** in real-time
- **Monitor MCP Gateway usage** and tool execution
- **Track Model Runner performance** and inference metrics
- **Test all components** with automated validation
- **Identify bottlenecks** and optimize performance

## 🏗️ Enhanced Architecture

```
┌─────────────────────────────────────────────────────────┐
│                 Monitoring Layer                        │
├─────────────────────────────────────────────────────────┤
│  📊 Dashboard    📈 Metrics API    🔌 WebSocket        │
│  Port 3000       Port 3000        Port 3000            │
└─────────────────────────────────────────────────────────┘
                           │
┌─────────────────────────────────────────────────────────┐
│                  Your MCP Agent                         │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐       │
│  │ Layer 1:    │ │ Layer 2:    │ │ Layer 3:    │       │
│  │ Node.js App │─│ MCP Gateway │─│ MCP Tools   │       │
│  │ (Express)   │ │ (SSE)       │ │ (Search)    │       │
│  └─────────────┘ └─────────────┘ └─────────────┘       │
│                           │                            │
│                  ┌─────────────┐                       │
│                  │ Layer 4:    │                       │
│                  │ Model Runner│                       │
│                  │ (gemma3-qat)│                       │
│                  └─────────────┘                       │
└─────────────────────────────────────────────────────────┘
```

## 🚀 Quick Start

### 1. Standard Setup (Original)
```bash
# Run the original version
docker compose up --build
```

### 2. Enhanced Setup (With Monitoring)
```bash
# Run with comprehensive monitoring
docker compose -f compose.yaml -f compose.monitoring.yaml up --build

# Or use the npm script
npm run monitoring:start
```

### 3. Access Monitoring Interfaces

- **Real-time Dashboard**: http://localhost:3000/dashboard
- **Health Check**: http://localhost:3000/health
- **Metrics API**: http://localhost:3000/metrics
- **Activity Log**: http://localhost:3000/activity

## 📊 Monitoring Features

### Real-time Dashboard
- **Component Health**: Visual status indicators for all 4 layers
- **Flow Visualization**: Watch requests flow through your system
- **Performance Metrics**: Response times, success rates, throughput
- **Live Testing**: Built-in interface to test queries
- **System Logs**: Real-time activity stream

### WebSocket Monitoring
```javascript
const ws = new WebSocket('ws://localhost:3000');
ws.on('message', (data) => {
  const event = JSON.parse(data);
  console.log('Real-time event:', event.type, event.data);
});
```

### API Endpoints

#### `/health`
```json
{
  "status": "healthy",
  "mcpEndpoint": "http://mcp-gateway:8811",
  "modelEndpoint": "http://model-runner.docker.internal:12434/v1",
  "model": "ai/gemma3-qat",
  "monitoring": {
    "uptime": 120000,
    "requests": { "total": 15, "successful": 14, "failed": 1 },
    "mcp": { "calls": 5, "successful": 4, "failed": 1 },
    "model": { "calls": 15, "successful": 15, "failed": 0 }
  }
}
```

#### `/metrics`
```json
{
  "uptime": 120000,
  "uptimeFormatted": "00:02:00",
  "requests": {
    "total": 15,
    "successful": 14,
    "failed": 1,
    "byEndpoint": {
      "/chat": { "count": 12, "totalTime": 15000 },
      "/health": { "count": 3, "totalTime": 150 }
    }
  },
  "mcp": {
    "calls": 5,
    "successful": 4,
    "failed": 1,
    "tools": {
      "search": { "count": 5, "successful": 4, "failed": 1, "totalTime": 2500 }
    }
  },
  "model": {
    "calls": 15,
    "successful": 15,
    "failed": 0,
    "responseTimes": [1200, 800, 950, 1100, 750],
    "warmup": true
  }
}
```

## 🧪 Comprehensive Testing

### Automated Test Suite

Run the complete test suite:
```bash
# Full test suite
npm run test

# Or directly
node test-suite.js
```

### Individual Tests
```bash
# Health check only
npm run test:health

# Search functionality
npm run test:search

# Model inference
npm run test:model

# Component connectivity
npm run test:components
```

### Test Categories

1. **Health Check**: Validates all services are running
2. **Basic Chat**: Tests model inference without tools
3. **Search Functionality**: Verifies MCP Gateway and search tools
4. **Model Inference**: Tests complex reasoning capabilities
5. **Concurrent Requests**: Load testing with multiple simultaneous requests
6. **Error Handling**: Validates graceful error responses
7. **Component Connectivity**: Individual component testing
8. **WebSocket Monitoring**: Real-time data streaming validation

### Sample Test Output
```
🚀 Starting comprehensive MCP Agent test suite

[2025-01-15T10:30:00.000Z] [INFO] Starting test: Health Check
[2025-01-15T10:30:00.500Z] [SUCCESS] ✅ Test passed: Health Check (500ms)

[2025-01-15T10:30:01.000Z] [INFO] Starting test: Basic Chat
[2025-01-15T10:30:03.200Z] [SUCCESS] ✅ Test passed: Basic Chat (2200ms)

[2025-01-15T10:30:03.300Z] [INFO] Starting test: Search Functionality
[2025-01-15T10:30:06.100Z] [SUCCESS] ✅ Test passed: Search Functionality (2800ms)

📊 MCP Agent Test Suite Report
================================================================================
📈 Summary: 11/11 tests passed (100.0%)

🔧 Component Status:
   ✅ App: healthy
   ✅ Model Runner: healthy
   ⚠️ MCP Gateway: warning (Search functionality limited)

📡 Monitoring Data: 47 messages received
================================================================================
```

## 🔧 Monitoring Configuration

### Environment Variables
```bash
# Enable monitoring
MONITORING_ENABLED=true

# Monitoring endpoints
MCP_GATEWAY_URL=http://mcp-gateway:8811
MODEL_RUNNER_URL=http://model-runner.docker.internal:12434/v1
MODEL_RUNNER_MODEL=ai/gemma3-qat

# Logging
LOG_LEVEL=debug
NODE_ENV=development
```

### WebSocket Events
The monitoring system emits these WebSocket events:

- `REQUEST_START/END`: HTTP request lifecycle
- `MCP_CALL_START/END`: MCP tool execution
- `MODEL_CALL_START/END`: AI model inference
- `QUERY_START/SUCCESS/ERROR`: End-to-end query processing
- `HEALTH_UPDATE`: Component health changes
- `METRICS_UPDATE`: Periodic metrics updates

## 📈 Performance Monitoring

### Key Metrics Tracked

1. **Request Metrics**
   - Total requests processed
   - Success/failure rates
   - Average response times
   - Requests per minute

2. **MCP Gateway Metrics**
   - Tool call frequency and success rates
   - SSE connection health
   - Tool-specific performance

3. **Model Runner Metrics**
   - Inference call count and latency
   - Model warmup status
   - Token processing rates

4. **System Health**
   - Component availability
   - Uptime tracking
   - Error rates and patterns

### Performance Optimization Tips

1. **Model Warmup**: Monitor warmup completion to reduce cold start latency
2. **MCP Efficiency**: Track tool selection accuracy to optimize keyword detection
3. **Request Patterns**: Identify common queries to implement caching
4. **Resource Usage**: Monitor container resource consumption

## 🚨 Alerting and Notifications

### Built-in Alerts
- High response times (>5 seconds)
- Error rate spikes (>10%)
- Component failures
- MCP connection losses
- Model inference failures

### Webhook Integration
```bash
# Set up Slack/Discord notifications
export NOTIFICATION_WEBHOOK="https://hooks.slack.com/your/webhook/url"
docker compose -f compose.yaml -f compose.monitoring.yaml up
```

## 🔍 Troubleshooting

### Common Issues

#### Dashboard Not Loading
```bash
# Check if services are running
docker compose ps

# Check logs
docker compose logs app
```

#### WebSocket Connection Failed
```bash
# Verify port availability
netstat -an | grep 3000

# Check firewall settings
sudo ufw status
```

#### Metrics Not Updating
```bash
# Test metrics endpoint
curl http://localhost:3000/metrics

# Check monitoring middleware
docker compose logs app | grep "monitoring"
```

#### MCP Gateway Not Monitored
```bash
# Verify gateway health
curl http://localhost:8811/health

# Check SSE connection
curl -H "Accept: text/event-stream" http://localhost:8811/sse
```

### Debug Mode
```bash
# Enable detailed logging
export LOG_LEVEL=debug
export MONITORING_ENABLED=true
docker compose -f compose.yaml -f compose.monitoring.yaml up
```

## 🎮 Interactive Testing

### Dashboard Test Interface
1. Navigate to http://localhost:3000/dashboard
2. Use the built-in test panel
3. Try queries like:
   - `"Hello world"` (basic model inference)
   - `"search for latest AI news"` (MCP search)
   - `"explain quantum computing"` (complex reasoning)

### Manual Testing Commands
```bash
# Basic functionality
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello world"}'

# Search functionality (triggers MCP)
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "search for latest AI developments"}'

# Complex reasoning
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Explain the differences between supervised and unsupervised learning"}'
```

## 🏆 Success Criteria

Your monitoring setup is working correctly when you can:

1. ✅ See real-time request flow in the dashboard
2. ✅ Confirm MCP Gateway is contacted for search queries
3. ✅ Verify Model Runner processes inference requests
4. ✅ Monitor performance metrics across all components
5. ✅ Receive alerts for component failures
6. ✅ Track system health and uptime
7. ✅ Run automated tests successfully

## 🔗 Additional Resources

- **Dashboard**: http://localhost:3000/dashboard
- **Health API**: http://localhost:3000/health
- **Metrics API**: http://localhost:3000/metrics
- **Activity Stream**: http://localhost:3000/activity
- **Test Suite**: `node test-suite.js --help`

This comprehensive monitoring solution ensures you have complete visibility into your MCP agent's operations!