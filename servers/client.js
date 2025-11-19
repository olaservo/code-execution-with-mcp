// MCP Client Bridge - connects wrapper functions to actual MCP servers
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import fs from 'fs/promises';
import dotenv from 'dotenv';
// Load environment variables from .env file
dotenv.config();
const mcpClients = new Map();
/**
 * Calls an MCP tool by server name and tool name
 * Works with both stdio and HTTP transports
 */
export async function callMCPTool(serverName, toolName, input) {
    let client = mcpClients.get(serverName);
    if (!client) {
        client = await connectToMCPServer(serverName);
        mcpClients.set(serverName, client);
    }
    const result = await client.callTool({
        name: toolName,
        arguments: input
    });
    // Parse the result if it's JSON text
    if (result.content && result.content[0]) {
        const content = result.content[0];
        if ('text' in content && content.text) {
            try {
                return JSON.parse(content.text);
            }
            catch {
                return content.text;
            }
        }
    }
    return result;
}
async function connectToMCPServer(serverName) {
    const config = await loadMCPServerConfig(serverName);
    // Create appropriate transport based on config
    let transport;
    if (config.type === 'http') {
        // Remote HTTP server using StreamableHTTPClientTransport (modern, recommended)
        transport = new StreamableHTTPClientTransport(new URL(config.url), {
            requestInit: config.headers ? {
                headers: config.headers
            } : undefined
        });
    }
    else {
        // Local stdio server (default)
        transport = new StdioClientTransport({
            command: config.command,
            args: config.args,
            env: config.env
        });
    }
    const client = new Client({
        name: 'agent-mcp-client',
        version: '1.0.0'
    }, {
        capabilities: {}
    });
    await client.connect(transport);
    console.log(`[MCP Client] Connected to ${serverName} server`);
    return client;
}
/**
 * Get or create an MCP client for a server (for debugging/inspection)
 */
export async function getMCPClient(serverName) {
    let client = mcpClients.get(serverName);
    if (!client) {
        client = await connectToMCPServer(serverName);
        mcpClients.set(serverName, client);
    }
    return client;
}
async function loadMCPServerConfig(serverName) {
    let configText = await fs.readFile('.mcp.json', 'utf-8');
    // Replace environment variable placeholders
    configText = configText.replace(/\$\{(\w+)\}/g, (_, varName) => {
        return process.env[varName] || '';
    });
    const config = JSON.parse(configText);
    if (!config.mcpServers[serverName]) {
        throw new Error(`MCP server '${serverName}' not found in .mcp.json`);
    }
    return config.mcpServers[serverName];
}
