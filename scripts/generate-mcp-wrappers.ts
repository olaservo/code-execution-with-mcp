// Script to generate TypeScript wrapper files for MCP tools
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { compile } from 'json-schema-to-typescript';
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Parse command line arguments
const args = process.argv.slice(2);
const fallbackMode = args.includes('--fallback');
const timeoutMs = parseInt(args.find(a => a.startsWith('--timeout='))?.split('=')[1] || '30000');

interface GenerationMetadata {
  generatedAt: string;
  serverName: string;
  toolCount: number;
  generationDurationMs: number;
  hasInstructions: boolean;
}

// Timeout wrapper for async operations
function withTimeout<T>(promise: Promise<T>, ms: number, operation: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Operation '${operation}' timed out after ${ms}ms`));
    }, ms);

    promise
      .then(result => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch(err => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

// Convert snake_case to PascalCase
function toPascalCase(str: string): string {
  return str.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join('');
}

async function createTransport(config: any) {
  if (config.type === 'stdio') {
    // Local subprocess (default)
    return new StdioClientTransport({
      command: config.command,
      args: config.args,
      env: config.env
    });
  } else if (config.type === 'http') {
    // Remote HTTP server using StreamableHTTPClientTransport (modern, recommended)
    return new StreamableHTTPClientTransport(new URL(config.url), {
      requestInit: config.headers ? {
        headers: config.headers
      } : undefined
    });
  }
  throw new Error(`Unknown transport type: ${config.type}`);
}

async function generateWrappers(serverName: string, serverConfig: any) {
  const startTime = Date.now();
  console.log(`\nGenerating wrappers for server: ${serverName}`);
  console.log(`Config:`, JSON.stringify(serverConfig, null, 2));

  const transport = await createTransport(serverConfig);

  const client = new Client({
    name: 'wrapper-generator',
    version: '1.0.0'
  }, {
    capabilities: {}
  });

  // Connect with timeout
  await withTimeout(
    client.connect(transport),
    timeoutMs,
    `connecting to ${serverName}`
  );
  console.log(`Connected to ${serverName} MCP server`);

  // List tools with timeout
  const { tools } = await withTimeout(
    client.listTools(),
    timeoutMs,
    `listing tools from ${serverName}`
  );
  console.log(`Found ${tools.length} tools`);

  const serverDir = `./servers/${serverName}`;
  await fs.mkdir(serverDir, { recursive: true });

  // Save server instructions if provided
  // The SDK stores instructions in _instructions (private property from InitializeResult)
  const clientAny = client as any;
  const instructions = clientAny._instructions;
  if (instructions) {
    const instructionsPath = path.join(serverDir, 'README.md');
    const instructionsContent = `# ${serverName} MCP Server

## Server Instructions

${instructions}

---
*These instructions were provided by the MCP server during initialization.*
`;
    await fs.writeFile(instructionsPath, instructionsContent);
    console.log(`  Saved server instructions to README.md`);
  }

  for (const tool of tools) {
    const fileName = `${tool.name.replace(/^.*__/, '')}.ts`;
    const filePath = path.join(serverDir, fileName);

    const wrapper = await generateToolWrapper(serverName, tool);
    await fs.writeFile(filePath, wrapper);
    console.log(`  Generated: ${fileName}`);
  }

  // Create index.ts for easy imports
  const indexContent = tools
    .map(t => `export * from './${t.name.replace(/^.*__/, '')}.js';`)
    .join('\n');
  await fs.writeFile(path.join(serverDir, 'index.ts'), indexContent);
  console.log(`  Generated: index.ts`);

  // Save generation metadata
  const metadata: GenerationMetadata = {
    generatedAt: new Date().toISOString(),
    serverName,
    toolCount: tools.length,
    generationDurationMs: Date.now() - startTime,
    hasInstructions: !!instructions
  };
  await fs.writeFile(
    path.join(serverDir, '.metadata.json'),
    JSON.stringify(metadata, null, 2)
  );
  console.log(`  Saved metadata to .metadata.json`);

  await client.close();
  console.log(`Completed wrappers for ${serverName} in ${metadata.generationDurationMs}ms`);
}

async function generateToolWrapper(serverName: string, tool: any): Promise<string> {
  const toolName = tool.name.replace(/^.*__/, '');
  const pascalName = toPascalCase(toolName);
  const description = tool.description || 'No description provided';

  // Generate input interface from JSON Schema
  let inputInterface = '';
  let inputTypeName = 'any';
  if (tool.inputSchema) {
    const inputInterfaceName = `${pascalName}Input`;
    inputInterface = await compile(tool.inputSchema, inputInterfaceName, {
      bannerComment: '',
      additionalProperties: false
    });
    inputTypeName = inputInterfaceName;
  }

  // Generate output interface from JSON Schema (if available)
  let outputInterface = '';
  let outputTypeName = 'any';
  if (tool.outputSchema) {
    const outputInterfaceName = `${pascalName}Output`;
    outputInterface = await compile(tool.outputSchema, outputInterfaceName, {
      bannerComment: '',
      additionalProperties: false
    });
    outputTypeName = outputInterfaceName;
  }

  return `// Auto-generated wrapper for ${tool.name}
import { callMCPTool } from "../client.js";

${inputInterface}
${outputInterface}
/**
 * ${description}
 */
export async function ${toolName}(input: ${inputTypeName}): Promise<${outputTypeName}> {
  return callMCPTool('${serverName}', '${tool.name}', input);
}
`;
}

async function loadMCPConfig() {
  let configText = await fs.readFile('.mcp.json', 'utf-8');

  // Replace environment variable placeholders
  configText = configText.replace(/\$\{(\w+)\}/g, (_, varName) => {
    return process.env[varName] || '';
  });

  return JSON.parse(configText);
}

async function checkExistingWrappers(serverName: string): Promise<boolean> {
  const serverDir = `./servers/${serverName}`;
  try {
    const files = await fs.readdir(serverDir);
    const hasIndex = files.includes('index.ts');
    const hasMetadata = files.includes('.metadata.json');
    const hasWrappers = files.some(f => f.endsWith('.ts') && f !== 'index.ts');
    return hasIndex && hasWrappers;
  } catch {
    return false;
  }
}

async function getMetadata(serverName: string): Promise<GenerationMetadata | null> {
  try {
    const data = await fs.readFile(`./servers/${serverName}/.metadata.json`, 'utf-8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

async function main() {
  console.log('=== MCP Wrapper Generator ===');
  if (fallbackMode) {
    console.log('Running in fallback mode (will use existing wrappers on failure)');
  }
  console.log(`Timeout: ${timeoutMs}ms\n`);

  const config = await loadMCPConfig();
  const servers = config.mcpServers;

  let hasFailures = false;
  let allSuccess = true;

  for (const [name, serverConfig] of Object.entries(servers)) {
    try {
      await generateWrappers(name, serverConfig);
    } catch (error) {
      allSuccess = false;
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`\nError generating wrappers for ${name}: ${errorMessage}`);

      if (fallbackMode) {
        const hasExisting = await checkExistingWrappers(name);
        if (hasExisting) {
          const metadata = await getMetadata(name);
          const age = metadata
            ? `Generated ${metadata.generatedAt} (${metadata.toolCount} tools)`
            : 'Unknown age';
          console.log(`  Fallback: Using existing wrappers. ${age}`);
        } else {
          console.error(`  ERROR: No existing wrappers found for ${name}. Cannot fallback.`);
          hasFailures = true;
        }
      } else {
        hasFailures = true;
      }
    }
  }

  if (allSuccess) {
    console.log('\n=== Wrapper generation complete (all servers successful) ===');
  } else if (fallbackMode && !hasFailures) {
    console.log('\n=== Wrapper generation complete (some servers using cached fallback) ===');
  } else {
    console.error('\n=== Wrapper generation failed ===');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
