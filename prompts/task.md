# Analyze ALL Open Claude Code Issues

## Objective
Create a comprehensive analysis of ALL open issues in the Claude Code repository.

## Target Repository
- Owner: anthropics
- Repo: claude-code

## Requirements

### Data Collection
- Fetch ALL open issues (not just recent ones)
- Get a count of the total number of issues in the repo to confirm you know exactly how many TOTAL issues are open.
- Use pagination to get complete dataset (perPage: 100)
- Include: number, title, state, labels, comments count, updated_at, created_at, body (first 200 chars)
- Continue fetching until all open issues are retrieved

### Analysis Requirements
- **Total count** of all open issues
- **Category breakdown** by labels (bug, enhancement, documentation, etc.)
- **Age analysis**: Group by age (< 1 week, < 1 month, < 3 months, > 3 months)
- **Activity analysis**: Sort by comment count to find most discussed
- **Stale issues**: Identify issues with no activity in 30+ days

### Prioritization Criteria
- **CRITICAL**: Open bugs with >5 comments
- **HIGH PRIORITY**: Open bugs OR issues with >3 comments
- **MEDIUM PRIORITY**: Open enhancements with recent activity (< 2 weeks)
- **LOW PRIORITY**: Older or less active issues
- **STALE**: No updates in 30+ days

## Output
Save report to: `./workspace/claude-code-issue-report.md`

Report should include:
- Executive summary with total open issues count
- Category breakdown (e.g., X bugs, Y enhancements, Z questions, etc.)
- Age distribution (issues by time buckets)
- Top 10 most discussed issues (by comment count)
- Top 10 oldest open issues (potential stale)
- Top 10 newest issues (recent activity)
- Count of stale issues (>30 days no activity)
- Recommendations for issue triage priorities
- Save raw data to `./workspace/claude-code-issues.json` for reference

## IMPORTANT
You MUST analyze the repo using data from ALL issues, not just a sample.
