// Simple test agent demonstrating MCP code execution pattern
import { query, type SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";
import dotenv from "dotenv";
import * as fs from "fs/promises";
import { ensureWrappers } from "./scripts/ensure-wrappers.ts";
import {
  displayMetrics,
  saveMetricsToFile,
  saveFailedMetricsToFile,
  createMetricsData,
  SessionLogger,
  type ExecutionMode
} from "./lib/metrics.ts";
import { clearWorkspace, archiveWorkspace } from "./lib/workspace.ts";
import { buildOptions } from "./lib/options-builder.ts";

dotenv.config();

interface CLIArgs {
  mode: ExecutionMode;
  model?: string;
}

function parseArgs(): CLIArgs {
  const args = process.argv.slice(2);
  let mode: ExecutionMode = "code-execution"; // default
  let model: string | undefined;

  for (const arg of args) {
    if (arg === "--mode=direct-mcp" || arg === "--direct-mcp") {
      mode = "direct-mcp";
    } else if (arg === "--mode=code-execution" || arg === "--code-execution") {
      mode = "code-execution";
    } else if (arg.startsWith("--model=")) {
      model = arg.split("=")[1];
    } else if (arg === "--help" || arg === "-h") {
      console.log(`
Usage: tsx agent.ts [options]

Options:
  --mode=code-execution  Run in code execution mode (default)
                         Agent writes TypeScript to call MCP wrappers
  --mode=direct-mcp      Run in direct MCP mode
                         Agent uses MCP tools directly
  --model=<model-id>     Specify the Claude model to use (full model ID)
                         Examples: claude-sonnet-4-5-20250929
                                   claude-haiku-4-5-20251001
  --help, -h             Show this help message

Examples:
  tsx agent.ts                                      # Default (sonnet)
  tsx agent.ts --mode=direct-mcp                    # Direct MCP mode
  tsx agent.ts --model=claude-haiku-4-5-20251001    # Use Haiku
`);
      process.exit(0);
    }
  }

  return { mode, model };
}

async function main() {
  const { mode, model } = parseArgs();
  const startTime = Date.now();

  // Load prompts from files
  const systemPromptFile = mode === "direct-mcp"
    ? './prompts/system-direct-mcp.md'
    : './prompts/system-code-execution.md';
  const systemPrompt = await fs.readFile(systemPromptFile, 'utf-8');
  const task = await fs.readFile('./prompts/task.md', 'utf-8');

  // Clear workspace directory to avoid confusion from previous runs
  console.log("=== Clearing Workspace ===\n");
  const { cleared, created } = await clearWorkspace("./workspace", [".gitkeep"], { createIfMissing: true });
  if (created) {
    console.log("Created workspace directory\n");
  } else {
    console.log(`Cleared ${cleared} items from workspace\n`);
  }

  // Ensure MCP wrappers if running in code execution mode
  if (mode === "code-execution") {
    console.log("=== Checking MCP Wrappers ===\n");
    const wrapperResult = await ensureWrappers({
      regenerate: true,
      timeoutMs: 10000,
      verbose: true
    });

    if (!wrapperResult.success) {
      console.error("\nFailed to ensure MCP wrappers are available.");
      console.error("Errors:", wrapperResult.errors);
      console.error("\nPlease run 'npm run generate-wrappers' manually to resolve.");
      process.exit(1);
    }

    if (wrapperResult.warnings.length > 0) {
      console.log("\nWarnings:", wrapperResult.warnings);
    }
    console.log();
  } else {
    console.log("=== Direct MCP Mode ===\n");
    console.log("Agent will use MCP tools directly (no code execution wrapper pattern)\n");
  }

  // Build options using shared utility
  const options = await buildOptions({ mode, systemPrompt, model });

  console.log(`\n[Agent] Final options object:`, JSON.stringify({
    settingSources: options.settingSources,
    cwd: options.cwd,
    allowedTools: options.allowedTools,
    permissionMode: options.permissionMode,
    model: options.model,
    mcpServers: options.mcpServers ? Object.keys(options.mcpServers) : undefined,
    systemPromptLength: options.systemPrompt?.length
  }, null, 2));

  console.log(`\n=== MCP ${mode === "code-execution" ? "Code Execution" : "Direct MCP"} Demo ===\n`);
  console.log("Starting agent with tool discovery task...\n");
  console.log(`Start time: ${new Date(startTime).toISOString()}\n`);

  // Create session logger
  const logger = new SessionLogger(mode);
  console.log(`Session ID: ${logger.getSessionId()}\n`);

  let resultMessage: SDKResultMessage | null = null;
  let currentToolName: string | null = null;
  let error: Error | null = null;

  try {
    for await (const message of query({ prompt: task, options })) {
      if (message.type === "text") {
        console.log(`\nClaude: ${message.text}`);
        logger.addTextMessage(message.text);
      }
      else if (message.type === "assistant") {
        // Handle assistant messages with content chunks
        logger.addAssistantMessage(message.message.content);
        for (const chunk of message.message.content) {
          if (chunk.type === 'text') {
            console.log(`\nClaude: ${chunk.text}`);
          }
          if (chunk.type === 'tool_use') {
            console.log(`\n[Tool Use] ${chunk.name}`);
          }
        }
      }
      else if (message.type === "tool_use") {
        currentToolName = message.name;
        logger.addToolUse(message.name, message.input);
        console.log(`\n[Tool Use] ${message.name}`);
        if (message.name === "Bash") {
          const cmd = message.input?.command || "";
          const preview = cmd.length > 100 ? cmd.substring(0, 100) + "..." : cmd;
          console.log(`Command: ${preview}`);
        } else if (message.name.startsWith("mcp__")) {
          // Direct MCP tool call
          const input = JSON.stringify(message.input || {}, null, 2);
          const preview = input.length > 200 ? input.substring(0, 200) + "..." : input;
          console.log(`Input: ${preview}`);
        }
      }
      else if (message.type === "tool_result") {
        logger.addToolResult(currentToolName || "unknown", true);
        console.log("[Tool Completed]");
        currentToolName = null;
      }
      else if (message.type === "result") {
        resultMessage = message;
        console.log("\n[Final Result]");
      }
    }
  } catch (err) {
    error = err instanceof Error ? err : new Error(String(err));
    console.error("\n[Error]", error);
    logger.addEntry('error', { message: error.message });

    // Mark logger as error for filename prefix
    logger.markAsError(error.message);
  } finally {
    // Always save logs, even if there was an error
    console.log("\n=== Demo complete ===");
    console.log(`End time: ${new Date().toISOString()}`);

    // Display and save metrics
    if (resultMessage) {
      // Success case - save full metrics
      displayMetrics(resultMessage, mode, startTime);

      // Add metrics to session log
      const metrics = createMetricsData(resultMessage, mode, startTime);
      logger.setMetrics(metrics);

      // Always save metrics to file
      await saveMetricsToFile(resultMessage, mode, startTime, logger.getSessionId());
    } else if (error) {
      // Failure case - save partial metrics with error details
      await saveFailedMetricsToFile(mode, startTime, logger.getSessionId(), error.message);
    }

    // Save session log (always executed, even on error)
    const logPath = await logger.save();
    console.log(`\nSession log saved to: ${logPath}`);
    console.log(`Human-readable log: ${logPath.replace('.json', '.md')}`);

    // Archive workspace files (always executed, even on error)
    try {
      const archiveResult = await archiveWorkspace(logger.getSessionId());
      if (archiveResult.archived > 0) {
        console.log(`\nWorkspace archived: ${archiveResult.archived} items saved to ${archiveResult.archivePath}`);
      }
    } catch (archiveError) {
      console.error(`Warning: Failed to archive workspace:`, archiveError);
    }

    // Re-throw error if one occurred
    if (error) {
      throw error;
    }
  }
}

main().catch(console.error);
