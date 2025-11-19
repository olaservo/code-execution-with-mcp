// Options builder for different execution modes
import type { ExecutionMode } from "./metrics.ts";
import { loadMCPConfigWithEnvSubstitution, loadEnvironmentConfig } from "./config.ts";

export interface BuildOptionsConfig {
  mode: ExecutionMode;
  systemPrompt: string;
  model?: string; // Optional override for model
  useBedrock?: boolean; // Optional override for bedrock
}

/**
 * Build query options for the specified execution mode
 */
export async function buildOptions(config: BuildOptionsConfig): Promise<any> {
  const { mode, systemPrompt, model } = config;
  const envConfig = loadEnvironmentConfig();

  // Determine model to use
  let modelId: string;
  if (model) {
    // Use full model ID as provided
    modelId = model;
  } else {
    // Default to Sonnet
    modelId = envConfig.modelSonnet;
  }

  if (mode === "code-execution") {
    return {
      settingSources: ['project' as const],
      systemPrompt,
      cwd: process.cwd(),
      allowedTools: ["Bash", "Read", "Write", "List", "Skill"],
      permissionMode: "default" as const,
      model: modelId
    };
  } else {
    // Direct MCP mode - load MCP configuration
    const mcpConfig = await loadMCPConfigWithEnvSubstitution();

    return {
      settingSources: ['project' as const],
      systemPrompt,
      cwd: process.cwd(),
      mcpServers: mcpConfig.mcpServers,
      allowedTools: ["Read", "Write", "Skill", "mcp__github"],
      permissionMode: "default" as const,
      model: modelId
    };
  }
}
