# MCP BatchIt

A high-performance MCP filesystem server with batch execution capabilities.

## What It Does

- **12 individual filesystem tools** — `read_file`, `write_file`, `update_file`, and more, each with proper tool annotations so agents know which are safe vs destructive
- **Batch execution** — Run multi-step workflows with dependency ordering and result chaining in a single `batch_execute` call
- **External MCP proxy** — Connect to and orchestrate calls to other MCP servers via stdio, WebSocket, or StreamableHTTP transport

## Why BatchIt?

The real value is **dependency ordering and result chaining**:

- **Dependency ordering**: Define which operations must complete before others start. Independent operations run in parallel.
- **Result chaining**: Reference prior operation outputs with `${results.id}` syntax. No manual copy-paste between tool calls.

For example: read a config, transform it, and write the result — all in one request with automatic data flow.

## Individual Tools

For simple, single-step operations, call any tool directly:

| Tool | Description | Annotations |
|------|-------------|-------------|
| `read_file` | Read file content (supports PDF/DOCX extraction) | Read-only, idempotent |
| `read_files` | Batch read multiple files concurrently | Read-only, idempotent |
| `write_file` | Create or overwrite a file | Destructive |
| `update_file` | Modify file with `overwrite`, `append`, or `diff` mode | Destructive |
| `move_file` | Move or rename file | Destructive, idempotent |
| `copy_file` | Copy a file | Idempotent |
| `delete_file` | Delete a file | Destructive |
| `list_directory` | List directory contents | Read-only, idempotent |
| `create_directory` | Create directories (including parents) | Idempotent |
| `search_files` | Search files by glob, regex, or content | Read-only, idempotent |
| `get_file_info` | Get file/directory metadata (size, dates, permissions) | Read-only, idempotent |
| `directory_tree` | Get recursive directory tree (JSON or text) | Read-only, idempotent |

## Batch Execution

For multi-step workflows, use `batch_execute`. Operations can reference each other's results and declare dependencies.

### Dependency Ordering

Operations with `dependsOn` wait until their dependencies finish. Independent operations run in parallel:

```json
{
  "targetServer": {
    "name": "project",
    "serverType": { "type": "filesystem", "config": { "rootDirectory": "/project", "provider": "batchit-internal" } }
  },
  "operations": [
    { "id": "fetch", "tool": "read_file", "arguments": { "path": "/project/config.json" } },
    { "id": "transform", "tool": "write_file", "dependsOn": ["fetch"], "arguments": {
      "path": "/project/output.txt",
      "template": "Config: {{json results.fetch}}"
    }},
    { "id": "backup", "tool": "copy_file", "dependsOn": ["fetch"], "arguments": {
      "sourcePath": "/project/config.json", "destPath": "/project/config.bak"
    }}
  ],
  "options": { "maxConcurrent": 10, "timeoutMs": 30000, "stopOnError": false, "keepAlive": false }
}
```

`transform` and `backup` both depend on `fetch`, so they run in parallel after `fetch` completes.

### External MCP Server Example

Orchestrate calls to any MCP server:

```json
{
  "targetServer": {
    "name": "filesystem",
    "serverType": { "type": "filesystem", "config": { "rootDirectory": "/tmp", "provider": "external" } },
    "transport": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
    }
  },
  "operations": [
    { "id": "list", "tool": "list_directory", "arguments": { "path": "/tmp" } },
    { "id": "read", "tool": "read_file", "dependsOn": ["list"], "arguments": { "path": "/tmp/notes.txt" } }
  ],
  "options": { "maxConcurrent": 10, "timeoutMs": 30000 }
}
```

StreamableHTTP transport is also supported:

```json
{
  "transport": {
    "type": "streamable-http",
    "url": "http://localhost:8080/mcp"
  }
}
```

## Result Chaining Syntax

Two syntaxes for referencing operation results in `batch_execute`:

**`${results.<id>}`** — Result references (resolved first, works in any argument value):

| Syntax | Meaning |
|--------|---------|
| `${results.<id>}` | Full result |
| `${results.<id>.property}` | Property access |
| `${results.<id>.nested.property}` | Nested property |

**`{{helper value}}`** — Handlebars templates (resolved second, only in `template` argument):

```json
{
  "arguments": {
    "path": "/output/file.txt",
    "template": "Data: {{uppercase results.input.content}}"
  }
}
```

Use `{{json value}}` to serialize objects and `{{parseJson string}}` to parse JSON strings.

## Template Helpers

Built-in Handlebars helpers for manipulating values in templates:

| Category | Helpers |
|----------|---------|
| String | `uppercase`, `lowercase`, `capitalize`, `trim`, `substring`, `replace`, `concat` |
| Conditional | `eq`, `ne`, `lt`, `lte`, `gt`, `gte`, `and`, `or`, `not` |
| Date/Time | `formatDate`, `timeAgo`, `now` |
| Math | `add`, `subtract`, `multiply`, `divide`, `mod`, `round`, `ceil`, `floor` |
| Collection | `length`, `first`, `last`, `join`, `includes` |
| JSON | `{{json value}}`, `{{parseJson string}}` |

## Configuration

| Option | Default | Description |
|--------|---------|-------------|
| `maxConcurrent` | 10 | Max parallel operations per dependency layer |
| `timeoutMs` | 30000 | Per-operation timeout |
| `stopOnError` | false | Stop batch on first failure |
| `keepAlive` | false | Keep connection open after batch |

## Setup

```bash
npm install
npm run build
node build/index.js
```

Add to Claude Desktop (`claude_desktop_config.json`):

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

## License

MIT