// Utility to ensure MCP wrappers are available at agent startup
import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

interface GenerationMetadata {
  generatedAt: string;
  serverName: string;
  toolCount: number;
  generationDurationMs: number;
  hasInstructions: boolean;
}

interface WrapperStatus {
  serverName: string;
  exists: boolean;
  metadata: GenerationMetadata | null;
  ageMs: number | null;
  toolCount: number;
}

const STALE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

async function checkWrapperStatus(serverName: string): Promise<WrapperStatus> {
  const serverDir = `./servers/${serverName}`;

  try {
    const files = await fs.readdir(serverDir);
    const hasIndex = files.includes('index.ts');
    const wrapperFiles = files.filter(f => f.endsWith('.ts') && f !== 'index.ts');

    if (!hasIndex || wrapperFiles.length === 0) {
      return {
        serverName,
        exists: false,
        metadata: null,
        ageMs: null,
        toolCount: 0
      };
    }

    // Try to read metadata
    let metadata: GenerationMetadata | null = null;
    let ageMs: number | null = null;

    try {
      const metadataPath = path.join(serverDir, '.metadata.json');
      const data = await fs.readFile(metadataPath, 'utf-8');
      metadata = JSON.parse(data);
      if (metadata) {
        ageMs = Date.now() - new Date(metadata.generatedAt).getTime();
      }
    } catch {
      // No metadata file, that's okay
    }

    return {
      serverName,
      exists: true,
      metadata,
      ageMs,
      toolCount: wrapperFiles.length
    };
  } catch {
    return {
      serverName,
      exists: false,
      metadata: null,
      ageMs: null,
      toolCount: 0
    };
  }
}

async function runGeneration(timeoutMs: number = 10000): Promise<{ success: boolean; output: string }> {
  return new Promise((resolve) => {
    const child = spawn('npm', ['run', 'generate-wrappers', '--', '--fallback', `--timeout=${timeoutMs}`], {
      shell: true,
      stdio: 'pipe',
      timeout: timeoutMs + 5000 // Give extra time for process overhead
    });

    let output = '';

    child.stdout?.on('data', (data) => {
      output += data.toString();
    });

    child.stderr?.on('data', (data) => {
      output += data.toString();
    });

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      resolve({ success: false, output: output + '\nProcess timed out' });
    }, timeoutMs + 5000);

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ success: code === 0, output });
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ success: false, output: `Failed to start generation: ${err.message}` });
    });
  });
}

export interface EnsureWrappersOptions {
  regenerate?: boolean;
  timeoutMs?: number;
  verbose?: boolean;
}

export interface EnsureWrappersResult {
  success: boolean;
  servers: WrapperStatus[];
  regenerated: boolean;
  warnings: string[];
  errors: string[];
}

export async function ensureWrappers(options: EnsureWrappersOptions = {}): Promise<EnsureWrappersResult> {
  const {
    regenerate = true,
    timeoutMs = 10000,
    verbose = true
  } = options;

  const result: EnsureWrappersResult = {
    success: true,
    servers: [],
    regenerated: false,
    warnings: [],
    errors: []
  };

  if (verbose) {
    console.log('[Wrappers] Checking MCP wrapper status...');
  }

  // Get list of servers from config
  let serverNames: string[] = [];
  try {
    const configText = await fs.readFile('.mcp.json', 'utf-8');
    const config = JSON.parse(configText);
    serverNames = Object.keys(config.mcpServers || {});
  } catch (err) {
    result.errors.push('Failed to read .mcp.json configuration');
    result.success = false;
    return result;
  }

  // Check current status
  for (const serverName of serverNames) {
    const status = await checkWrapperStatus(serverName);
    result.servers.push(status);
  }

  // Determine if regeneration is needed
  const missingServers = result.servers.filter(s => !s.exists);
  const staleServers = result.servers.filter(
    s => s.exists && s.ageMs !== null && s.ageMs > STALE_THRESHOLD_MS
  );

  if (missingServers.length > 0 && verbose) {
    console.log(`[Wrappers] Missing wrappers for: ${missingServers.map(s => s.serverName).join(', ')}`);
  }

  if (staleServers.length > 0) {
    for (const server of staleServers) {
      const days = Math.floor((server.ageMs || 0) / (24 * 60 * 60 * 1000));
      result.warnings.push(`Wrappers for ${server.serverName} are ${days} days old`);
      if (verbose) {
        console.log(`[Wrappers] Warning: ${server.serverName} wrappers are ${days} days old`);
      }
    }
  }

  // Attempt regeneration if requested
  if (regenerate && (missingServers.length > 0 || staleServers.length > 0 || options.regenerate)) {
    if (verbose) {
      console.log(`[Wrappers] Attempting to regenerate wrappers (timeout: ${timeoutMs}ms)...`);
    }

    const { success, output } = await runGeneration(timeoutMs);
    result.regenerated = true;

    if (success) {
      if (verbose) {
        console.log('[Wrappers] Regeneration successful');
      }
      // Re-check status after regeneration
      result.servers = [];
      for (const serverName of serverNames) {
        const status = await checkWrapperStatus(serverName);
        result.servers.push(status);
      }
    } else {
      if (verbose) {
        console.log('[Wrappers] Regeneration failed, checking for fallback...');
      }

      // Check if we have fallback wrappers
      const stillMissing = result.servers.filter(s => !s.exists);
      if (stillMissing.length > 0) {
        result.errors.push(
          `Failed to regenerate wrappers and no fallback available for: ${stillMissing.map(s => s.serverName).join(', ')}`
        );
        result.success = false;
      } else {
        result.warnings.push('Regeneration failed but using cached wrappers');
        if (verbose) {
          console.log('[Wrappers] Using cached wrappers as fallback');
        }
      }
    }
  } else if (missingServers.length > 0) {
    result.errors.push(
      `Missing wrappers for: ${missingServers.map(s => s.serverName).join(', ')}`
    );
    result.success = false;
  }

  // Final status report
  if (verbose) {
    console.log('[Wrappers] Status:');
    for (const server of result.servers) {
      if (server.exists) {
        const age = server.ageMs
          ? `${Math.floor(server.ageMs / (60 * 60 * 1000))}h old`
          : 'unknown age';
        console.log(`  ${server.serverName}: ${server.toolCount} tools (${age})`);
      } else {
        console.log(`  ${server.serverName}: MISSING`);
      }
    }
  }

  return result;
}

// CLI usage
if (process.argv[1]?.includes('ensure-wrappers')) {
  const verbose = !process.argv.includes('--quiet');
  const skipRegenerate = process.argv.includes('--no-regenerate');
  const timeout = parseInt(
    process.argv.find(a => a.startsWith('--timeout='))?.split('=')[1] || '10000'
  );

  ensureWrappers({
    regenerate: !skipRegenerate,
    timeoutMs: timeout,
    verbose
  }).then(result => {
    if (!result.success) {
      console.error('[Wrappers] Failed to ensure wrappers are available');
      process.exit(1);
    }
    console.log('[Wrappers] All wrappers available');
  }).catch(err => {
    console.error('[Wrappers] Error:', err);
    process.exit(1);
  });
}
