#!/usr/bin/env tsx
import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface MetricsData {
  timestamp: string;
  mode: 'code-execution' | 'direct-mcp';
  timing: {
    totalElapsedMs: number;
    sdkDurationMs: number;
    apiDurationMs: number;
    overheadMs: number;
  };
  tokens: {
    input: number;
    output: number;
    cacheRead: number;
    cacheCreation: number;
    total: number;
  };
  cost: number;
  turns: number;
  modelUsage: {
    [modelId: string]: {
      inputTokens: number;
      outputTokens: number;
      cacheReadInputTokens: number;
      cacheCreationInputTokens: number;
      costUSD: number;
      contextWindow: number;
    };
  };
}

interface WorkspaceFile {
  path: string;
  name: string;
  size: number;
  excerpt?: string;
}

interface RunData {
  sessionId: string;
  isFailed: boolean;
  status: 'success' | 'error';
  mode: 'code-execution' | 'direct-mcp';
  metrics: MetricsData;
  workspaceFiles: WorkspaceFile[];
  errorMessage?: string;
}

interface AggregatedMetrics {
  count: number;
  successCount: number;
  failureCount: number;
  failureRate: number;
  avgDuration: number;
  minDuration: number;
  maxDuration: number;
  avgCost: number;
  totalCost: number;
  avgTurns: number;
  avgTokens: {
    input: number;
    output: number;
    cacheRead: number;
    cacheCreation: number;
    total: number;
  };
  runs: RunData[];
}

interface FailureSummary {
  codeExecution: {
    failedCount: number;
    failureRate: number;
  };
  directMcp: {
    failedCount: number;
    failureRate: number;
  };
  totalFailures: number;
}

interface ComparisonData {
  codeExecution: AggregatedMetrics;
  directMcp: AggregatedMetrics;
  failureSummary: FailureSummary;
  extractedAt: string;
  zipPath: string;
}

/**
 * Extracts a zip file to a temporary directory
 */
async function extractZip(zipPath: string): Promise<string> {
  const tempDir = path.join(process.cwd(), '.temp-comparison-extract');
  await fs.mkdir(tempDir, { recursive: true });

  console.log(`Extracting ${zipPath} to ${tempDir}...`);
  await execAsync(`unzip -q -o "${zipPath}" -d "${tempDir}"`);

  return tempDir;
}

/**
 * Recursively discovers all files in a directory
 */
async function discoverFiles(dir: string, baseDir: string = dir): Promise<string[]> {
  const files: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await discoverFiles(fullPath, baseDir));
    } else {
      files.push(path.relative(baseDir, fullPath));
    }
  }

  return files;
}

/**
 * Extracts the first N characters from a file (for excerpts)
 */
async function extractExcerpt(filePath: string, maxChars: number = 500): Promise<string> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return content.slice(0, maxChars);
  } catch (error) {
    return `[Error reading file: ${error}]`;
  }
}

/**
 * Parses a metrics JSON file
 */
async function parseMetrics(filePath: string): Promise<MetricsData> {
  const content = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(content);
}

/**
 * Catalogs workspace archive files with metadata
 */
async function catalogWorkspaceFiles(workspaceDir: string, extractDir: string): Promise<WorkspaceFile[]> {
  const files: WorkspaceFile[] = [];

  try {
    const entries = await fs.readdir(workspaceDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isFile()) {
        const fullPath = path.join(workspaceDir, entry.name);
        const stat = await fs.stat(fullPath);

        // Extract excerpt for text files
        let excerpt: string | undefined;
        if (entry.name.endsWith('.md') || entry.name.endsWith('.json') || entry.name.endsWith('.txt')) {
          excerpt = await extractExcerpt(fullPath, 500);
        }

        files.push({
          path: path.relative(extractDir, fullPath),
          name: entry.name,
          size: stat.size,
          excerpt
        });
      }
    }
  } catch (error) {
    console.log(`Note: Could not catalog workspace directory ${workspaceDir}: ${error}`);
  }

  return files;
}

/**
 * Aggregates metrics for a specific mode (successful runs only)
 */
function aggregateMetrics(allRuns: RunData[]): AggregatedMetrics {
  if (allRuns.length === 0) {
    throw new Error('No runs found for aggregation');
  }

  // Separate successful and failed runs
  const successfulRuns = allRuns.filter(r => !r.isFailed);
  const failedRuns = allRuns.filter(r => r.isFailed);

  if (successfulRuns.length === 0) {
    throw new Error('No successful runs found for aggregation');
  }

  // Calculate metrics based on successful runs only
  const durations = successfulRuns.map(r => r.metrics.timing.totalElapsedMs);
  const costs = successfulRuns.map(r => r.metrics.cost);
  const turns = successfulRuns.map(r => r.metrics.turns);

  return {
    count: allRuns.length,
    successCount: successfulRuns.length,
    failureCount: failedRuns.length,
    failureRate: failedRuns.length / allRuns.length,
    avgDuration: durations.reduce((a, b) => a + b, 0) / successfulRuns.length,
    minDuration: Math.min(...durations),
    maxDuration: Math.max(...durations),
    avgCost: costs.reduce((a, b) => a + b, 0) / successfulRuns.length,
    totalCost: costs.reduce((a, b) => a + b, 0),
    avgTurns: turns.reduce((a, b) => a + b, 0) / successfulRuns.length,
    avgTokens: {
      input: successfulRuns.reduce((sum, r) => sum + r.metrics.tokens.input, 0) / successfulRuns.length,
      output: successfulRuns.reduce((sum, r) => sum + r.metrics.tokens.output, 0) / successfulRuns.length,
      cacheRead: successfulRuns.reduce((sum, r) => sum + r.metrics.tokens.cacheRead, 0) / successfulRuns.length,
      cacheCreation: successfulRuns.reduce((sum, r) => sum + r.metrics.tokens.cacheCreation, 0) / successfulRuns.length,
      total: successfulRuns.reduce((sum, r) => sum + r.metrics.tokens.total, 0) / successfulRuns.length
    },
    runs: allRuns  // Store all runs (including failed) for reference
  };
}

