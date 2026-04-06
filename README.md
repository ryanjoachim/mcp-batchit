# MCP BatchIt

A batch execution server that lets AI agents run multiple tool calls in a single request.

## Why BatchIt?

AI agents typically work in a "one tool, one turn" loop — each tool call is a separate round-trip. This adds latency and token overhead for multi-step tasks. BatchIt lets you execute complex workflows in a single request.

**Without BatchIt:** 5 tool calls = 5 round-trips = slower execution  
**With BatchIt:** 5 tool calls = 1 request = faster execution

## What You Can Do

### Chain Results Across Operations

Instead of copying output from one tool into the next, reference it directly:

```json
{
  "operations": [
    { "id": "config", "tool": "read_file", "arguments": { "path": "/project/config.json" } },
    {
      "id": "report",
      "tool": "write_file",
      "dependsOn": ["config"],
      "arguments": {
        "path": "/project/output.txt",
        "template": "Version: {{results.config.version}}"
      }
    }
  ]
}
```

### Parallel Execution

Independent operations run concurrently. Reading 10 files in one request:

```json
{
  "operations": [
    { "id": "file1", "tool": "read_file", "arguments": { "path": "/project/src/a.js" } },
    { "id": "file2", "tool": "read_file", "arguments": { "path": "/project/src/b.js" } },
    { "id": "file3", "tool": "read_file", "arguments": { "path": "/project/src/c.js" } },
    { "id": "file4", "tool": "read_file", "arguments": { "path": "/project/src/d.js" } },
    { "id": "file5", "tool": "read_file", "arguments": { "path": "/project/src/e.js" } }
  ]
}
```

These 5 reads execute in parallel in a single batch.

### Dependency Ordering

Operations with `dependsOn` wait until their dependencies finish:

```json
{
  "operations": [
    { "id": "fetch", "tool": "read_file", "arguments": { "path": "/data/source.json" } },
    {
      "id": "process",
      "tool": "write_file",
      "dependsOn": ["fetch"],
      "arguments": {
        "path": "/data/processed.txt",
        "template": "Processed: {{uppercase results.fetch.content}}"
      }
    },
    {
      "id": "backup",
      "tool": "write_file",
      "dependsOn": ["fetch"],
      "arguments": {
        "path": "/backup/source_backup.txt",
        "content": "{{results.fetch}}"
      }
    }
  ]
}
```

`process` and `backup` both depend on `fetch`, so they run in parallel after `fetch` completes.

## Usage

You call the `batch_execute` tool with your target server and operations array.

### Internal Filesystem Example

Read multiple files, transform the content, and write a combined output:

```json
{
  "targetServer": {
    "name": "project",
    "serverType": {
      "type": "filesystem",
      "config": {
        "rootDirectory": "/path/to/project",
        "provider": "batchit-internal"
      }
    }
  },
  "operations": [
    { "id": "read_src", "tool": "read_file", "arguments": { "path": "/path/to/project/src/index.js" } },
    { "id": "read_test", "tool": "read_file", "arguments": { "path": "/path/to/project/test/index.test.js" } },
    {
      "id": "write_combined",
      "tool": "write_file",
      "dependsOn": ["read_src", "read_test"],
      "arguments": {
        "path": "/path/to/project/combined.txt",
        "template": "SOURCE:\n{{results.read_src}}\n\nTESTS:\n{{results.read_test}}"
      }
    }
  ]
}
```

### External MCP Server Example

Orchestrate calls to any MCP server (filesystem, git, memory, etc.):

```json
{
  "targetServer": {
    "name": "filesystem",
    "serverType": {
      "type": "mcp",
      "config": {
        "transport": "stdio",
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
      }
    }
  },
  "operations": [
    { "id": "list", "tool": "list_directory", "arguments": { "path": "/tmp" } },
    { "id": "read", "tool": "read_file", "dependsOn": ["list"], "arguments": { "path": "/tmp/notes.txt" } }
  ]
}
```

## Result Chaining Syntax

Reference outputs from completed operations:

| Syntax | Meaning |
|--------|---------|
| `${results.<id>}` | Full result |
| `${results.<id>.property}` | Property access |
| `${results.<id>.nested.property}` | Nested property |

In templates:

```json
{
  "arguments": {
    "path": "/output/{{results.input.filename}}",
    "template": "Data: {{uppercase results.input.content}}"
  }
}
```

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

## Internal Provider Tools

When using `provider: "batchit-internal"`:

| Tool | Description |
|------|-------------|
| `read_file` | Read file content (supports PDF/DOCX extraction) |
| `read_files` | Batch read multiple files concurrently |
| `write_file` | Create or overwrite file with optional template |
| `update_file` | Modify file with `overwrite`, `append`, or `diff` mode |
| `move_file` | Move or rename file |
| `copy_file` | Copy file or directory |
| `delete_file` | Delete file |

## Setup

```bash
npm install
npm run build
npm start
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
