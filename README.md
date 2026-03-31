
# MCP BatchIt

**Batch multiple MCP tool calls into a single request with built-in templating, result chaining, and an enhanced filesystem provider.**

[](https://opensource.org/licenses/MIT)

-----

## 🚀 Overview

**MCP BatchIt** is an advanced aggregator for the [Model Context Protocol](https://modelcontext.ai/). While standard MCP agents are often limited to one tool call per turn, BatchIt allows you to execute complex, multi-step workflows in a single round trip.

It features a **built-in high-performance Filesystem Provider**, removing the need to spawn external filesystem servers for common tasks while adding "superpowers" like PDF/DOCX extraction and image previews.

-----

## ✨ Key Capabilities

### 1\. Advanced Batch Execution

  * **Dependency Management:** Use the `dependsOn` field to create execution graphs. BatchIt automatically calculates the correct order of operations.
  * **Parallel Processing:** Control throughput with `maxConcurrent` to speed up independent tasks.
  * **Resiliency:** Built-in exponential backoff recovery for transient failures.

### 2\. Result Chaining & Templating

BatchIt allows data to flow seamlessly between steps in a single batch:

  * **Variable Injection:** Reference results from previous operations using `{{results.stepId.property}}` syntax.
  * **Handlebars Engine:** Full support for templates, including helpers like `{{now}}`, `{{json}}`, and `{{parseJson}}`.
  * **Dynamic Arguments:** Resolve file paths or content dynamically based on the output of earlier search or read operations.

-----

## 📂 Built-in Filesystem Provider

The server includes a native filesystem provider (`batchit-internal`) that provides enhanced functionality beyond standard implementations:

| Tool | Description | Key Features |
| :--- | :--- | :--- |
| `read_file` | Reads file content | Supports line numbers and automatic **PDF/DOCX** text extraction. |
| `write_file` | Writes file content | Supports Handlebars templates and optional **content tracking** (diffs, size, MIME). |
| `search_files` | Advanced file search | Supports Glob/Regex with content previews and context lines. |
| `directory_tree` | Visualizes structure | Generates JSON or text-based tree representations with metadata. |
| `edit_file` | Line-based patching | Apply precise text edits with dry-run support and diff generation. |
| `get_file_info` | Metadata retrieval | Returns detailed stats, permissions, and MIME types. |
| `generate_preview`| Image processing | Creates cached thumbnails/previews for JPEG, PNG, and WebP images. |

-----

## 🛠 Usage Example

### Chained Internal Filesystem Operations

This example searches for a configuration file and uses its path to perform a read, all in one request.

```jsonc
{
  "targetServer": {
    "name": "internal-fs",
    "serverType": {
      "type": "filesystem",
      "config": {
        "rootDirectory": "/app/project",
        "provider": "batchit-internal"
      }
    }
  },
  "operations": [
    {
      "id": "find_config",
      "tool": "search_files",
      "arguments": { "pattern": "**/config.json" }
    },
    {
      "id": "read_config",
      "tool": "read_file",
      "dependsOn": "find_config",
      "arguments": {
        "path": "{{results.find_config.[0].path}}"
      }
    }
  ]
}
```

-----

## ⚙️ Configuration Options

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `maxConcurrent` | `number` | `1` | Max operations to run simultaneously. |
| `stopOnError` | `boolean` | `true` | Halts subsequent operations if one fails. |
| `timeoutMs` | `number` | `30000` | Timeout per individual operation. |
| `keepAlive` | `boolean` | `true` | Caches external MCP server connections to reduce overhead. |

-----

## 📦 Installation

```bash
git clone https://github.com/ryanjoachim/mcp-batchit.git
cd mcp-batchit
npm install
npm run build
npm start
```

-----

## 📝 License

This project is licensed under the **MIT License**.