/**
 * Main function to compare results from a zip file
 */
export async function compareResults(zipPath: string): Promise<ComparisonData> {
  console.log('Starting comparison analysis...');

  // Extract zip
  const extractDir = await extractZip(zipPath);

  try {
    // Discover all files
    console.log('Discovering files...');
    const allFiles = await discoverFiles(extractDir);
    console.log(`Found ${allFiles.length} files`);

    // Parse all metrics files
    const metricsFiles = allFiles.filter(f => f.startsWith('metrics/') && f.endsWith('.json'));
    console.log(`Found ${metricsFiles.length} metrics files`);

    const runs: RunData[] = [];

    for (const metricFile of metricsFiles) {
      const fullPath = path.join(extractDir, metricFile);
      const metrics = await parseMetrics(fullPath);

      // Extract session ID from filename and detect FAILED__ prefix
      const filename = path.basename(metricFile, '.json');
      const isFailed = filename.startsWith('FAILED__');
      const sessionId = isFailed ? filename.slice(9) : filename; // Remove "FAILED__" prefix if present

      if (isFailed) {
        console.log(`  - Detected failed run: ${filename}`);
      }

      // Find corresponding workspace archive (may have FAILED__ prefix)
      const workspaceDir = path.join(extractDir, 'workspace_archive', filename);
      const workspaceFiles = await catalogWorkspaceFiles(workspaceDir, extractDir);

      runs.push({
        sessionId,
        isFailed,
        status: isFailed ? 'error' : 'success',
        mode: metrics.mode,
        metrics,
        workspaceFiles,
        errorMessage: isFailed ? 'Run failed (see logs for details)' : undefined
      });
    }

    console.log(`Processed ${runs.length} runs`);

    // Group by mode
    const codeExecutionRuns = runs.filter(r => r.mode === 'code-execution');
    const directMcpRuns = runs.filter(r => r.mode === 'direct-mcp');

    const totalFailed = runs.filter(r => r.isFailed).length;
    const totalSuccessful = runs.length - totalFailed;

    console.log(`Code-execution runs: ${codeExecutionRuns.length} (${codeExecutionRuns.filter(r => r.isFailed).length} failed)`);
    console.log(`Direct-MCP runs: ${directMcpRuns.length} (${directMcpRuns.filter(r => r.isFailed).length} failed)`);
    console.log(`Total: Success=${totalSuccessful}, Failed=${totalFailed}`);

    if (codeExecutionRuns.length === 0 || directMcpRuns.length === 0) {
      throw new Error('Need at least one run of each mode to compare');
    }

    // Aggregate metrics
    const codeExecutionMetrics = aggregateMetrics(codeExecutionRuns);
    const directMcpMetrics = aggregateMetrics(directMcpRuns);

    // Calculate failure summary
    const failureSummary: FailureSummary = {
      codeExecution: {
        failedCount: codeExecutionMetrics.failureCount,
        failureRate: codeExecutionMetrics.failureRate
      },
      directMcp: {
        failedCount: directMcpMetrics.failureCount,
        failureRate: directMcpMetrics.failureRate
      },
      totalFailures: codeExecutionMetrics.failureCount + directMcpMetrics.failureCount
    };

    const comparisonData: ComparisonData = {
      codeExecution: codeExecutionMetrics,
      directMcp: directMcpMetrics,
      failureSummary,
      extractedAt: new Date().toISOString(),
      zipPath
    };

    // Save raw comparison data
    const dataPath = './workspace/comparison-data.json';
    await fs.mkdir('./workspace', { recursive: true });
    await fs.writeFile(dataPath, JSON.stringify(comparisonData, null, 2));
    console.log(`Saved raw comparison data to ${dataPath}`);

    // Generate report (this will be done by the model)
    console.log('\nComparison data extracted and aggregated.');
    console.log('The model will now analyze this data and generate a comprehensive report.');

    return comparisonData;
  } finally {
    // Cleanup
    console.log('Cleaning up temporary files...');
    await fs.rm(extractDir, { recursive: true, force: true });
  }
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const zipPath = process.argv[2];
  if (!zipPath) {
    console.error('Usage: tsx implementation.ts <zip-path>');
    process.exit(1);
  }

  compareResults(zipPath)
    .then(data => {
      console.log('\nAnalysis complete');
      console.log(`  Code-execution: ${data.codeExecution.count} runs (${data.codeExecution.successCount} successful, ${data.codeExecution.failureCount} failed)`);
      console.log(`  Direct-MCP: ${data.directMcp.count} runs (${data.directMcp.successCount} successful, ${data.directMcp.failureCount} failed)`);
      if (data.failureSummary.totalFailures > 0) {
        console.log(`\n  Note: ${data.failureSummary.totalFailures} failed run(s) excluded from metrics comparison`);
      }
      console.log('\n  Data saved to ./workspace/comparison-data.json');
    })
    .catch(error => {
      console.error('Error:', error.message);
      process.exit(1);
    });
}
