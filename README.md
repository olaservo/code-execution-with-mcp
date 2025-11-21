# MCP Code Execution Demo with the Claude Agent SDK

A demonstration of the MCP code execution pattern using the Claude Agent SDK.

## Overview

This project was inspired by [this blog post by Anthropic](https://www.anthropic.com/engineering/code-execution-with-mcp).  The blog post didn't come with complete code, but it did include a lot of hints on how to implement this pattern.  

I wanted to keep this version simple and as consistent as possible with the blog.  I decided to use the [Claude Agent SDK](https://docs.claude.com/en/docs/agent-sdk/overview) as it already supports Agent Skills, MCP, and other necessary features out of the box.

This implementation of this pattern generates RPC wrapper files for MCP tools. These wrappers are type-safe interfaces that agents can discover and use as code.

## Isn't this evidence that MCP is a huge mistake/over-engineered/etc?

I've been (sort of) surprised to see all the reactions to the blog post that take this as evidence that `MCP is bad`.  This is just a new way of using it. Sometimes it will make sense, and sometimes it won't.  

I'm a big fan of using empirical evidence to understand things like this better, rather than getting into a theoretical debate.  Hopefully concrete interpretations of these ideas help to generate more evidence, so that you can decide for yourself if this type of solution fits a use case.

I also like [Shaunak Joshi](https://x.com/shaunakjoshi)'s take in his response to [this tweet](https://x.com/stevekrouse/status/1986922520298287496) related to this subject:
> MCP handles distribution and discovery (installable apps like connectors exposing capabilities), while code mode handles just pure execution (models generate code using auto-generated SDKs from MCP schemas). MCP then is more of a packaging layer and you get both ecosystem benefits and composability.

## ⚠️ Security & Sandboxing Limitations

**Important:** This implementation currently does **not** include a working sandbox configuration out of the box in the Claude Agent SDK. This means:

- **Unrestricted Access**: Agents executing code have full access to your filesystem, network, and system resources
- **Security Risk**: There are no built-in protections against potentially harmful operations
- **Use with Caution**: Only use this in trusted environments with tasks you fully understand

**Planned Improvements:**

We are actively investigating sandboxing solutions to address these limitations:

1. **[Anthropic Sandbox Runtime](https://github.com/anthropic-experimental/sandbox-runtime)** - A lightweight sandboxing tool that uses native OS primitives (sandbox-exec on macOS, bubblewrap on Linux) to enforce filesystem and network restrictions
2. **Docker-based Configuration** - An alternative containerized approach for process isolation

**Recommendations:**

- Only execute code in controlled, non-production environments
- Review generated code before allowing execution
- Avoid using with untrusted data sources or prompts
- Consider implementing your own sandboxing solution based on your security requirements

Until robust sandboxing is integrated, treat this as an experimental demonstration rather than production-ready infrastructure.

## Understanding the Pattern

### What is MCP Code Execution?

MCP code execution is an experimental pattern for building efficient AI agents.

- **Expose MCP tools as RPC wrapper files** in a filesystem structure (type-safe interfaces, actual implementation stays on MCP server)
- **Discover and load tools on-demand** by exploring the filesystem
- **Execute data processing in code environment** before passing results to LLM
- **Agents discover and build their own persistent, reusable skills** that leverage these tool wrappers.

### Hypothesis

One hypothesis is that code execution should significantly reduce token consumption for data-heavy workflows by:
1. Discovering tools on-demand rather than loading all definitions upfront
2. Processing large datasets in code before passing results to LLM
3. Enabling complex data transformations without multiple tool calls

This repository provides both modes so you can test and compare actual results for your use case.

## Example Performance Results: Analyzing GitHub Issues

I tested both approaches across two real-world repositories:

_Shoutout to [@johncburns1](https://github.com/johncburns1) for coming up with the GitHub issues use case idea!_

### Large Dataset Example: Claude Code Repository (5,205 open issues)

The [Claude Code repo](https://github.com/anthropics/claude-code) provided a good stress test with [~5k open issues](https://github.com/anthropics/claude-code/issues) at the time of my test, which was a large enough dataset to expose fundamental architectural differences between approaches.

**Results across 5 runs per approach:**

Code execution succeeded on all 5 runs. Claude consistently created reusable skills and used the `list_issues` tool wrapper to successfully fetch and process all issues.

Direct MCP failed on all 5 runs, hitting context overflow errors after attempting to load all issues into context simultaneously.

| Approach | Success Rate | Avg Duration | Avg Cost | Output |
|----------|-------------|--------------|----------|---------|
| **Code Execution** | 100% (5/5) | 343s (5.7 min) | $0.34 | Complete reports + JSON |
| **Direct MCP** | 0% (5/5) | 31s to failure | N/A | N/A |

**Why Direct MCP Failed:**
- Attempted to load all 5,205 issues into context simultaneously
- Reached ~600-800 issues before hitting 200K token limit (turn 3)

**Why Code Execution Succeeded:**
- Wrote TypeScript to fetch issues in batches using the list_issues tool wrapper
- Processed and aggregated data in memory (~520K tokens worth)
- Passed only summary statistics to model (~10K tokens)

### Small Dataset: Anthropic SDK Python (45 issues)

When testing with the [`anthropic-sdk-python`](https://github.com/anthropics/anthropic-sdk-python) repository (~45 open issues), both approaches succeeded, but code execution still significantly outperformed:

| Metric | Code Execution | Direct MCP | Advantage |
|--------|---------------|------------|-----------|
| Success Rate | 100% (5/5) | 100% (5/5) | Tie |
| Avg Duration | 76s | 269s | **3.5× faster** |
| Avg Cost | $0.18 | $0.54 | **67% cheaper** |
| Avg Turns | 11.6 | 4.8 | 2.4× more turns |
| Output Tokens | 2,053 | 15,287 | **7.4× fewer** |
| Output Quality | Structured, concise | Narrative, detailed | Different styles |

**Output Style Differences:**

The approaches produced notably different report styles:

- **Code Execution:** Generated structured, data-focused reports (~9.7KB) optimized for quick scanning and machine parsing.
- **Direct MCP:** Generated richer narrative reports (~15.8-19.5KB) with more context and explanation.

Both capture the same data accurately (all 45 issues, correct categorizations), but direct MCP's 7.4× higher output token count reflected more verbose, explanatory text rather than additional insights.

**Complexity Trade-offs:**

Code execution requires 2.4× more agent turns (11.6 vs 4.8), reflecting the overhead of:
- Writing and debugging TypeScript code
- Executing scripts and reviewing outputs  
- Iterating on data processing logic

However, this complexity overhead was more than offset by execution speed and cost savings. The additional turns happened quickly because the agent was delegating computation to code rather than generating extensive analytical text.

Even when direct MCP can technically succeed, code execution delivered dramatically better performance. The main trade-off in this example was the 'structured' vs 'narrative' output style.

I was genuinely surprised by this result, since I expected direct MCP to have an advantage on small datasets where context limits aren't a concern. Instead, code execution's efficiency gains from out-of-context data processing outweighed its additional complexity overhead, even at small scale.

### Future Improvements

**Skill Optimization:** The code execution approach's turn count (11.6 avg) could likely be reduced by optimizing the Skill implementation. The current agent sometimes writes and debugs code iteratively when a more efficient workflow might generate working code in fewer turns.

### Full Experimental Data

You can find [full zip archives](https://github.com/olaservo/code-execution-with-mcp/releases/tag/11-20-25) of the logs, metrics, and workspace files generated by these experiments in the Releases tab of this repo.

## What These Results Suggest

Based on these GitHub issue analysis experiments:

**For this specific use case (analyzing repository issues):**
- Code execution was the only viable approach for large datasets (5K+ issues)
- Code execution outperformed direct MCP even on small datasets (45 issues) by 3.5× on speed and 67% on cost
- The main trade-off was structured vs narrative output style, with code execution requiring more agent turns

**Open Questions:**

These results only cover one type of task. More testing needed for:
- Different data types (structured vs unstructured)
- Different operations (CRUD vs analysis)
- Different MCP servers (filesystem, databases, APIs)
- Real-time vs batch workloads
- Tasks requiring back-and-forth iteration

**Hypotheses Worth Testing:**

Code execution may be beneficial whenever:
- Dataset size is unknown or potentially large
- Data needs filtering/transformation before analysis
- Multiple data sources need to be joined
- The same workflow will be repeated

But these are still hypotheses, not proven conclusions. Your mileage may vary.

**Help Build the Evidence:**

If you test this pattern with different use cases, please share your findings in the [MCP community discussion](https://github.com/modelcontextprotocol/modelcontextprotocol/discussions/1780) or open an issue in this repo. More data points will help the community understand when this approach makes sense.

## Execution Flow

```
Agent's Code                      Transport              MCP Server
─────────────                     ─────────              ──────────
import * as github from '...';

issues = await github.list_issues()
  → callMCPTool()
    → MCP Client                  ══HTTP/Stdio═>        GitHub API calls
                                                         Authentication
    ← Returns data                <══════════            Data processing

filtered = issues.filter(...)     [Stays in code]
sorted = filtered.sort(...)       [Stays in code]

console.log(sorted)               → Back to LLM context
```

Large datasets are fetched once, processed in code, and only final results return to the LLM. This reduces token consumption compared to making multiple tool calls or analyzing full datasets in context, as well as the number of turns needed to complete a task.

---

## Setup

### 1. Environment Variables

Create a `.env` file:

```bash
GITHUB_PAT=your_github_personal_access_token # Needed if using the GitHub MCP Server config in this repo.  Permissions to read issues for the target repo is required.
ANTHROPIC_API_KEY=your_anthropic_api_key # OR: use AWS Bedrock setting
CLAUDE_CODE_USE_BEDROCK=0  # Set to 1 to use AWS Bedrock models
ANTHROPIC_DEFAULT_HAIKU_MODEL=us.anthropic.claude-haiku-4-5-20251001-v1:0 # If using AWS Bedrock, latest Haiku is not used by default and needs to be explicitly set
```

**Model Selection:**

The agent automatically selects the appropriate models based on the `CLAUDE_CODE_USE_BEDROCK` environment variable:

- When `CLAUDE_CODE_USE_BEDROCK=0` (default): Uses standard Anthropic API models
  - `claude-haiku-4-5-20251001`
  - `claude-sonnet-4-5-20250929`

- When `CLAUDE_CODE_USE_BEDROCK=1`: Uses AWS Bedrock models
  - `us.anthropic.claude-haiku-4-5-20251001-v1:0`
  - `us.anthropic.claude-sonnet-4-5-20250929-v1:0`

### 2. Install Dependencies

```bash
npm install
```

### 3. Generate MCP Wrappers

**Required** - wrappers are not checked into git (except `client.ts`):

```bash
npm run generate-wrappers
```

This connects to the GitHub MCP server and generates TypeScript wrappers for all 40 tools.

**Note:** The agent automatically runs `ensure-wrappers.ts` before execution, which:
- Regenerates wrappers only if missing or stale
- Falls back to existing wrappers if regeneration fails (e.g., network issues)
- Tracks metadata in `.metadata.json` files

---

## Usage

### Execution Modes

The agent supports two execution modes for comparing MCP code execution against baseline MCP tool calling approaches.  
Detailed session logging captures detailed metrics for both modes, enabling direct comparison of token usage, costs, and execution patterns.

### Running the Agent

```bash
# Default: Code execution mode with default task
npm start

# Direct MCP mode
npm run start:mcp           # Direct MCP mode

# Analyze results task (for comparing experiment results)
npm run start:analyze-results

# CLI options
tsx agent.ts --task=task-analyze-results.md  # Specify a different task file
tsx agent.ts --model=haiku                   # Use Haiku instead of Sonnet
tsx agent.ts --help                          # Show all options
```

**Task Input Files:**

Some tasks (like `task-analyze-results.md`) require input files. To specify input files, edit the path directly in the task file at `prompts/task-analyze-results.md`.
```

### Session Logging

Each run automatically creates detailed session logs with a unique session ID:

```bash
Session ID: code-execution-2025-11-18T15-32-10-123Z
```

**Log Files:**
- `logs/{session-id}.json` - Complete structured data for programmatic analysis
- `logs/{session-id}.md` - Human-readable markdown format for review

**What's Captured:**
- Every tool use with name and full input parameters
- Every assistant message and reasoning
- Tool completion status and errors
- Timing information for each step
- Final metrics (cost, tokens, duration)

**Failed Run Tracking:**
For runs that fail with errors, session IDs are prefixed with `FAILED__` for easy identification. Both the log files and any archived workspace data use this prefix, making it simple to diagnose issues.

**Usage:**
Session logs let you replay exactly what happened during execution, compare different runs, and debug agent behavior. They're particularly useful when comparing code-execution vs direct-mcp modes.


### Verify MCP Setup

To verify your MCP configuration is correct, the agent will automatically check wrapper availability and connectivity on startup. If there are issues, you'll see detailed error messages.

You can also manually regenerate wrappers to test connectivity:

```bash
npm run generate-wrappers
```

This will connect to the server(s) and regenerate all tool wrappers. If successful, you'll see output showing the number of tools generated.

### Running Your First Task

```bash
npm start
```

The agent will:
1. Archive previous workspace contents (if any) to `workspace_archive/`
2. Clear the workspace directory for a clean run
3. Ensure MCP wrappers are up-to-date (regenerates if stale)
4. Load mode-specific system prompt and task from `prompts/`
5. Execute the task using the selected execution mode
6. Display comprehensive metrics and save session logs

---

## How It Works

### MCP Configuration

The `.mcp.json` file configures which MCP servers to connect to:

```json
{
  "mcpServers": {
    "github": {
      "type": "http",
      "url": "https://api.githubcopilot.com/mcp/",
      "headers": {
        "Authorization": "Bearer ${GITHUB_PAT}"
      }
    }
  }
}
```

**Note:** Environment variables (e.g., `${GITHUB_PAT}`) are substituted when loading the config.

### Transport Support

The client supports:
- **HTTP Transport** (`type: "http"`): Uses `StreamableHTTPClientTransport` for remote servers
- **Stdio Transport** (`type: "stdio"`): Uses `StdioClientTransport` for local subprocess servers

### RPC Client Bridge

The `servers/client.ts` implements `callMCPTool()`:

```typescript
export async function callMCPTool<T = any>(
  serverName: string,   // 'github'
  toolName: string,     // 'get_me' (short name)
  input: any
): Promise<T> {
  // Get or create MCP client connection
  let client = mcpClients.get(serverName);
  if (!client) {
    client = await connectToMCPServer(serverName);
    mcpClients.set(serverName, client);
  }

  // Call the MCP tool
  const result = await client.callTool({
    name: toolName,
    arguments: input
  });

  // Parse and return result
  if (result.content && result.content[0]) {
    const content = result.content[0];
    if ('text' in content && content.text) {
      try {
        return JSON.parse(content.text);
      } catch {
        return content.text as T;
      }
    }
  }
  return result as T;
}
```

### Server Instructions

During wrapper generation, the script captures [server instructions](https://modelcontextprotocol.io/specification/draft/schema#initializeresult) from the MCP server's `InitializeResult` (if provided) and saves them to `servers/{server-name}/README.md`.

The agent should read these instructions before using tools from that server to ensure proper usage patterns. You can check out [this blog](https://blog.modelcontextprotocol.io/posts/2025-11-03-using-server-instructions/) for more information on what is typically included here.

---

## Agent Skills Discovery

The Claude Agent SDK automatically discovers skills from `.claude/skills/` when `settingSources` is configured.

Example:

```typescript
const options = {
  settingSources: ['project' as const],  // Loads .claude/settings.json and discovers skills
  allowedTools: ["Bash", "Read", "Write", "List", "Skill"],  // Include "Skill" tool
  // ... other options
};
```

---

## Next Steps

Once the setup is complete, you can:

1. **Edit `prompts/task-default.md`** to change what task the agent should perform
2. **Compare execution modes** by running the same task in both modes and analyzing session logs
3. **Add more MCP servers** to `.mcp.json` (supports both HTTP and stdio transports) and regenerate wrappers
4. **Experiment with models** using `--model=haiku` or `--model=sonnet`

---

## Resources

### Official Documentation

- [Claude Agent SDK Documentation](https://docs.claude.com/en/docs/agent-sdk/overview)
- [Claude Models Overview](https://docs.claude.com/en/docs/about-claude/models/overview)
- [MCP in the SDK](https://docs.claude.com/en/docs/agent-sdk/mcp)
- [Sandboxing Guide](https://docs.claude.com/en/docs/claude-code/sandboxing)
- [Skills Documentation](https://docs.claude.com/en/docs/agents-and-tools/agent-skills/overview)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [MCP Specification](https://spec.modelcontextprotocol.io)
- [Model Context Protocol Documentation](https://modelcontextprotocol.io)

### Related Articles

- [Code Execution with MCP (Anthropic Blog)](https://www.anthropic.com/engineering/code-execution-with-mcp)
- [Building Agents with Claude Agent SDK](https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk)
- [Claude Code Sandboxing](https://www.anthropic.com/engineering/claude-code-sandboxing)
- [Cloudflare's Code Mode](https://blog.cloudflare.com/code-mode/)
