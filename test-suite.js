// test-suite.js - Comprehensive testing for MCP Agent
const fetch = require('node-fetch');
const WebSocket = require('ws');

class MCPAgentTester {
  constructor(baseUrl = 'http://localhost:3000') {
    this.baseUrl = baseUrl;
    this.testResults = [];
    this.currentTest = null;
    this.websocket = null;
    this.monitoringData = [];
  }

  log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const logEntry = { timestamp, message, type, test: this.currentTest };
    console.log(`[${timestamp}] [${type.toUpperCase()}] ${this.currentTest ? `[${this.currentTest}] ` : ''}${message}`);
    this.testResults.push(logEntry);
  }

  async runTest(testName, testFunction) {
    this.currentTest = testName;
    this.log(`Starting test: ${testName}`, 'info');
    
    const startTime = Date.now();
    try {
      const result = await testFunction();
      const duration = Date.now() - startTime;
      this.log(`✅ Test passed: ${testName} (${duration}ms)`, 'success');
      return { testName, status: 'passed', duration, result };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.log(`❌ Test failed: ${testName} - ${error.message} (${duration}ms)`, 'error');
      return { testName, status: 'failed', duration, error: error.message };
    } finally {
      this.currentTest = null;
    }
  }

  async connectWebSocket() {
    return new Promise((resolve, reject) => {
      this.websocket = new WebSocket(`ws://localhost:3000`);
      
      this.websocket.on('open', () => {
        this.log('WebSocket connection established', 'success');
        resolve();
      });
      
      this.websocket.on('message', (data) => {
        try {
          const message = JSON.parse(data);
          this.monitoringData.push(message);
          this.log(`Received monitoring data: ${message.type}`, 'info');
        } catch (error) {
          this.log(`Failed to parse WebSocket message: ${error.message}`, 'warning');
        }
      });
      
      this.websocket.on('error', (error) => {
        this.log(`WebSocket error: ${error.message}`, 'error');
        reject(error);
      });
      
      setTimeout(() => {
        if (this.websocket.readyState !== WebSocket.OPEN) {
          reject(new Error('WebSocket connection timeout'));
        }
      }, 5000);
    });
  }

  async testHealthCheck() {
    const response = await fetch(`${this.baseUrl}/health`);
    if (!response.ok) {
      throw new Error(`Health check failed: ${response.status}`);
    }
    
    const data = await response.json();
    this.log(`Health status: ${data.status}`, 'info');
    this.log(`MCP Endpoint: ${data.mcpEndpoint}`, 'info');
    this.log(`Model Endpoint: ${data.modelEndpoint}`, 'info');
    this.log(`Model: ${data.model}`, 'info');
    
    if (data.monitoring) {
      this.log(`Monitoring uptime: ${data.monitoring.uptimeFormatted}`, 'info');
      this.log(`Total requests: ${data.monitoring.requests.total}`, 'info');
    }
    
    return data;
  }

  async testBasicChat() {
    const testMessage = "Hello, this is a basic test message.";
    
    const response = await fetch(`${this.baseUrl}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: testMessage })
    });
    
    if (!response.ok) {
      throw new Error(`Chat request failed: ${response.status}`);
    }
    
    const data = await response.json();
    this.log(`Query: ${data.query}`, 'info');
    this.log(`Tool used: ${data.toolUsed || 'none'}`, 'info');
    this.log(`Response length: ${data.response.length} characters`, 'info');
    
    if (!data.response) {
      throw new Error('No response received from chat endpoint');
    }
    
    return data;
  }

  async testSearchFunctionality() {
    const searchMessage = "search for latest AI news";
    
    const response = await fetch(`${this.baseUrl}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: searchMessage })
    });
    
    if (!response.ok) {
      throw new Error(`Search request failed: ${response.status}`);
    }
    
    const data = await response.json();
    this.log(`Search query: ${data.query}`, 'info');
    this.log(`Tool used: ${data.toolUsed}`, 'info');
    
    if (data.toolUsed !== 'search') {
      this.log('Expected search tool to be used but it was not', 'warning');
    }
    
    if (data.toolResult && data.toolResult.error) {
      this.log(`MCP search error: ${data.toolResult.error}`, 'warning');
    } else if (data.toolResult) {
      this.log('MCP search returned results successfully', 'success');
    }
    
    return data;
  }

  async testModelInference() {
    const complexMessage = "Explain the concept of quantum computing in simple terms.";
    
    const response = await fetch(`${this.baseUrl}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: complexMessage })
    });
    
    if (!response.ok) {
      throw new Error(`Model inference request failed: ${response.status}`);
    }
    
    const data = await response.json();
    this.log(`Model response length: ${data.response.length} characters`, 'info');
    
    if (data.response.length < 50) {
      throw new Error('Model response seems too short for the complex question');
    }
    
    return data;
  }

  async testMetricsEndpoint() {
    const response = await fetch(`${this.baseUrl}/metrics`);
    if (!response.ok) {
      throw new Error(`Metrics endpoint failed: ${response.status}`);
    }
    
    const metrics = await response.json();
    this.log(`Total requests: ${metrics.requests.total}`, 'info');
    this.log(`MCP calls: ${metrics.mcp.calls}`, 'info');
    this.log(`Model calls: ${metrics.model.calls}`, 'info');
    this.log(`Uptime: ${metrics.uptimeFormatted}`, 'info');
    this.log(`Request success rate: ${((metrics.requests.successful / metrics.requests.total) * 100).toFixed(1)}%`, 'info');
    
    return metrics;
  }

  async testActivityEndpoint() {
    const response = await fetch(`${this.baseUrl}/activity?limit=10`);
    if (!response.ok) {
      throw new Error(`Activity endpoint failed: ${response.status}`);
    }
    
    const activities = await response.json();
    this.log(`Recent activities count: ${activities.length}`, 'info');
    
    if (activities.length > 0) {
      const lastActivity = activities[activities.length - 1];
      this.log(`Last activity: ${lastActivity.type}`, 'info');
    }
    
    return activities;
  }

  async testConcurrentRequests() {
    const messages = [
      "What is artificial intelligence?",
      "search for machine learning trends",
      "How does neural network training work?",
      "search for latest computer vision research",
      "Explain deep learning basics"
    ];
    
    this.log(`Starting ${messages.length} concurrent requests`, 'info');
    
    const startTime = Date.now();
    const promises = messages.map(message => 
      fetch(`${this.baseUrl}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message })
      }).then(res => res.json())
    );
    
    const results = await Promise.all(promises);
    const totalTime = Date.now() - startTime;
    
    this.log(`All ${results.length} requests completed in ${totalTime}ms`, 'success');
    this.log(`Average time per request: ${(totalTime / results.length).toFixed(1)}ms`, 'info');
    
    const searchRequests = results.filter(r => r.toolUsed === 'search').length;
    this.log(`Search requests: ${searchRequests}/${results.length}`, 'info');
    
    return results;
  }

  async testErrorHandling() {
    // Test invalid request
    const response = await fetch(`${this.baseUrl}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}) // Missing message
    });
    
    if (response.status !== 400) {
      throw new Error(`Expected 400 status for invalid request, got ${response.status}`);
    }
    
    const errorData = await response.json();
    this.log(`Error handling working correctly: ${errorData.error}`, 'success');
    
    return errorData;
  }

  async testWebSocketMonitoring() {
    if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }
    
    // Send a test request and wait for monitoring data
    const initialDataCount = this.monitoringData.length;
    
    await fetch(`${this.baseUrl}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: "WebSocket monitoring test" })
    });
    
    // Wait for monitoring data
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const newDataCount = this.monitoringData.length;
    if (newDataCount <= initialDataCount) {
      throw new Error('No new monitoring data received via WebSocket');
    }
    
    this.log(`Received ${newDataCount - initialDataCount} new monitoring messages`, 'success');
    return this.monitoringData.slice(initialDataCount);
  }

  async testLoadScenario() {
    this.log('Starting load test scenario', 'info');
    
    const scenarios = [
      { name: 'Basic queries', count: 5, message: "Hello world" },
      { name: 'Search queries', count: 3, message: "search for AI developments" },
      { name: 'Complex queries', count: 2, message: "Explain the differences between supervised and unsupervised learning" }
    ];
    
    const results = [];
    
    for (const scenario of scenarios) {
      this.log(`Running ${scenario.name}: ${scenario.count} requests`, 'info');
      
      const startTime = Date.now();
      const promises = Array(scenario.count).fill().map(() => 
        fetch(`${this.baseUrl}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: scenario.message })
        }).then(res => res.json())
      );
      
      const scenarioResults = await Promise.all(promises);
      const duration = Date.now() - startTime;
      
      this.log(`${scenario.name} completed in ${duration}ms`, 'success');
      results.push({ scenario: scenario.name, count: scenario.count, duration, results: scenarioResults });
    }
    
    return results;
  }

  async testComponentConnectivity() {
    // Test each component individually
    const components = [];
    
    // 1. Test basic app connectivity
    try {
      const health = await this.testHealthCheck();
      components.push({ name: 'App', status: 'healthy', details: health });
    } catch (error) {
      components.push({ name: 'App', status: 'error', error: error.message });
    }
    
    // 2. Test model connectivity (via basic chat)
    try {
      const basicResponse = await this.testBasicChat();
      components.push({ 
        name: 'Model Runner', 
        status: 'healthy', 
        details: { responseTime: 'measured', responseLength: basicResponse.response.length }
      });
    } catch (error) {
      components.push({ name: 'Model Runner', status: 'error', error: error.message });
    }
    
    // 3. Test MCP connectivity (via search)
    try {
      const searchResponse = await this.testSearchFunctionality();
      if (searchResponse.toolResult && !searchResponse.toolResult.error) {
        components.push({ name: 'MCP Gateway', status: 'healthy', details: searchResponse.toolResult });
      } else {
        components.push({ 
          name: 'MCP Gateway', 
          status: 'warning', 
          error: searchResponse.toolResult?.error || 'Search did not execute'
        });
      }
    } catch (error) {
      components.push({ name: 'MCP Gateway', status: 'error', error: error.message });
    }
    
    return components;
  }

  async runFullTestSuite() {
    this.log('🚀 Starting comprehensive MCP Agent test suite', 'info');
    
    const tests = [
      { name: 'Health Check', fn: () => this.testHealthCheck() },
      { name: 'Basic Chat', fn: () => this.testBasicChat() },
      { name: 'Model Inference', fn: () => this.testModelInference() },
      { name: 'Search Functionality', fn: () => this.testSearchFunctionality() },
      { name: 'Metrics Endpoint', fn: () => this.testMetricsEndpoint() },
      { name: 'Activity Endpoint', fn: () => this.testActivityEndpoint() },
      { name: 'Error Handling', fn: () => this.testErrorHandling() },
      { name: 'Concurrent Requests', fn: () => this.testConcurrentRequests() },
      { name: 'Load Scenario', fn: () => this.testLoadScenario() },
      { name: 'Component Connectivity', fn: () => this.testComponentConnectivity() }
    ];
    
    // Try to connect WebSocket for monitoring
    try {
      await this.connectWebSocket();
      tests.push({ name: 'WebSocket Monitoring', fn: () => this.testWebSocketMonitoring() });
    } catch (error) {
      this.log(`WebSocket connection failed: ${error.message}`, 'warning');
    }
    
    const results = [];
    for (const test of tests) {
      const result = await this.runTest(test.name, test.fn);
      results.push(result);
    }
    
    // Final metrics check
    const finalMetrics = await this.runTest('Final Metrics Check', () => this.testMetricsEndpoint());
    results.push(finalMetrics);
    
    this.generateReport(results);
    return results;
  }

  generateReport(results) {
    console.log('\n' + '='.repeat(80));
    console.log('📊 MCP Agent Test Suite Report');
    console.log('='.repeat(80));
    
    const passed = results.filter(r => r.status === 'passed').length;
    const failed = results.filter(r => r.status === 'failed').length;
    const total = results.length;
    
    console.log(`\n📈 Summary: ${passed}/${total} tests passed (${((passed/total)*100).toFixed(1)}%)`);
    
    if (failed > 0) {
      console.log('\n❌ Failed Tests:');
      results.filter(r => r.status === 'failed').forEach(test => {
        console.log(`   • ${test.testName}: ${test.error}`);
      });
    }
    
    console.log('\n⏱️  Performance Summary:');
    const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length;
    console.log(`   • Average test duration: ${avgDuration.toFixed(0)}ms`);
    
    const slowestTest = results.reduce((max, r) => r.duration > max.duration ? r : max);
    console.log(`   • Slowest test: ${slowestTest.testName} (${slowestTest.duration}ms)`);
    
    console.log('\n🔧 Component Status:');
    const componentTest = results.find(r => r.testName === 'Component Connectivity');
    if (componentTest && componentTest.result) {
      componentTest.result.forEach(comp => {
        const statusIcon = comp.status === 'healthy' ? '✅' : comp.status === 'warning' ? '⚠️' : '❌';
        console.log(`   ${statusIcon} ${comp.name}: ${comp.status}`);
        if (comp.error) console.log(`      Error: ${comp.error}`);
      });
    }
    
    if (this.websocket) {
      console.log(`\n📡 Monitoring Data: ${this.monitoringData.length} messages received`);
      this.websocket.close();
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('Test suite completed!');
    console.log('='.repeat(80) + '\n');
  }
}

// CLI runner
if (require.main === module) {
  const tester = new MCPAgentTester();
  
  const args = process.argv.slice(2);
  const baseUrl = args.find(arg => arg.startsWith('--url='))?.split('=')[1] || 'http://localhost:3000';
  
  if (args.includes('--help')) {
    console.log(`
MCP Agent Test Suite

Usage: node test-suite.js [options]

Options:
  --url=<url>     Base URL for the MCP agent (default: http://localhost:3000)
  --test=<name>   Run specific test only
  --help          Show this help message

Available individual tests:
  health, basic, search, model, metrics, activity, error, concurrent, load, components

Examples:
  node test-suite.js                           # Run full test suite
  node test-suite.js --url=http://localhost:3001
  node test-suite.js --test=search             # Run only search test
`);
    process.exit(0);
  }
  
  const specificTest = args.find(arg => arg.startsWith('--test='))?.split('=')[1];
  
  (async () => {
    try {
      tester.baseUrl = baseUrl;
      
      if (specificTest) {
        const testMap = {
          health: () => tester.testHealthCheck(),
          basic: () => tester.testBasicChat(),
          search: () => tester.testSearchFunctionality(),
          model: () => tester.testModelInference(),
          metrics: () => tester.testMetricsEndpoint(),
          activity: () => tester.testActivityEndpoint(),
          error: () => tester.testErrorHandling(),
          concurrent: () => tester.testConcurrentRequests(),
          load: () => tester.testLoadScenario(),
          components: () => tester.testComponentConnectivity()
        };
        
        if (testMap[specificTest]) {
          const result = await tester.runTest(specificTest, testMap[specificTest]);
          console.log('\nTest Result:', JSON.stringify(result, null, 2));
        } else {
          console.error(`Unknown test: ${specificTest}`);
          process.exit(1);
        }
      } else {
        await tester.runFullTestSuite();
      }
    } catch (error) {
      console.error('Test suite failed:', error);
      process.exit(1);
    }
  })();
}

module.exports = MCPAgentTester;