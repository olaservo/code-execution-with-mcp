---
name: mcp-code-execution-results-comparison-analyzer
description: Analyzes experimental results comparing code-execution vs direct-MCP approaches for any task. Extracts performance metrics, execution logs, and workspace outputs from zip archives to generate detailed comparison reports.  Use when you have a results zip file and need to compare code-execution vs direct-MCP performance, cost, and output quality for any task.
---

# MCP vs Code Execution Results Comparison Analyzer

## Instructions

This skill analyzes zip files containing experimental comparison data between code-execution and direct-MCP approaches. It extracts performance metrics, execution logs, and workspace outputs to generate comprehensive comparison reports with actionable recommendations.

### Usage

1. Provide the path to a results zip file
2. The skill extracts and discovers all files (adapts to varying structures)
3. Parses metrics, logs, and catalogs workspace outputs
4. Generates comparison report and saves data to `./workspace/`

### Features

- **Flexible Discovery**: Automatically scans and adapts to any zip structure
- **Performance Metrics**: Duration, cost, token usage, efficiency ratios
- **Output Quality Assessment**: Compares completeness and accuracy of results
- **Hybrid Analysis**: Script aggregates data, model performs semantic comparison
- **Actionable Recommendations**: Clear guidance on when to use each approach

### Comparison Dimensions

The skill compares both approaches across:
- **Performance**: Execution time, number of turns, patterns
- **Cost**: USD per run, token costs, cache utilization
- **Token Efficiency**: Input/output/cache ratios
- **Output Quality**: Completeness, accuracy, format (by reading workspace files)

## Examples

```typescript
import { compareResults } from './.claude/skills/results-comparison-analyzer/implementation';

// Analyze a results zip file
const zipPath = './example_results/task_results-2025-11-20T06-22-50-300Z.zip';
await compareResults(zipPath);

// The function will:
// 1. Extract and parse all metrics and logs
// 2. Catalog workspace outputs with excerpts
// 3. Aggregate statistics by approach
// 4. Save comparison-data.json
// 5. Return structured data for model analysis
```

## Output Files

The skill automatically saves:
- `./workspace/comparison-data.json` - Aggregated metrics, file catalog, raw data
- `./workspace/comparison-analysis-report.md` - Comprehensive comparison report with:
  - Executive summary with key findings
  - Side-by-side performance comparison tables
  - Approach analysis (pros/cons)
  - Output quality assessment
  - Recommendations for when to use each approach

## Changelog

- 2025-11-19: Initial version - flexible discovery and hybrid analysis
