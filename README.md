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
* **Handlebars Power:** Full Handlebars integration allows for complex logic, including helpers like `{{now}}`, `{{json}}`, and `{{parseJson}}`.
* **Dynamic Path Resolution:** Automatically resolve file paths or configuration values discovered during the batch.

### 3\. Enhanced Filesystem Provider

The `batchit-internal` provider is designed for speed and rich metadata. It’s not just a wrapper; it’s a full-featured suite.

-----

## 📂 Internal Tool Reference

| Tool | Capability | Unique "Superpowers" |
| :--- | :--- | :--- |
| `read_file` | Read text/binary | **OCR-like Extraction:** Automatically converts PDF and DOCX to clean text. Supports line numbering. |
| `write_file` | Create/Overwrite | **Atomic Writing:** Supports Handlebars templates and **Content Tracking** (generates diffs, size stats, and MIME types). |
| `edit_file` | Patching | **Search & Replace:** Apply precise line-based edits with `dryRun` support and visual diff generation. |
| `search_files` | Search | **Contextual Grep:** Supports Glob/Regex with content previews and surrounding context lines. |
| `directory_tree` | Visualization | Generates JSON or "tree-view" text structures with file sizes and modification dates. |
| `generate_preview`| Image Processing | Generates cached thumbnails for JPEG, PNG, and WebP via `sharp`. |
| `get_file_info` | Metadata | Deep inspection including permissions, exact MIME types, and timestamps. |

-----

## 🛠 Workflow Examples

### Example: The "Analyze and Document" Chain

This single request finds a specific source file, reads it (extracting text if it's a doc), and generates a summary file using a template.

```jsonc
{
  "targetServer": {
    "name": "internal-fs",
    "serverType": {
      "type": "filesystem",
      "config": { "rootDirectory": "/src/project", "provider": "batchit-internal" }
    }
  },
  "operations": [
    {
      "id": "find_logic",
      "tool": "search_files",
      "arguments": { "pattern": "**/core_logic.ts" }
    },
    {
      "id": "read_src",
      "tool": "read_file",
      "dependsOn": "find_logic",
      "arguments": { "path": "{{results.find_logic.[0].path}}" }
    },
    {
      "id": "generate_docs",
      "tool": "write_file",
      "dependsOn": "read_src",
      "arguments": {
        "path": "docs/analysis.md",
        "template": "# Analysis of {{results.find_logic.[0].path}}\n\nGenerated: {{now}}\n\nContent Summary:\n{{results.read_src}}"
      }
    }
  ]
}
```

-----

## ⚙️ Configuration & Options

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `maxConcurrent` | `number` | `1` | Number of operations to run in parallel within a batch. |
| `stopOnError` | `boolean` | `true` | If true, fails the entire batch if a single operation errors out. |
| `timeoutMs` | `number` | `30000` | Global timeout for the batch execution. |
| `keepAlive` | `boolean` | `true` | Maintains persistent connections to external MCP servers. |

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

3. **Build & Start:**

    ```bash
    npm run build
    npm start
    ```

### Integration with Claude Desktop

Add this to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "batchit": {
      "command": "node",
      "args": ["/path/to/mcp-batchit/build/index.js"],
      "env": {
        "NODE_ENV": "dev"
      }
    }
  }
}
```

-----

## 🛡 Security & Constraints

* **Path Validation:** All internal filesystem operations are sandboxed to the `rootDirectory`. Efforts to escape using `../` are blocked.
* **Recursion Protection:** BatchIt includes checks to prevent it from attempting to call itself as an external transport, avoiding infinite loops.
* **Excluded Directories:** You can define `excludedDirs` (e.g., `node_modules`, `.git`) to prevent accidental heavy processing or data leaks.

-----

## 📝 License

This project is licensed under the **MIT License**. Created with ❤️ for the MCP ecosystem.
