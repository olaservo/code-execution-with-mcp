# Identify Stale Pull Requests

## Objective
Identify open pull requests in the target repository that haven't been updated in 30 or more days. These are stale PRs that may need a review nudge or closing.

## Target Repository
- Owner: anthropics
- Repo: anthropic-sdk-python

## Requirements

### Data Collection
- Fetch ALL open pull requests (paginated, perPage: 100)
- Include for each PR: number, title, author (user.login), draft status, created_at, updated_at

### Analysis
- Total count of open PRs
- Stale PR count (no activity in 30+ days)
- Age distribution by staleness bucket:
  - Fresh (< 30 days)
  - Stale (30–60 days)
  - Very stale (60–90 days)
  - Abandoned-looking (> 90 days)
- Top 10 most-stale open PRs (number, title, author, days since last update)

## Output
- Save report to: `./workspace/stale-pr-report.md`
- Save raw data to: `./workspace/open-prs.json`

Report should include the analysis above plus a short "Recommended next actions" section.

## Notes
This task does not have a pre-built workflow skill. Use server-scoped skills (if any exist for the relevant MCP server) to discover the right tools.
