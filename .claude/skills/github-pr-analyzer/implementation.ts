import * as github from '../../servers/github';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface PullRequest {
  number: number;
  title: string;
  user: { login: string } | null;
  draft: boolean;
  created_at: string;
  updated_at: string;
}

export interface StalePRInfo {
  number: number;
  title: string;
  author: string;
  daysSinceUpdate: number;
  isDraft: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StalenessStats {
  totalOpen: number;
  staleCount: number;
  fresh: number;
  stale30to60: number;
  stale60to90: number;
  stale90plus: number;
  topStale: StalePRInfo[];
}

export interface AnalyzePRsOptions {
  outputDir?: string;
  staleDays?: number;
}

export interface AnalyzePRsResult {
  stats: StalenessStats;
  reportPath: string;
  dataPath: string;
}

/**
 * Fetch all open pull requests with pagination
 */
export async function fetchAllPullRequests(
  owner: string,
  repo: string
): Promise<PullRequest[]> {
  const allPRs: PullRequest[] = [];
  let page = 1;
  const perPage = 100;

  console.log(`Fetching open PRs from ${owner}/${repo}...`);

  while (true) {
    const response = await github.list_pull_requests({
      owner,
      repo,
      state: 'open',
      page,
      perPage,
    });

    if (!response || !Array.isArray(response) || response.length === 0) {
      break;
    }

    console.log(`  Page ${page}: ${response.length} PRs`);
    allPRs.push(...response);

    if (response.length < perPage) {
      break;
    }

    page++;
  }

  console.log(`Total open PRs fetched: ${allPRs.length}\n`);
  return allPRs;
}

/**
 * Calculate days since a date
 */
export function daysSince(dateString: string): number {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Analyze staleness of pull requests
 */
export function analyzeStaleness(
  prs: PullRequest[],
  staleDays: number = 30
): StalenessStats {
  let fresh = 0;
  let stale30to60 = 0;
  let stale60to90 = 0;
  let stale90plus = 0;
  let staleCount = 0;

  const prsByDays = prs.map((pr) => {
    const daysSinceUpdate = daysSince(pr.updated_at);
    return {
      number: pr.number,
      title: pr.title,
      author: pr.user?.login || 'unknown',
      daysSinceUpdate,
      isDraft: pr.draft,
      createdAt: pr.created_at,
      updatedAt: pr.updated_at,
    };
  });

  prsByDays.forEach((pr) => {
    const days = pr.daysSinceUpdate;
    if (days < staleDays) {
      fresh++;
    } else if (days < 60) {
      stale30to60++;
      staleCount++;
    } else if (days < 90) {
      stale60to90++;
      staleCount++;
    } else {
      stale90plus++;
      staleCount++;
    }
  });

  const topStale = prsByDays
    .filter((pr) => pr.daysSinceUpdate >= staleDays)
    .sort((a, b) => b.daysSinceUpdate - a.daysSinceUpdate)
    .slice(0, 10);

  return {
    totalOpen: prs.length,
    staleCount,
    fresh,
    stale30to60,
    stale60to90,
    stale90plus,
    topStale,
  };
}

/**
 * Generate markdown report
 */
export function generateMarkdownReport(
  owner: string,
  repo: string,
  stats: StalenessStats,
  staleDays: number = 30
): string {
  const md: string[] = [];

  md.push('# Stale Pull Request Report');
  md.push('');
  md.push(`**Repository:** ${owner}/${repo}`);
  md.push(`**Report Generated:** ${new Date().toISOString()}`);
  md.push('');

  md.push('## Summary');
  md.push('');
  md.push(`- **Total Open PRs:** ${stats.totalOpen}`);
  md.push(
    `- **Stale PRs (${staleDays}+ days):** ${stats.staleCount} (${((stats.staleCount / stats.totalOpen) * 100).toFixed(1)}%)`
  );
  md.push('');

  md.push('## Age Distribution');
  md.push('');
  md.push('| Age Bucket | Count | Percentage |');
  md.push('|------------|-------|------------|');
  md.push(
    `| Fresh (< ${staleDays} days) | ${stats.fresh} | ${((stats.fresh / stats.totalOpen) * 100).toFixed(1)}% |`
  );
  md.push(
    `| Stale (${staleDays}–60 days) | ${stats.stale30to60} | ${((stats.stale30to60 / stats.totalOpen) * 100).toFixed(1)}% |`
  );
  md.push(
    `| Very stale (60–90 days) | ${stats.stale60to90} | ${((stats.stale60to90 / stats.totalOpen) * 100).toFixed(1)}% |`
  );
  md.push(
    `| Abandoned-looking (> 90 days) | ${stats.stale90plus} | ${((stats.stale90plus / stats.totalOpen) * 100).toFixed(1)}% |`
  );
  md.push('');

  md.push('## Top 10 Most Stale Open PRs');
  md.push('');
  md.push(
    '| PR # | Title | Author | Days Since Update | Draft | Created | Updated |'
  );
  md.push(
    '|------|-------|--------|-------------------|-------|---------|---------|'
  );

  stats.topStale.forEach((pr) => {
    const draftBadge = pr.isDraft ? '✓' : '';
    md.push(
      `| #${pr.number} | ${pr.title} | @${pr.author} | ${pr.daysSinceUpdate} | ${draftBadge} | ${pr.createdAt.split('T')[0]} | ${pr.updatedAt.split('T')[0]} |`
    );
  });
  md.push('');

  md.push('## Recommended Next Actions');
  md.push('');
  md.push('### High Priority');
  md.push('');
  md.push(
    `1. **Review abandoned PRs (${stats.stale90plus} PRs > 90 days old):** These PRs may need to be closed or require a significant nudge to move forward. Consider:`
  );
  md.push('   - Checking if the work is still relevant');
  md.push('   - Pinging the author for status');
  md.push('   - Closing with explanation if no longer needed');
  md.push('');
  md.push(
    `2. **Triage very stale PRs (${stats.stale60to90} PRs 60–90 days old):** These are at risk of becoming abandoned. Consider:`
  );
  md.push('   - Reviewing for quick merge opportunities');
  md.push('   - Requesting updates from authors');
  md.push('   - Assigning reviewers if not already assigned');
  md.push('');

  md.push('### Medium Priority');
  md.push('');
  md.push(
    `3. **Check stale PRs (${stats.stale30to60} PRs ${staleDays}–60 days old):** These need attention before they become very stale:`
  );
  md.push('   - Review feedback status');
  md.push('   - Ensure reviewers are assigned');
  md.push('   - Follow up on pending feedback');
  md.push('');

  md.push('### Process Improvements');
  md.push('');
  md.push('Consider implementing:');
  md.push(
    '- Automated stale PR reminders (e.g., GitHub Actions workflow)'
  );
  md.push('- PR review SLA guidelines');
  md.push('- Regular PR triage sessions for the team');
  md.push('- Draft PR cleanup policy');
  md.push('');

  return md.join('\n');
}

/**
 * Main function to analyze stale PRs and generate reports
 */
export async function analyzeStalePRs(
  owner: string,
  repo: string,
  options: AnalyzePRsOptions = {}
): Promise<AnalyzePRsResult> {
  const { outputDir = './workspace', staleDays = 30 } = options;

  // Ensure output directory exists
  await fs.mkdir(outputDir, { recursive: true });

  // Fetch all open PRs
  const prs = await fetchAllPullRequests(owner, repo);

  // Save raw data
  const dataPath = path.join(outputDir, 'open-prs.json');
  console.log(`Saving raw PR data to ${dataPath}...`);
  await fs.writeFile(dataPath, JSON.stringify(prs, null, 2));

  // Analyze staleness
  console.log('Analyzing PR staleness...');
  const stats = analyzeStaleness(prs, staleDays);

  // Generate report
  console.log('Generating markdown report...');
  const report = generateMarkdownReport(owner, repo, stats, staleDays);

  // Save report
  const reportPath = path.join(outputDir, 'stale-pr-report.md');
  console.log(`Saving report to ${reportPath}...`);
  await fs.writeFile(reportPath, report);

  console.log('\n✓ Analysis complete!');
  console.log(`  - Total open PRs: ${stats.totalOpen}`);
  console.log(`  - Stale PRs (${staleDays}+ days): ${stats.staleCount}`);
  console.log(`  - Report: ${reportPath}`);
  console.log(`  - Raw data: ${dataPath}`);

  return {
    stats,
    reportPath,
    dataPath,
  };
}
