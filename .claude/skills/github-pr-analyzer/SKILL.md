---
name: github-pr-analyzer
description: Use when the task involves analyzing pull requests in a GitHub repository for staleness, age distribution, or identifying PRs that need attention. Fetches all open PRs with pagination and generates comprehensive reports with actionable recommendations.
---

# GitHub PR Analyzer

Analyzes pull requests in any GitHub repository to identify stale PRs, age distribution, and provide actionable recommendations for PR triage.

## When to Use

Use this skill when you need to:
- Identify stale or abandoned pull requests (30+ days without updates)
- Analyze PR age distribution across different staleness buckets
- Generate reports for PR triage sessions
- Find PRs that need review attention
- Create actionable recommendations for maintainers

## Instructions

### Basic Usage

```typescript
import { analyzeStalePRs } from './.claude/skills/github-pr-analyzer/implementation';

const result = await analyzeStalePRs('owner', 'repo', {
  outputDir: './workspace',
  staleDays: 30
});

console.log(`Total open PRs: ${result.stats.totalOpen}`);
console.log(`Stale PRs: ${result.stats.staleCount}`);
console.log(`Report saved to: ${result.reportPath}`);
```

### Options

- `outputDir`: Directory to save report and raw data (default: `./workspace`)
- `staleDays`: Number of days to consider a PR stale (default: `30`)

### Output Files

The skill generates two files:

1. **`stale-pr-report.md`**: Markdown report with:
   - Summary statistics
   - Age distribution table
   - Top 10 most stale PRs
   - Recommended next actions

2. **`open-prs.json`**: Raw PR data for custom analysis

### Report Structure

The generated report includes:

- **Summary**: Total open PRs and stale PR count with percentage
- **Age Distribution**: Breakdown into buckets:
  - Fresh (< 30 days)
  - Stale (30–60 days)
  - Very stale (60–90 days)
  - Abandoned-looking (> 90 days)
- **Top Stale PRs**: 10 PRs with longest time since last update
- **Recommendations**: Prioritized action items for triage

## Examples

### Analyze with Custom Staleness Threshold

```typescript
// Consider PRs stale after 14 days
const result = await analyzeStalePRs('anthropics', 'anthropic-sdk-python', {
  staleDays: 14
});
```

### Custom Output Directory

```typescript
const result = await analyzeStalePRs('owner', 'repo', {
  outputDir: './reports/pr-analysis'
});
```

## Gotchas

- **Pagination**: The skill automatically handles pagination, fetching up to 100 PRs per page. This works for repositories with thousands of PRs.
- **Rate Limiting**: GitHub API has rate limits. For large repositories (1000+ PRs), consider authenticating to get higher rate limits.
- **Draft PRs**: Draft PRs are included in the analysis and marked in the report. You may want to filter these differently in custom analysis.
- **Updated vs. Created**: Staleness is based on `updated_at`, not `created_at`. A PR can be old but recently active.
- **Working Directory**: The script must be run from the project root (where `.mcp.json` exists), not from subdirectories.

## Dependencies

- **MCP Tools**: `list_pull_requests` from the github server
- **Node.js**: Built-in `fs/promises` for file operations
- **TypeScript**: Uses `tsx` for execution

## Related Skills

- `github-issue-analyzer`: Analyze repository issues instead of PRs
- `comprehensive-issue-analyzer`: Deep analysis of issues with pagination
