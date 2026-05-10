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

  await generateServerSkill(serverName, tools, instructions);

  await client.close();
  console.log(`Completed wrappers for ${serverName} in ${metadata.generationDurationMs}ms`);
}

// Emit a server-scoped skill at .claude/skills/<server>-server/.
// `references/tools.md` is always regenerated from the live schema so the catalog stays in sync.
// `SKILL.md` is seeded only on first generation so iterative human/agent curation (workhorses,
// gotchas) survives subsequent runs.
async function generateServerSkill(
  serverName: string,
  tools: any[],
  instructions: string | undefined
) {
  const skillName = `${serverName}-server`;
  const skillDir = path.join('.', '.claude', 'skills', skillName);
  const referencesDir = path.join(skillDir, 'references');
  await fs.mkdir(referencesDir, { recursive: true });

  const toolsMd = renderToolCatalog(serverName, tools, instructions);
  await fs.writeFile(path.join(referencesDir, 'tools.md'), toolsMd);
  console.log(`  Generated: .claude/skills/${skillName}/references/tools.md`);

  const skillPath = path.join(skillDir, 'SKILL.md');
  try {
    await fs.access(skillPath);
    console.log(`  Skipped (already exists): .claude/skills/${skillName}/SKILL.md`);
  } catch {
    const seed = renderSkillSeed(serverName, tools.length);
    await fs.writeFile(skillPath, seed);
    console.log(`  Seeded: .claude/skills/${skillName}/SKILL.md`);
  }
}

function renderToolCatalog(
  serverName: string,
  tools: any[],
  instructions: string | undefined
): string {
  const lines: string[] = [];
  lines.push(`# ${serverName} tool catalog`);
  lines.push('');
  lines.push(
    `Auto-generated by \`scripts/generate-mcp-wrappers.ts\`. Do not edit by hand — changes will be overwritten on the next \`npm run generate-wrappers\`.`
  );
  lines.push('');
  lines.push(
    `Wrapper files live in \`./servers/${serverName}/\`. Import with: \`import * as ${serverName} from './servers/${serverName}';\``
  );
  lines.push('');

  if (instructions) {
    lines.push('## Server instructions');
    lines.push('');
    lines.push(instructions.trim());
    lines.push('');
  }

  const destructive: string[] = [];
  const readOnly: string[] = [];
  const other: string[] = [];
  for (const tool of tools) {
    const ann = tool.annotations ?? {};
    if (ann.readOnlyHint === true) readOnly.push(tool.name);
    else if ((ann.destructiveHint ?? true) === true) destructive.push(tool.name);
    else other.push(tool.name);
  }

  lines.push('## Index');
  lines.push('');
  lines.push(`- Total tools: ${tools.length}`);
  lines.push(`- Read-only: ${readOnly.length}`);
  lines.push(`- Destructive (may modify state non-additively): ${destructive.length}`);
  lines.push(`- Other (writes, but additive only or unspecified): ${other.length}`);
  lines.push('');
  if (destructive.length > 0) {
    lines.push(
      '> **Caution:** destructive tools may perform irreversible state changes. Verify intent before calling.'
    );
    lines.push('');
  }

  lines.push('## All tools');
  lines.push('');

  const sorted = [...tools].sort((a, b) => a.name.localeCompare(b.name));
  for (const tool of sorted) {
    const ann = tool.annotations ?? {};
    const localName = tool.name.replace(/^.*__/, '');
    const ro = ann.readOnlyHint ?? false;
    const destr = ann.destructiveHint ?? true;
    const idem = ann.idempotentHint ?? false;

    const tags: string[] = [];
    if (ro) tags.push('read-only');
    if (!ro && destr) tags.push('destructive');
    if (!ro && idem) tags.push('idempotent');
    const tagSuffix = tags.length > 0 ? ` _(${tags.join(', ')})_` : '';

    lines.push(`### \`${tool.name}\`${tagSuffix}`);
    lines.push('');
    if (tool.description) {
      lines.push(String(tool.description).trim());
      lines.push('');
    }
    lines.push(`Wrapper: \`./servers/${serverName}/${localName}.ts\``);
    lines.push('');
  }

  return lines.join('\n');
}

