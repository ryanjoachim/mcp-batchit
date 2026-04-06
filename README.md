# MCP BatchIt

Batch multiple MCP tool calls into a single request with built-in templating, result chaining, dependency-aware execution, and a high-performance internal filesystem provider.

![License](https://img.shields.io/badge/license-MIT-blue.svg)

---

## 🚀 Overview

**MCP BatchIt** is a sophisticated orchestrator for the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/). While standard MCP agents typically operate in a "one tool, one turn" loop, BatchIt empowers LLMs to execute complex, multi-step execution graphs in a single round trip.

By combining a **Dependency-Aware Executor** with a **High-Performance Internal Filesystem**, BatchIt reduces latency, minimizes token usage for repetitive tasks, and adds "superpowers" like PDF/DOCX extraction and image preview generation that standard filesystem servers lack.

### How It Works

```
┌─────────────────────────────────────────────────────────────────────┐
│                            Single Batch Request                       │
├─────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐          │
│  │   Operation 1│    │   Operation 2│    │   Operation 3│          │
│  │   (No deps)  │───▶│ (No deps)   │    │ (deps on 1,2) │          │
│  └──────────────┘    └──────────────┘    └──────────────┘          │
│          │                │                  │                       │
│          └────────────────┼──────────────────┘                      │
│                           ▼                                          │
│                 ┌──────────────────┐                                 │
│                 │ Parallel Exec    │                                 │
│                 │ (up to 10 ops)   │                                 │
│                 └──────────────────┘                                 │
└─────────────────────────────────────────────────────────────────────┘
```

---

## ✨ Key Capabilities

### 1. 🧠 Intelligent Batch Execution

* **Dependency Graphs:** Use the `dependsOn` field to define execution order. BatchIt builds a directed acyclic graph (DAG) and executes tasks as soon as their dependencies are met.
* **Parallel Processing:** Configurable `maxConcurrent` settings allow you to blast through independent operations (like reading 20 files at once) without bottlenecking.
* **Resiliency & Recovery:** Built-in exponential backoff automatically handles transient filesystem locks or network hiccups.
* **Cancellation Support:** Respect MCP `notifications/cancelled` for graceful operation interruption.

### 2. 🔗 Result Chaining & "Magic" Templating

Stop manually copying outputs from one tool into the arguments of the next.

