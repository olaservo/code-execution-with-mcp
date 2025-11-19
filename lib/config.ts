// Configuration utilities for MCP servers and environment variables
import * as fs from "fs/promises";

export interface MCPServerConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  headers?: Record<string, string>;
  [key: string]: unknown;
}

export interface MCPConfig {
  mcpServers: Record<string, MCPServerConfig>;
}

export interface EnvironmentConfig {
  useBedrock: boolean;
  githubPat: string;
  modelHaiku: string;
  modelSonnet: string;
}

/**
 * Load environment configuration from process.env
 */
export function loadEnvironmentConfig(): EnvironmentConfig {
  const useBedrock = process.env.CLAUDE_CODE_USE_BEDROCK === "1";

  return {
    useBedrock,
    githubPat: process.env.GITHUB_PAT || "",
    modelHaiku: useBedrock
      ? "us.anthropic.claude-haiku-4-5-20251001-v1:0"
      : "claude-haiku-4-5-20251001",
    modelSonnet: useBedrock
      ? "us.anthropic.claude-sonnet-4-5-20250929-v1:0"
      : "claude-sonnet-4-5-20250929"
  };
}

/**
 * Load MCP server configuration from a JSON file
 */
export async function loadMCPConfig(
  configPath: string = "./.mcp.json"
): Promise<MCPConfig> {
  const raw = await fs.readFile(configPath, "utf-8");
  return JSON.parse(raw);
}

/**
 * Substitute environment variables in MCP server configuration.
 * Replaces ${VAR_NAME} patterns with values from process.env
 */
export function substituteMCPEnvVariables(config: MCPConfig): MCPConfig {
  const substituted = JSON.parse(JSON.stringify(config)); // Deep clone

  // Recursively substitute environment variables in all string values
  function substituteInObject(obj: unknown): unknown {
    if (typeof obj === "string") {
      // Replace ${VAR_NAME} with environment variable value
      return obj.replace(/\$\{([^}]+)\}/g, (_, varName) => {
        return process.env[varName] || "";
      });
    } else if (Array.isArray(obj)) {
      return obj.map(substituteInObject);
    } else if (obj && typeof obj === "object") {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = substituteInObject(value);
      }
      return result;
    }
    return obj;
  }

  return substituteInObject(substituted) as MCPConfig;
}

/**
 * Load MCP configuration and substitute environment variables
 */
export async function loadMCPConfigWithEnvSubstitution(
  configPath: string = "./.mcp.json"
): Promise<MCPConfig> {
  const config = await loadMCPConfig(configPath);
  return substituteMCPEnvVariables(config);
}