function renderSkillSeed(serverName: string, toolCount: number): string {
  return `---
name: ${serverName}-server
description: Use when the task involves the ${serverName} service — any operation that would call an MCP tool from the ${serverName} server. Indexes the ${toolCount} available tools under \`./servers/${serverName}/\` and surfaces server-level gotchas before the agent starts \`ls\`-ing wrappers blindly. Read \`references/tools.md\` for the full catalog with descriptions and behavior hints.
---

# ${serverName} server

Wrapper files live in \`./servers/${serverName}/\`. Import with:

\`\`\`typescript
import * as ${serverName} from './servers/${serverName}';
\`\`\`

For the full list of tools, their descriptions, and behavior hints (read-only / destructive / idempotent), read \`references/tools.md\`. That file is regenerated from the live MCP schema on every \`npm run generate-wrappers\`, so it's always in sync.

## Workhorses

<!-- Curate by hand: the 5-10 tools you actually reach for most often.
     Example:
     - \`list_issues\` — paginated issue fetch; pair with code-side filtering
     - \`get_file_contents\` — single-file read; preferred over cloning
-->

## Gotchas

<!-- Add server-specific corrections here as you encounter them. Examples:
     - Default page size is 30; pass perPage=100 for fewer round trips
     - Tool X requires auth scope Y; without it the call returns 200 with empty data
-->

## Related skills

<!-- Cross-reference workflow skills that build on this server. Example:
     - \`github-issue-analyzer\` — pre-built workflow for analyzing repo issues
-->
`;
}

// Build a JSDoc block from tool.description + tool.annotations.
// Annotation defaults follow the MCP spec (readOnlyHint=false, destructiveHint=true,
// idempotentHint=false, openWorldHint=true) so the agent always sees effective values
// even when the server omits them.
function buildJsDoc(tool: any): string {
  const ann = tool.annotations ?? {};
  const lines: string[] = [];

  if (ann.title) {
    lines.push(String(ann.title));
    if (tool.description) {
      lines.push('');
      lines.push(...String(tool.description).split('\n'));
    }
  } else {
    lines.push(...String(tool.description || 'No description provided').split('\n'));
  }

  const readOnly = ann.readOnlyHint ?? false;
  const destructive = ann.destructiveHint ?? true;
  const idempotent = ann.idempotentHint ?? false;
  const openWorld = ann.openWorldHint ?? true;

  const note = (key: string) => (key in ann ? '' : ' [default]');

  lines.push('');
  lines.push('Behavior hints:');
  lines.push(`- Read-only: ${readOnly}${note('readOnlyHint')} (${readOnly ? 'does not modify state' : 'may modify state'})`);
  if (!readOnly) {
    lines.push(`- Destructive: ${destructive}${note('destructiveHint')} (${destructive ? 'may perform non-additive updates' : 'additive only'})`);
    lines.push(`- Idempotent: ${idempotent}${note('idempotentHint')} (${idempotent ? 'safe to retry' : 'repeated calls may have additional effects'})`);
  }
  lines.push(`- Open-world: ${openWorld}${note('openWorldHint')} (${openWorld ? 'interacts with external entities' : 'closed domain'})`);

  return lines
    .map(l => (l ? ` * ${l.replace(/\*\//g, '* /')}` : ' *'))
    .join('\n');
}

async function generateToolWrapper(serverName: string, tool: any): Promise<string> {
  const toolName = tool.name.replace(/^.*__/, '');
  const pascalName = toPascalCase(toolName);

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

  const jsDoc = buildJsDoc(tool);

  return `// Auto-generated wrapper for ${tool.name}
import { callMCPTool } from "../client.js";

${inputInterface}
${outputInterface}
/**
${jsDoc}
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
