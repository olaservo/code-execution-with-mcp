# Compare Code-Execution vs Direct-MCP Results

## Objective
Analyze and compare the performance, efficiency, and output quality between code-execution and direct-MCP approaches for GitHub issue analysis tasks.

## Input
Path to a results zip file containing comparison data: `/Users/x3d2/claude-agent-sdk-experiments/example_results/claude_code_repo_results-2025-11-18T16-07-57-3NZ.zip`

**Note:** To analyze different results, the human should edit the path above in this task file.

## Zip File Structure
The zip file contains multiple test runs with:
- `metrics/*.json` - Performance metrics (duration, cost, tokens)
- `metrics/FAILED__*.json` - Metrics from failed runs (prefixed with `FAILED__`)
- `logs/*.json` - Detailed execution logs with tool calls
- `logs/FAILED__*.json` - Logs from failed runs (prefixed with `FAILED__`)
- `logs/*.md` - Human-readable execution summaries
- `workspace_archive/*/` - Output files from each run (structure varies)
- `workspace_archive/FAILED__*/` - Archives from failed runs (prefixed with `FAILED__`)

## Task Instructions

### 1. Extract and Parse Data
- Unzip the provided results file
- Discover all files using flexible scanning (structure varies)
- **Check for FAILED__ prefix** in session IDs (both in metrics and logs filenames)
- Separate successful runs from failed runs based on this prefix
- Parse all metrics and logs JSON files
- Catalog workspace_archive contents with metadata

### 2. Aggregate Metrics
**Important**: Calculate metrics using **successful runs only** for fair comparison.

Calculate for both approaches:
- **Success/Failure Rates**: Count of successful vs failed runs, failure percentage
- **Performance** (successful runs only): Duration (avg, min, max), turns, execution patterns
- **Cost** (successful runs only): Total cost in USD, cost per run
- **Token Usage** (successful runs only): Input, output, cache read, cache creation
- **Efficiency Ratios**: Compare code-execution vs direct-mcp

### 3. Analyze Outputs (Hybrid Approach)
- Extract metadata: file counts, sizes, record counts
- Pull key excerpts from reports (first 500 chars, executive summaries)
- Read full reports when needed for quality assessment
- Compare completeness and accuracy

### 4. Generate Comparison Report

Save to: `./workspace/comparison-analysis-report.md`

**Report Structure:**
- **Executive Summary**
  - Key findings and recommendation
  - Performance winner and by how much
  - Note any failed runs and their impact on the analysis

- **Run Success Rates**
  - Success/failure count and rate for each approach
  - Note that main metrics compare successful runs only
  - Mention if failures indicate reliability concerns

- **Performance Comparison**
  - Side-by-side metrics table (successful runs only)
  - Duration comparison (with ratios)
  - Cost comparison (with ratios)
  - Token efficiency analysis
  - Clear indication that failed runs are excluded

- **Approach Analysis**
  - Code-execution approach: How it works, pros/cons
  - Direct-MCP approach: How it works, pros/cons
  - Execution pattern differences

- **Output Quality Assessment**
  - Completeness comparison
  - Accuracy assessment (if verifiable)
  - Format and usability

- **Recommendations**
  - When to use code-execution
  - When to use direct-MCP
  - Trade-offs and considerations

- **Detailed Metrics**
  - Full breakdown by run
  - Model usage details
  - Cache utilization patterns

### 5. Save Raw Data
Save to: `./workspace/comparison-data.json`

Include:
- Aggregated metrics by approach
- File catalog from workspace_archive
- Raw performance data per run

## Usage

Use the `results-comparison-analyzer` skill:

```typescript
import { compareResults } from './.claude/skills/results-comparison-analyzer/implementation';

const zipPath = './example_results/anthropic_sdk_python_repo_results-2025-11-20T06-22-50-300Z.zip';
await compareResults(zipPath);
```

## Expected Outputs

1. **Comprehensive comparison report** showing which approach performs better
2. **Actionable recommendations** for when to use each approach
3. **Raw data** for further analysis or verification
4. **Success/failure analysis** showing reliability of each approach