
<div align="center">

# MCP BatchIt

**Batch multiple MCP tool calls into a single "batch_execute" request—reducing overhead and token usage for AI agents.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

</div>

---

## Table of Contents

1. [Introduction](#introduction)
2. [Why Use BatchIt](#why-use-batchit)
3. [Key Features & Limitations](#key-features--limitations)
4. [Installation & Startup](#installation--startup)
5. [Multi-Phase Usage](#multi-phase-usage)
   - [Implementation Phases](#implementation-phases)
     - [Information Gathering](#information-gathering)
     - [LLM‐Only Step (List Code Definitions)](#llm-only-step-list-code-definitions)
     - [Document Creation](#document-creation)
6. [FAQ](#faq)
7. [License](#license)

---

## Introduction
> ⚠️ **NOTICE: Work in Progress**
>
> This project is actively being developed to address several complex challenges:
> - Maintaining backwards compatibility with existing MCP servers
> - Resolving transport complexities with multi-connection clients (Cline, Roo, Claude Desktop)
> - Creating a beginner-friendly implementation
>
> While functional, expect ongoing improvements and changes as we refine the solution.

**MCP BatchIt** is a simple aggregator server in the [Model Context Protocol (MCP)](https://modelcontext.ai/) ecosystem. It exposes just **one** tool: **`batch_execute`**. Rather than calling multiple MCP tools (like `fetch`, `read_file`, `create_directory`, `write_file`, etc.) in **separate** messages, you can **batch** them together in one aggregator request.

This dramatically reduces token usage, network overhead, and repeated context in your AI agent or LLM conversation.

---

## Why Use BatchIt

- **One Action per Message** Problem:
  Normally, an LLM or AI agent can only call a single MCP tool at a time, forcing multiple calls for multi-step tasks.

- **Excessive Round Trips**:
  10 separate file operations might require 10 messages → 10 responses.

- **BatchIt’s Approach**:
  1. Takes a single `batch_execute` request.
  2. Spawns (or connects to) the actual target MCP server (like a filesystem server) behind the scenes.
  3. Runs each sub-operation (tool call) in parallel up to `maxConcurrent`.
  4. If one sub-op fails and `stopOnError` is true, it halts new sub-ops.
  5. Returns one consolidated JSON result.

---

## Key Features & Limitations

### Features

1. **Single “Batch Execute” Tool**
   - You simply specify a list of sub‐ops referencing your existing MCP server’s tools.

2. **Parallel Execution**
   - Run multiple sub-ops at once, controlled by `maxConcurrent`.

3. **Timeout & Stop on Error**
   - Each sub-op races a `timeoutMs`, and you can skip remaining ops if one fails.

4. **Connection Caching**
   - Reuses the same connection to the downstream MCP server for repeated calls, closing after an idle timeout.

### Limitations

1. **No Data Passing Mid-Batch**
   - If sub-op #2 depends on #1’s output, do multiple aggregator calls.
2. **No Partial Progress**
   - You get all sub-ops’ results together at the end of each “batch_execute.”
3. **Must Use a Real MCP Server**
   - If you spawn or connect to the aggregator itself, you’ll see “tool not found.” The aggregator only has “batch_execute.”
4. **One Target Server per Call**
   - Each aggregator call references a single target MCP server. If you want multiple servers, you’d do more advanced logic or separate calls.

---

## Installation & Startup

```bash
git clone https://github.com/ryanjoachim/mcp-batchit.git
cd mcp-batchit
npm install
npm run build
npm start
```

BatchIt starts on **STDIO** by default so your AI agent (or any MCP client) can spawn it. For example:

```
mcp-batchit is running on stdio. Ready to batch-execute!
```

You can now send JSON-RPC requests (`tools/call` method, `name= "batch_execute"`) to it.

---

## MEMORY BANK

Using Cline/Roo Code, you can build a framework of contextual project documentation by leveraging the powerful "Memory Bank" custom instructions developed by Nick Baumann.

[View Memory Bank Documentation](https://github.com/nickbaumann98/cline_docs/blob/main/prompting/custom%20instructions%20library/cline-memory-bank.md)

#### Traditional Approach (19+ calls):

1. Read package.json
2. Wait for response
3. Read README.md
4. Wait for response
5. List code definitions
6. Wait for response
7. Create memory-bank directory
8. Wait for response
9. Write productContext.md
10. Write systemPatterns.md
11. Write techContext.md
12. Write progress.md
13. Write activeContext.md
14. Wait for responses (5 more calls)

Total: ~19 separate API calls (13 operations + 6 response waits)

#### BatchIt Approach (1-3 calls)

### Multi-Phase Usage

When working with complex multi-step tasks that depend on real-time output (such as reading files and generating documentation), you'll need to handle the process in distinct phases. This is necessary because **BatchIt** doesn't support data passing between sub-operations within the same request.

### Implementation Phases

#### Information Gathering

In this initial phase, we gather information from the filesystem by reading necessary files (e.g., `package.json`, `README.md`). This is accomplished through a **batch_execute** call to the filesystem MCP server:

```jsonc
{
  "targetServer": {
    "name": "filesystem",
    "serverType": {
      "type": "filesystem",
      "config": {
        "rootDirectory": "C:/Users/Chewy/Documents/GitHub/ryanjoachim/mcp-batchit"
      }
    },
    "transport": {
      "type": "stdio",
      "command": "cmd.exe",
      "args": [
        "/c",
        "npx",
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "C:/Users/Chewy/Documents/GitHub/ryanjoachim/mcp-batchit"
      ]
    }
  },
  "operations": [
    {
      "tool": "read_file",
      "arguments": {
        "path": "C:/Users/Chewy/Documents/GitHub/ryanjoachim/mcp-batchit/package.json"
      }
    },
    {
      "tool": "read_file",
      "arguments": {
        "path": "C:/Users/Chewy/Documents/GitHub/ryanjoachim/mcp-batchit/README.md"
      }
    }
  ],
  "options": {
    "maxConcurrent": 2,
    "stopOnError": true,
    "timeoutMs": 30000
  }
}
```

**Note**: The aggregator spawns `@modelcontextprotocol/server-filesystem` (via `npx`) to execute parallel `read_file` operations.

#### LLM‐Only Step (List Code Definitions)

This phase involves processing outside the aggregator, typically using LLM or AI agent capabilities:

```typescript
<list_code_definition_names>
<path>src</path>
</list_code_definition_names>
```

This step utilizes Roo Code's `list_code_definition_names` tool, which is exclusively available to LLMs. However, note that many MCP servers can provide similar functionality, making it possible to complete this process without LLM requests.

#### Document Creation

The final phase combines data from previous steps (file contents and code definitions) to generate documentation in the `memory-bank` directory:

```jsonc
{
  "targetServer": {
    "name": "filesystem",
    "serverType": {
      "type": "filesystem",
      "config": {
        "rootDirectory": "C:/Users/Chewy/Documents/GitHub/ryanjoachim/mcp-batchit"
      }
    },
    "transport": {
      "type": "stdio",
      "command": "cmd.exe",
      "args": [
        "/c",
        "npx",
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "C:/Users/Chewy/Documents/GitHub/ryanjoachim/mcp-batchit"
      ]
    }
  },
  "operations": [
    {
      "tool": "create_directory",
      "arguments": {
        "path": "C:/Users/Chewy/Documents/GitHub/ryanjoachim/mcp-batchit/memory-bank"
      }
    },
    {
      "tool": "write_file",
      "arguments": {
        "path": "C:/Users/Chewy/Documents/GitHub/ryanjoachim/mcp-batchit/memory-bank/productContext.md",
        "content": "# MCP BatchIt Product Context\\n\\n## Purpose\\n..."
      }
    },
    {
      "tool": "write_file",
      "arguments": {
        "path": "C:/Users/Chewy/Documents/GitHub/ryanjoachim/mcp-batchit/memory-bank/systemPatterns.md",
        "content": "# MCP BatchIt System Patterns\\n\\n## Architecture Overview\\n..."
      }
    },
    {
      "tool": "write_file",
      "arguments": {
        "path": "C:/Users/Chewy/Documents/GitHub/ryanjoachim/mcp-batchit/memory-bank/techContext.md",
        "content": "# MCP BatchIt Technical Context\\n\\n## Technology Stack\\n..."
      }
    },
    {
      "tool": "write_file",
      "arguments": {
        "path": "C:/Users/Chewy/Documents/GitHub/ryanjoachim/mcp-batchit/memory-bank/progress.md",
        "content": "# MCP BatchIt Progress Status\\n\\n## Completed Features\\n..."
      }
    },
    {
      "tool": "write_file",
      "arguments": {
        "path": "C:/Users/Chewy/Documents/GitHub/ryanjoachim/mcp-batchit/memory-bank/activeContext.md",
        "content": "# MCP BatchIt Active Context\\n\\n## Current Status\\n..."
      }
    }
  ],
  "options": {
    "maxConcurrent": 1,
    "stopOnError": true,
    "timeoutMs": 30000
  }
}
```

The aggregator processes these operations sequentially (`maxConcurrent=1`), creating the directory and writing multiple documentation files. The result array indicates the success/failure status of each operation.

---

## FAQ

**Q1: Do I need multiple aggregator calls if sub-op #2 depends on sub-op #1’s results?**
**Yes.** BatchIt doesn’t pass data between sub-ops in the same request. You do multi-phase calls (like the example above).

**Q2: Why do I get “Tool create_directory not found” sometimes?**
Because your `transport` might be pointing to the aggregator script itself instead of the real MCP server. Make sure you reference something like `@modelcontextprotocol/server-filesystem`.

**Q3: Can I do concurrency plus stopOnError?**
Absolutely. If a sub-op fails, we skip launching new sub-ops. Already-running ones finish in parallel.

**Q4: Does BatchIt re-spawn the target server each time?**
It *can* if you specify `keepAlive: false`. But if you use the same exact `targetServer.name + transport`, it caches the connection until an idle timeout passes.

**Q5: Are partial results returned if an error occurs in the middle?**
Yes. Each sub-op that finished prior to the error is included in the final aggregator response, along with the failing sub-op. Remaining sub-ops are skipped if `stopOnError` is true.

---

## License

**MIT**
