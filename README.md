# MCP BatchIt

**Batch multiple MCP tool calls into a single request with built-in templating, result chaining, and an enhanced high-performance filesystem provider.**

[](https://opensource.org/licenses/MIT)

-----

## 🚀 Overview

**MCP BatchIt** is a sophisticated orchestrator for the [Model Context Protocol](https://modelcontext.ai/). While standard MCP agents typically operate in a "one tool, one turn" loop, BatchIt empowers LLMs to execute complex, multi-step execution graphs in a single round trip.

By combining a **Dependency-Aware Executor** with a **High-Performance Internal Filesystem**, BatchIt reduces latency, minimizes token usage for repetitive tasks, and adds "superpowers" like PDF/DOCX extraction and image preview generation that standard filesystem servers lack.

-----

## ✨ Key Capabilities

### 1\. Intelligent Batch Execution

* **Dependency Graphs:** Use the `dependsOn` field to define execution order. BatchIt builds a directed acyclic graph (DAG) and executes tasks as soon as their dependencies are met.
* **Parallel Processing:** Configurable `maxConcurrent` settings allow you to blast through independent operations (like reading 20 files at once) without bottlenecking.
* **Resiliency & Recovery:** Built-in exponential backoff automatically handles transient filesystem locks or network hiccups.

### 2\. Result Chaining & "Magic" Templating

Stop manually copying outputs from one tool into the arguments of the next.

* **Variable Injection:** Reference any previous output using `{{results.operationId.path.to.property}}`.
* **Handlebars Power:** Full Handlebars integration with 20+ built-in helpers:
  * **String:** `uppercase`, `lowercase`, `capitalize`, `trim`, `substring`, `replace`, `concat`
  * **Conditional:** `eq`, `ne`, `lt`, `lte`, `gt`, `gte`, `and`, `or`, `not`
  * **Date/Time:** `formatDate`, `timeAgo`, `now`
  * **Math:** `add`, `subtract`, `multiply`, `divide`, `mod`, `round`, `ceil`, `floor`
  * **Collection:** `length`, `first`, `last`, `join`, `includes`
* **Template Cache:** LRU-cached template resolution for high-performance repeated execution.
* **Custom Helpers:** Register your own helpers via `registerHelper` for domain-specific logic.
* **Dynamic Path Resolution:** Automatically resolve file paths or configuration values discovered during the batch.

### 3\. Enhanced Filesystem Provider

The `batchit-internal` provider is designed for speed and rich metadata. It’s not just a wrapper; it’s a full-featured suite.

-----

## 📂 Internal Tool Reference

| Tool | Capability | Unique "Superpowers" |
| :--- | :--- | :--- |
| `read_file` | Read text/binary | **OCR-like Extraction:** Automatically converts PDF and DOCX to clean text. Supports line numbering. |
| `read_files` | Read multiple files | **Concurrent reads:** Batch-read multiple files with parallel execution. |
| `write_file` | Create/Overwrite | **Atomic Writing:** Supports Handlebars templates and **Content Tracking** (in-memory diffs, gzip compression, extended metadata). |
| `update_file` | Patching | **Search & Replace:** Apply precise line-based edits with `overwrite`, `append`, or `diff` modes. |
| `move_file` | Move/Rename | **Cross-device support:** Uses copy+delete fallback for cross-filesystem moves. |
| `copy_file` | Copy | **Recursive copy:** Copies files and directories. |
| `delete_file` | Delete | **Simple deletion:** Removes files with validation. |

> **Note:** `search_files`, `directory_tree`, `generate_preview`, and `get_file_info` are planned for future versions.

-----

## 🛠 Workflow Examples

### Example: The "Read and Transform" Chain

This single request reads a file, transforms its content using a template, and writes the result.

```jsonc
{
  "targetServer": {
    "name": "internal-fs",
    "serverType": {
      "type": "filesystem",
      "config": { "rootDirectory": "/project", "provider": "batchit-internal" }
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
        "template": "Report Generated: {{now}}\n\nConfig Version: {{result.read_config.version}}\n\nData Rows: {{length (results.read_data)}}"
      }
    }
  ]
}
```

-----

## ⚙️ Configuration & Options

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `maxConcurrent` | `number` | `10` | Number of operations to run in parallel within a batch. |
| `stopOnError` | `boolean` | `false` | If true, fails the entire batch if a single operation errors out. |
| `timeoutMs` | `number` | `30000` | Global timeout for each operation (ms). |
| `keepAlive` | `boolean` | `false` | Maintains persistent connections to external MCP servers. |

-----

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

-----

## 🛡 Security & Constraints

* **Path Validation:** All internal filesystem operations are sandboxed to the `rootDirectory`. Efforts to escape using `../` are blocked.
* **Recursion Protection:** BatchIt includes checks to prevent it from attempting to call itself as an external transport, avoiding infinite loops.
* **Excluded Directories:** You can define `excludedDirs` (e.g., `node_modules`, `.git`) to prevent accidental heavy processing or data leaks.

-----

## 📝 License

This project is licensed under the **MIT License**. Created with ❤️ for the MCP ecosystem.
