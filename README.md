<div align="center">

# MCP BatchIt

**Batch multiple MCP tool calls into a single "batch_execute" request—reducing overhead and token usage for AI agents.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

</div>

## Table of Contents

- [Overview](#overview)
- [Why "One Action per Message" Is a Problem](#why-one-action-per-message-is-a-problem)
- [How MCP BatchIt Solves It](#how-mcp-batchit-solves-it)
- [Features & Limitations](#features--limitations)
- [Installation](#installation)
- [Usage Example (Filesystem Workflow)](#usage-example-filesystem-workflow)
- [FAQ / Notes](#faq--notes)
- [License](#license)

---

## Overview
> ⚠️ **NOTICE: Work in Progress**
>
> This project is actively being developed to address several complex challenges:
> - Maintaining backwards compatibility with existing MCP servers
> - Resolving transport complexities with multi-connection clients (Cline, Roo, Claude Desktop)
> - Creating a beginner-friendly implementation
>
> While functional, expect ongoing improvements and changes as we refine the solution.



In the **Model Context Protocol (MCP)** world, we have specialized servers (e.g., a "filesystem" MCP server) that provide **tools** like `"search_files"`, `"read_multiple_files"`, `"write_file"`, etc. Typically an LLM or AI agent must either utilize internal versions of these tools, or **call** these MCP tools, **one at a time**, in a multi-step conversation:

1. Agent calls "`search_files`".
2. Agent sends results to LLM.
3. Wait for LLM response.
4. Agent calls "`read_file`".
5. Agent sends results to LLM.
6. Wait for LLM response.
7. Agent calls "`write_file`"… and so on.

**MCP BatchIt** eliminates that overhead by letting the agent send **one** "`batch_execute`" request, which in turn calls **all** those underlying MCP tools (like "search_files", "edit_file", "directory_tree", etc.) behind the scenes. This drastically **reduces** round‐trips, saving time and tokens, while still using the **existing** MCP server tools.

---

## Why "One Action per Message" Is a Problem

Many AI agents (e.g., Cline, Roo, Claude Desktop) enforce:
1. **One** tool call per message
2. Each step must see the previous step's result
3. Large tasks require **many** calls. So, so many...

**Result**:
- **Excessive Overhead**: e.g. 12 file operations become ~12 separate tool calls (plus ~12 response messages per tool result, resulting in an exponential context expansion).
- **Token/Context Bloat**: Re-explaining the same project or file context.
- **COST per API request**: Each subsequent API request increases the number of tokens being sent.
- **Slower**: Each call waits for a response before the next.

---

## How MCP BatchIt Solves It

`mcp-batchit` addresses this overhead by letting the LLM (or agent) **batch** multiple sub-operations into **one** request. For instance:

- **Batch Execution**
  - You can group many sub-steps (like multiple reads, writes, or searches) into **one** MCP request.
- **Reduced Token Usage**
  - Because you only send **one** message containing all the sub-operations, you use **far** fewer tokens explaining each step.
- **Parallel / Concurrent Operations**
  - `maxConcurrent` can run sub‐operations in parallel, so the aggregator can speed up big tasks.
- **Works with Existing Tools**
  - The aggregator doesn't replace your filesystem or database servers; it simply calls them behind the scenes.
  - The LLM/Agent only sees **one** "tool call": `batch_execute`.

In short, **BatchIt** **doesn't** do advanced chaining or pass outputs automatically from step to step (YET!). But it **does** eliminate many round trips and merges them into a single request.

---

## Features & Limitations

### ✅ Features

1. **Single Tool: `batch_execute`**
   - One aggregator entry point.
   - Receives an array of sub-operations, each referencing the actual "tool" name on the downstream MCP server (like `read_file`, `write_file`, etc.).

2. **Concurrency Control**
   - `maxConcurrent`: how many sub-operations to run at once.
   - `timeoutMs`: per-operation timeout.
   - `stopOnError`: if one sub-operation fails, skip the rest.

3. **Caching Connections**
   - Reuses connections to the target server (via **WebSocket** or **STDIO**).
   - Closes them after 5 minutes idle by default.

4. **Reduced Round-Trips**
   - Instead of many separate calls, you do fewer aggregator calls with multiple steps each.

### ❌ Limitations (In Progress!)

- **No Automatic Data-Passing**
  - Doesn't feed the output of sub-operation #1 as input to #2. You must plan or chunk them manually if needed.
- **No Partial Progress**
  - Currently, everything returns in one shot. No incremental progress is built in.
- **No Built-In Retries**
  - If you want advanced error strategies, you must handle them yourself.
- **One Tool**
  - Only `batch_execute` is exposed. The aggregator doesn't define other tools like "list_remote_tools."

---

## Installation

Currently, this is only available as a GitHub repository. Clone directly:

```bash
git clone https://github.com/{userName}/mcp-batchit.git
cd mcp-batchit
```

Then install dependencies and run:

```bash
npm install
npm start
```

It listens on **STDIO** by default, so an AI agent (like Cline) can spawn it and communicate via standard in/out.

---

## Usage Example (Filesystem Workflow)

Below is a **fully accurate** depiction of a **multi‐step, "real‐world"** workflow using `mcp-batchit` **as it exists today**. It shows the **actual** pattern you'd use, based on current functionality and limitations—**multiple** aggregator calls when a later step depends on the actual run‐time output of an earlier step.

### Why Multiple Calls Are Needed

- **mcp-batchit** can run **many** sub‐operations in a single request, but it does **not** pass output from sub‐op #1 to sub‐op #2 inside that same request. (In Progress)
- If sub‐op #2's arguments depend on **real** results from sub‐op #1 (e.g., file paths discovered by a search), you must do **two separate aggregator calls**—so the LLM or agent can see the results and form the next call with the correct arguments.

### Example: Copying & Editing Files With Real Dependencies

**Goal**: We want to copy the entire folder `C:\Users\{userName}\Documents\projects\{projectName}` to `C:\Users\{userName}\Documents\GitHub\{projectName}`, **excluding** certain items (`node_modules`, `build`, `package-lock.json`) and then edit references in the newly created files. We'll also verify the final structure.

#### PHASE 1: Discover What Files We Need

We do a **single** `batch_execute` call containing sub‐operations that **don't** depend on each other's outputs:

**(Call 1)**
```jsonc
{
  "targetServer": {
    "name": "filesystem",
    "serverType": {
      "type": "filesystem",
      "config": {
        "rootDirectory": "C:\\Users\\{userName}\\Documents"
      }
    },
    "transport": {
      "type": "stdio",
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "C:\\Users\\{userName}\\Documents",
        "C:\\Users\\{userName}\\Desktop"
      ]
    }
  },
  "operations": [
    // Phase A.1: Verify permissions
    {
      "tool": "list_allowed_directories",
      "arguments": {}
    },
    // Phase A.2: Find all copyable files (excluding artifacts)
    {
      "tool": "search_files",
      "arguments": {
        "path": "C:\\Users\\{userName}\\Documents\\projects\\{projectName}",
        "pattern": "*",
        "excludePatterns": ["node_modules", "build", "package-lock.json"]
      }
    }
  ],
  "options": {
    "maxConcurrent": 2,
    "timeoutMs": 30000,
    "stopOnError": false
  }
}
```

**Why This Must Be Its Own Call**
- We **don't** know which files exist or whether we have permission.
- The aggregator returns two sub-results:
  1. A list of allowed directories
  2. An array of matching files/dirs from `search_files`.

**We can't** use these results for a "read_multiple_files" operation in the same batch, because `mcp-batchit` doesn't pass sub‐operation #1's output to sub‐operation #2 (Yet!).

#### PHASE 2: Create Destination & Read Discovered Files

Now that we have the **actual** file listing from Phase 1's **search_files** output back from the Agent or LLM, we can feed them into our next aggregator call:

**(Call 2)**
```jsonc
{
  "targetServer": {
    "name": "filesystem",
    "serverType": { ... same as before ... },
    "transport": { ... same as before ... }
  },
  "operations": [
    // 1) create the destination folder(s)
    {
      "tool": "create_directory",
      "arguments": {
        "path": "C:\\Users\\{userName}\\Documents\\GitHub\\{projectName}"
      }
    },
    // 2) read all known source files from the search_files result
    {
      "tool": "read_multiple_files",
      "arguments": {
        "paths": [
          // filled in from the output of Phase 1's "search_files"
          "C:\\Users\\{userName}\\Documents\\projects\\{projectName}\\README.md",
          "C:\\Users\\{userName}\\Documents\\projects\\{projectName}\\src\\index.js"
          // ...
        ]
      }
    }
  ],
  "options": {
    "maxConcurrent": 3,
    "stopOnError": false
  }
}
```

**Now** we can read the actual content of each file discovered in Phase 1. This is **two** sub-ops in one aggregator call. They don't rely on each other's outputs. The aggregator runs them in parallel (up to `maxConcurrent` = 3).

#### PHASE 3: Write or Edit the Copied Files

At this point, the LLM has the contents from Phase 2's `read_multiple_files` response. It can decide which lines to modify or reference. Let's assume we want to do line-based edits in the new location:

**(Call 3)**
```jsonc
{
  "targetServer": {
    "name": "filesystem",
    "serverType": { ... same as before ... },
    "transport": { ... same as before ... }
  },
  "operations": [
    // 1) For each file, do an edit_file
    {
      "tool": "edit_file",
      "arguments": {
        "path": "C:\\Users\\{userName}\\Documents\\GitHub\\{projectName}\\src\\index.js",
        "edits": [
          {
            "oldText": "C:\\Users\\{userName}\\Documents\\projects\\{projectName}",
            "newText": "C:\\Users\\{userName}\\Documents\\GitHub\\{projectName}"
          }
        ]
      }
    },
    {
      "tool": "edit_file",
      "arguments": {
        "path": "C:\\Users\\{userName}\\Documents\\GitHub\\{projectName}\\README.md",
        "edits": [
          {
            "oldText": "some old reference",
            "newText": "some new reference"
          }
        ]
      }
    }
    // etc. (all your edits in one aggregator call)
  ],
  "options": {
    "maxConcurrent": 5,
    "stopOnError": true
  }
}
```

**In one aggregator call** we do all necessary edits. But we're not reading output from an earlier sub-op in the same call.

#### PHASE 4: Verification

Finally, we can verify the final structure. If we want to confirm the tree plus read some sample files:

**(Call 4)**
```jsonc
{
  "targetServer": {
    "name": "filesystem",
    ...
  },
  "operations": [
    {
      "tool": "directory_tree",
      "arguments": {
        "path": "C:\\Users\\{userName}\\Documents\\GitHub\\{projectName}"
      }
    },
    {
      "tool": "read_multiple_files",
      "arguments": {
        "paths": [
          "C:\\Users\\{userName}\\Documents\\GitHub\\{projectName}\\README.md",
          "C:\\Users\\{userName}\\Documents\\GitHub\\{projectName}\\src\\index.js"
        ]
      }
    }
  ]
}
```

The aggregator returns both sub-results in a single call. We see the structure from `directory_tree` and final file contents from `read_multiple_files`.

### Key Takeaways

1. **If a later sub‐op truly depends on the runtime output from an earlier sub‐op** → you do **multiple** aggregator calls.
2. **In each aggregator call**, you can still batch sub-ops that **don't** rely on each other (like create_directory + read_multiple_files).
3. This approach reduces overhead compared to calling each sub-op individually from the LLM, but it's **not** a pipeline system; the aggregator doesn't pass data from sub-op #1 to sub-op #2 automatically (Yet!).

**Hence**: The examples are broken into **phases**—**4** separate calls—reflecting **real-world** usage. That's how it's actually done with `mcp-batchit` in its current form.

---

## FAQ / Notes

1. **Can it pass the results of `search_files` directly to `read_multiple_files`?**
   - No—the aggregator doesn't do automatic data-passing (Yet!). If you need search results to determine which files to read, that requires two separate aggregator calls.

2. **What if I want partial progress or partial results?**
   - Currently, everything returns in one shot. No incremental progress is built in. (In progress!)

3. **Does `batch_execute` replicate advanced pipeline logic?**
   - No. We simply let you run multiple sub-operations in parallel or up to `maxConcurrent`. If you need fine-grained conditional branching, you can do multiple "batch_execute" calls in multiple steps.

4. **Where do these sub-tools (search_files, read_multiple_files, etc.) come from?**
   - They're provided by the "filesystem" MCP server (`@modelcontextprotocol/server-filesystem`). BatchIt just calls them behind the scenes to remove complexity from the LLM's perspective.

---

## License

MIT