* **Variable Injection:** Reference any previous output using `${results.<operationId>.path.to.property}` syntax.
* **Handlebars Power:** Full Handlebars integration with 20+ built-in helpers (see [Template Helpers](#-template-helpers) below).
* **Template Cache:** LRU-cached template resolution for high-performance repeated execution.
* **Custom Helpers:** Register your own helpers via `registerHelper` for domain-specific logic.
* **Dynamic Path Resolution:** Automatically resolve file paths or configuration values discovered during the batch.

### 3. 📁 Enhanced Filesystem Provider

The `batchit-internal` provider is designed for speed and rich metadata. It's not just a wrapper; it's a full-featured suite.

* **Atomic Writes:** `write_file` uses rename-on-complete for safe concurrent writes.
* **Content Tracking:** In-memory diff tracking and gzip compression for large file changes.
* **Type-Aware Reads:** Automatic content-type detection for PDF, DOCX, Markdown, and more.
* **Exclusion Support:** Define `excludedDirs` to sandbox sensitive directories (`node_modules`, `.git`, etc.).

---

## 📂 Internal Tool Reference

| Tool | Capability | Unique "Superpowers" |
|:------|:-----------|:---------------------|
| `read_file` | Read text/binary | **OCR-like Extraction:** Automatically converts PDF and DOCX to clean text. Supports line numbering and charset detection. |
| `read_files` | Read multiple files | **Concurrent reads:** Batch-read multiple files with parallel execution. |
| `write_file` | Create/Overwrite | **Atomic Writing:** Supports Handlebars templates and **Content Tracking** (in-memory diffs, gzip compression, extended metadata). |
| `update_file` | Patching | **Search & Replace:** Apply precise line-based edits with `overwrite`, `append`, or `diff` modes. |
| `move_file` | Move/Rename | **Cross-device support:** Uses copy+delete fallback for cross-filesystem moves. |
| `copy_file` | Copy | **Recursive copy:** Copies files and directories. |
| `delete_file` | Delete | **Simple deletion:** Removes files with validation. |

### Additional Planned Tools

> **Note:** The following tools are planned for future versions and are not yet available:
>
> * `search_files` - Regex search across files
> * `directory_tree` - Generate directory listings
> * `generate_preview` - Generate file previews (image thumbnails, etc.)
> * `get_file_info` - Metadata and file info queries

---

## 🛠 Workflow Examples

### Example 1: The "Read and Transform" Chain

This single request reads a config and data file, transforms their content using a template, and writes the result.

```json
{
  "targetServer": {
    "name": "internal-fs",
    "serverType": {
      "type": "filesystem",
      "config": {
        "rootDirectory": "/project",
        "provider": "batchit-internal"
      }
    }
  },
  "operations": [
    {
      "id": "read_config",
      "tool": "read_file",
      "arguments": { "path": "/project/config.json" }
    },
    {
      "id": "read_data",
      "tool": "read_file",
      "arguments": { "path": "/project/data.csv" }
    },
    {
      "id": "generate_report",
      "tool": "write_file",
      "dependsOn": ["read_config", "read_data"],
      "arguments": {
        "path": "/project/report.txt",
        "template": "Report Generated: {{now}}\n\nConfig Version: {{results.read_config.version}}\n\nData Rows: {{length results.read_data}}"
      }
    }
  ]
}
```

### Example 2: File Monitoring Pipeline

Watch a directory and generate alerts when new files appear.

```json
{
  "targetServer": {
    "name": "internal-fs",
    "serverType": {
      "type": "filesystem",
      "config": {
        "rootDirectory": "/logs",
        "provider": "batchit-internal"
      }
    }
  },
  "operations": [
    {
      "id": "scan_logs",
      "tool": "directory_tree",
      "arguments": { "path": "/logs", "filter": "*.log" }
    },
    {
      "id": "read_error",
      "tool": "read_file",
      "dependsOn": ["scan_logs"],
      "arguments": {
        "path": "{{results.scan_logs.newFiles[0].path}}"
      }
    },
    {
      "id": "write_alert",
      "tool": "write_file",
      "dependsOn": ["read_error"],
      "arguments": {
        "path": "/alerts/error_{{now}}.txt",
        "template": "ALERT: New log detected\nSource: {{results.read_error.path}}\nTimestamp: {{now}}\nContent:\n{{results.read_error.content}}"
      }
    }
  ]
}
```

### Example 3: Data Transformation Pipeline

Transform a CSV file, apply business logic, and write results.

```json
{
  "targetServer": {
    "name": "internal-fs",
    "serverType": {
      "type": "filesystem",
      "config": {
        "rootDirectory": "/data",
        "provider": "batchit-internal"
      }
    }
  },
  "operations": [
    {
      "id": "load_config",
      "tool": "read_file",
      "arguments": { "path": "/data/rules.json" }
    },
    {
      "id": "load_data",
      "tool": "read_file",
      "arguments": { "path": "/data/transactions.csv" }
    },
    {
      "id": "apply_rules",
      "tool": "write_file",
      "dependsOn": ["load_config", "load_data"],
      "arguments": {
        "path": "/data/flagged.json",
        "template": "{{#each results.load_data.splitLines}}\n{{this}}\n{{/each}}"
      }
    }
  ]
}
```

---

## ⚙️ Configuration & Options

| Option | Type | Default | Description |
|:------|:-----|:--------|:------------|
| `maxConcurrent` | `number` | `10` | Number of operations to run in parallel within a batch. |
| `stopOnError` | `boolean` | `false` | If true, fails the entire batch if a single operation errors out. |
| `timeoutMs` | `number` | `30000` | Global timeout for each operation (ms). |
| `keepAlive` | `boolean` | `false` | Maintains persistent connections to external MCP servers. |
| `rootDirectory` | `string` | `cwd` | Root directory for internal filesystem operations (sandbox boundary). |
| `excludedDirs` | `string[]` | `[]` | Directory patterns to exclude from operations (e.g., `["node_modules", ".git"]`). |

---

## 🧰 Template Helpers

Built-in Handlebars helpers for powerful text manipulation:

### String Operations

* `uppercase`, `lowercase`, `capitalize`, `trim`
* `substring(start, end)`, `replace(from, to)`, `concat(str)`

### Conditional Logic

* `eq`, `ne`, `lt`, `lte`, `gt`, `gte`
* `and(bool1, bool2)`, `or(bool1, bool2)`, `not(bool)`

### Date/Time

* `formatDate(date, format)`, `timeAgo(date)`, `now`

### Math

* `add(a, b)`, `subtract(a, b)`, `multiply(a, b)`, `divide(a, b)`
* `mod(a, b)`, `round(num)`, `ceil(num)`, `floor(num)`

### Collection

* `length(array)`, `first(array)`, `last(array)`, `join(array, delim)`, `includes(array, item)`

### Custom Helper Registration

Register your own helpers:

```json
{
  "operations": [
    {
      "id": "setup_helper",
      "tool": "registerHelper",
      "arguments": {
        "name": "formatCurrency",
        "fn": "{{value}} | add .{{number 2}}"
      }
    }
  ]
}
```

---

## 📦 Installation

1. **Clone the Repository:**

    ```bash
    git clone https://github.com/ryanjoachim/mcp-batchit.git
    cd mcp-batchit
    ```

2. **Install Dependencies:**

    ```bash
    npm install
    ```

3. **Build:**

    ```bash
    npm run build
    ```

4. **Start (runs on stdio):**

    ```bash
    npm start
    ```

### Integration with Claude Desktop

Add this to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "batchit": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/mcp-batchit/build/index.js"]
    }
  }
}
```

> **Important:** Use an absolute path to the built `index.js` file.

### Available npm Scripts

| Script | Description |
|:-------|:------------|
| `npm run build` | Compile TypeScript to JavaScript |
| `npm run build:clean` | Clean and rebuild |
| `npm run test` | Run Jest test suite |
| `npm run validate` | Run tests and lint checks |
| `npm run lint` | Format code with Prettier |
| `npm run check:types` | Check TypeScript types |

---

## 🛡 Security & Constraints

* **Path Validation:** All internal filesystem operations are sandboxed to the `rootDirectory`. Efforts to escape using `../` are blocked.
* **Recursion Protection:** BatchIt includes checks to prevent it from attempting to call itself as an external transport, avoiding infinite loops.
* **Excluded Directories:** You can define `excludedDirs` (e.g., `node_modules`, `.git`) to prevent accidental heavy processing or data leaks.
* **Connection Limits:** Each server identity maintains a single persistent connection; additional requests reuse existing connections.
* **Idle Timeout:** Connections automatically close after 5 minutes of inactivity (configurable via `maxIdleTimeMs`).

---

## 🔍 Architecture

### Connection Management

BatchIt uses a connection manager to maintain persistent connections to external MCP servers and manage the internal filesystem provider.

* **Connection Pooling:** One connection per server identity (name + type + transport)
* **Idle Timeout:** Connections close automatically after 5 minutes of inactivity
* **Graceful Shutdown:** All connections close cleanly on `SIGINT`/`SIGTERM`

### Result Caching

* **LRU Cache:** Templates are cached to avoid repeated compilation
* **Result Cache:** Operation results are stored for quick result resolution
* **Template Cache:** High-performance repeated execution of the same templates

---

## 📝 License

This project is licensed under the **MIT License**. Created with ❤️ for the MCP ecosystem.
