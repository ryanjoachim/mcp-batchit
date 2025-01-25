<div align="center">

# 🚀 MCP BatchIt

### Concurrency-Driven Multi-Operation Execution for the Model Context Protocol

[![npm version](https://badge.fury.io/js/mcp-batchit.svg)](https://www.npmjs.com/package/mcp-batchit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

</div>

## 📑 Table of Contents
- [Overview](#overview)
- [Quick Start](#quick-start)
- [Goals](#goals)
- [Features](#features)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Basic Usage](#basic-usage)
- [Advanced Usage](#advanced-usage)
- [AI Agent Integration](#ai-agent-integration)
- [Error Handling & Debugging](#error-handling--debugging)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

## 🔍 Overview

MCP BatchIt tackles one of the biggest performance bottleneck in LLM development: the "one action per request" limitation. Today, when an LLM needs to create a project, each action happens separately - one file creation, one file edit, one dependency added - each requiring its own API call.

**The Cost of Sequential Operations:**
Current LLM workflows are painfully inefficient:
1. LLM plans multiple actions (e.g., creating project files)
2. Each action requires a separate API request
3. Each request consumes tokens and context window space
4. Each round-trip adds latency
5. API costs multiply with every action
6. Simple tasks become expensive operations

**The Solution:**
MCP BatchIt enables parallel execution of multiple actions in a single request:
1. LLM sends complete task list directly to MCP-BatchIt or, if present, to Cline/Roo/Claude Desktop/etc to process and then pass on
2. BatchIt processes multiple operations concurrently
3. Returns all results in one response
4. Dramatically reduces round-trips and waiting time

### Why Use MCP BatchIt?

- **Faster Development**: Transform 10+ API calls into a single batch operation
- **Parallel Processing**: Execute multiple operations simultaneously
- **Smart Error Handling**: Manage operations as a single transaction with automatic retries
- **Universal Compatibility**: Works with any MCP-compatible LLM tool or AI agent

## 🚀 Quick Start

```bash
# Install the package
npm install mcp-batchit

# Start the server
npx mcp-batchit
```

Basic usage example:
```javascript
// Example: Process multiple file operations in one batch
{
  "targetServer": "ws://localhost:1234",
  "operations": [
    {
      "tool": "read_file",
      "arguments": {
        "path": "/path/to/source.txt"
      }
    },
    {
      "tool": "process_data",
      "arguments": {
        "type": "json",
        "validate": true
      }
    },
    {
      "tool": "write_file",
      "arguments": {
        "path": "/path/to/output.json",
        "content": "processed_data"
      }
    }
  ],
  "options": {
    "maxConcurrent": 2,
    "timeoutMs": 5000
  }
}
```

## 🎯 Goals

- Minimize network overhead and tool call repetition
- Enhance performance through batched operations
- Provide clear, structured operation results
- Maintain compatibility with any MCP server

## ✨ Features

- **Batch Processing**: Combine multiple operations in one request
- **Parallel Execution**: Configure concurrent operation limits
- **Timeout Control**: Set custom timeouts per operation
- **Error Management**: Optional early stopping on failures
- **Universal Compatibility**: Works with any MCP server

## 📋 Prerequisites

- Node.js 16.x or higher
- npm or yarn package manager
- Basic understanding of MCP (Model Context Protocol)
- WebSocket-capable environment

## 💻 Installation

### Version Compatibility

| mcp-batchit | Node.js     | MCP SDK |
|-------------|-------------|--------------|
| 1.x.x       | ≥ 18.0.0   | ≥ 1.4.0          |

### NPM Installation
```bash
npm install mcp-batchit
```

### Yarn Installation
```bash
yarn add mcp-batchit
```

### Script Configuration
Add to your `package.json`:
```json
{
  "scripts": {
    "start": "mcp-batchit",
    "dev": "mcp-batchit --debug",
    "start:prod": "mcp-batchit --port 3000 --max-concurrent 20"
  }
}
```

## 📘 Basic Usage

MCP BatchIt exposes a single tool: **`batch_execute`**

### Simple Example: File Processing Pipeline
```javascript
{
  "targetServer": "ws://localhost:1234",
  "operations": [
    {
      "tool": "read_csv",
      "arguments": {
        "path": "data/input.csv",
        "options": { "headers": true }
      }
    },
    {
      "tool": "transform_data",
      "arguments": {
        "operations": [
          { "type": "filter", "field": "age", "gt": 18 },
          { "type": "sort", "field": "lastName" }
        ]
      }
    },
    {
      "tool": "write_json",
      "arguments": {
        "path": "data/output.json",
        "pretty": true
      }
    }
  ]
}
```

### Response Format
```javascript
{
  "operations": [
    {
      "id": "op_1",
      "tool": "read_csv",
      "success": true,
      "durationMs": 45,
      "result": {
        "rowCount": 1000,
        "bytesRead": 52400
      }
    },
    // ... more operation results
  ],
  "summary": {
    "total": 3,
    "successful": 3,
    "failed": 0,
    "totalDurationMs": 157
  }
}
```

### Configuration Options
```javascript
{
  "options": {
    "maxConcurrent": 10,    // Maximum parallel operations
    "timeoutMs": 30000,     // Timeout per operation (ms)
    "stopOnError": false,   // Continue on errors
    "retryCount": 2,       // Number of retry attempts
    "retryDelayMs": 1000   // Delay between retries
  }
}
```

## 🔧 Advanced Usage

### Ordered Execution
```javascript
{
  "options": {
    "maxConcurrent": 1  // Forces sequential execution
  },
  "operations": [
    // Database migration example
    {"tool": "backup_database", "arguments": {
      "target": "backup.sql"
    }},
    {"tool": "run_migrations", "arguments": {
      "version": "1.2.0"
    }},
    {"tool": "verify_schema", "arguments": {
      "checksum": true
    }}
  ]
}
```

### Complex Error Handling
```javascript
{
  "options": {
    "stopOnError": true,
    "timeoutMs": 5000,
    "errorStrategy": {
      "retryableErrors": ["NETWORK_ERROR", "TIMEOUT"],
      "maxRetries": 3,
      "backoffMs": 1000
    }
  },
  "operations": [
    {
      "tool": "deploy_service",
      "arguments": {
        "name": "auth-service",
        "version": "2.1.0",
        "healthCheck": true
      }
    }
  ]
}
```

## 🤖 AI Agent Integration

MCP BatchIt is optimized for AI agents like Cline and Roo Code. It provides:

### Reduced Context Usage
- Fewer separate calls in conversation logs
- More efficient token usage
- Better conversation flow management

### Enhanced Intelligence
- Predictable operation ordering
- Built-in retry logic
- Smart error handling

### Real-world Example
```javascript
// AI assistant creating a new project
{
  "operations": [
    {
      "tool": "scaffold_project",
      "arguments": {
        "template": "react-typescript",
        "name": "user-dashboard"
      }
    },
    {
      "tool": "install_dependencies",
      "arguments": {
        "packages": [
          "@material-ui/core",
          "react-router-dom",
          "axios"
        ]
      }
    },
    {
      "tool": "configure_env",
      "arguments": {
        "variables": {
          "API_ENDPOINT": "https://api.example.com",
          "AUTH_METHOD": "oauth2"
        }
      }
    }
  ]
}
```

## 🔍 Error Handling & Debugging

### Error Codes

| Code | Description | Retry? | Solution |
|------|-------------|--------|----------|
| `CONN_ERROR` | Connection failed | Yes | Check server URL/status |
| `TIMEOUT` | Operation timed out | Yes | Increase timeoutMs |
| `INVALID_ARGS` | Bad arguments | No | Fix arguments format |
| `SERVER_ERROR` | Target server error | Maybe | Check server logs |

### Logging Levels
```javascript
{
  "options": {
    "logging": {
      "level": "debug",  // trace, debug, info, warn, error
      "format": "json",
      "destination": "file" // console, file, both
    }
  }
}
```

## 🔍 Troubleshooting

### Common Issues

1. **Connection Errors**
   ```
   Error: Unable to connect to target server
   Solution:
   - Verify server URL and connectivity
   - Check firewall settings
   - Ensure server is running
   ```

2. **Timeout Issues**
   ```
   Error: Operation timeout
   Solution:
   - Increase timeoutMs in options
   - Check operation performance
   - Consider breaking into smaller batches
   ```

3. **Concurrency Problems**
   ```
   Error: Too many concurrent operations
   Solution:
   - Adjust maxConcurrent setting
   - Monitor server resources
   - Implement rate limiting
   ```

## 🤝 Contributing

We welcome contributions! Here's how you can help:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

Please ensure your code:
- Includes tests (Jest preferred)
- Follows existing code style
- Updates documentation
- Has clear commit messages

## 📄 License

MIT

---

<div align="center">

**[⬆ back to top](#-table-of-contents)**

</div>
