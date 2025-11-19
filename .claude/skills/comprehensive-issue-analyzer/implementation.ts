#!/usr/bin/env node
import * as github from '../../../servers/github/index.js';
import * as fs from 'fs/promises';

interface Issue {
  number: number;
  title: string;
  state: string;
  labels: { name: string }[];
  comments: number;
  updatedAt: string;
  createdAt: string;
  updated_at?: string;
  created_at?: string;
  body: string;
  url: string;
}

interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

interface IssueAnalysis {
  totalCount: number;
  categoryBreakdown: { [key: string]: number };
  ageBreakdown: {
    lessThan1Week: number;
    lessThan1Month: number;
    lessThan3Months: number;
    moreThan3Months: number;
  };
  topDiscussed: Issue[];
  oldestIssues: Issue[];
  newestIssues: Issue[];
  staleIssues: Issue[];
  prioritizedIssues: {
    critical: Issue[];
    high: Issue[];
    medium: Issue[];
    low: Issue[];
    stale: Issue[];
  };
}

async function fetchAllOpenIssues(owner: string, repo: string): Promise<Issue[]> {
  const allIssues: Issue[] = [];
  let hasNextPage = true;
  let cursor: string | undefined = undefined;
  let pageCount = 0;

  console.log(`Fetching all open issues from ${owner}/${repo}...`);

  while (hasNextPage) {
    pageCount++;
    console.log(`Fetching page ${pageCount}...`);

    const response = await github.list_issues({
      owner,
      repo,
      state: 'OPEN',
      perPage: 100,
      after: cursor,
      orderBy: 'CREATED_AT',
      direction: 'DESC'
    });

    const issues = response.issues || [];
    const pageInfo: PageInfo = response.pageInfo || { hasNextPage: false, endCursor: null };

    console.log(`Retrieved ${issues.length} issues on page ${pageCount}`);
    allIssues.push(...issues);

    hasNextPage = pageInfo.hasNextPage;
    cursor = pageInfo.endCursor || undefined;

    // Safety check to prevent infinite loops
    if (pageCount > 100) {
      console.warn('Reached 100 pages, stopping pagination');
      break;
    }
  }

  console.log(`\nTotal open issues fetched: ${allIssues.length}`);
  return allIssues;
}

function analyzeIssues(issues: Issue[]): IssueAnalysis {
  const now = new Date();
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Category breakdown
  const categoryBreakdown: { [key: string]: number } = {};

  // Age breakdown
  const ageBreakdown = {
    lessThan1Week: 0,
    lessThan1Month: 0,
    lessThan3Months: 0,
    moreThan3Months: 0
  };

  // Prioritized issues
  const prioritizedIssues = {
    critical: [] as Issue[],
    high: [] as Issue[],
    medium: [] as Issue[],
    low: [] as Issue[],
    stale: [] as Issue[]
  };

  const staleIssues: Issue[] = [];

  for (const issue of issues) {
    // Category breakdown
    const labels = issue.labels || [];
    if (labels.length === 0) {
      categoryBreakdown['unlabeled'] = (categoryBreakdown['unlabeled'] || 0) + 1;
    } else {
      for (const label of labels) {
        const labelName = label.name || 'unknown';
        categoryBreakdown[labelName] = (categoryBreakdown[labelName] || 0) + 1;
      }
    }

    // Age breakdown
    const createdAt = new Date(issue.createdAt || issue.created_at);
    if (!isNaN(createdAt.getTime())) {
      if (createdAt > oneWeekAgo) {
        ageBreakdown.lessThan1Week++;
      } else if (createdAt > oneMonthAgo) {
        ageBreakdown.lessThan1Month++;
      } else if (createdAt > threeMonthsAgo) {
        ageBreakdown.lessThan3Months++;
      } else {
        ageBreakdown.moreThan3Months++;
      }
    }

    // Stale issues (no activity in 30+ days)
    const updatedAt = new Date(issue.updatedAt || issue.updated_at);
    if (!isNaN(updatedAt.getTime()) && updatedAt < thirtyDaysAgo) {
      staleIssues.push(issue);
    }

    // Prioritization
    const isBug = labels.some(l => l.name.toLowerCase().includes('bug'));
    const commentCount = issue.comments || 0;
    const updatedAtForCheck = new Date(issue.updatedAt || issue.updated_at);
    const isRecentlyUpdated = !isNaN(updatedAtForCheck.getTime()) && updatedAtForCheck > new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const isEnhancement = labels.some(l =>
      l.name.toLowerCase().includes('enhancement') ||
      l.name.toLowerCase().includes('feature')
    );
    const isStale = !isNaN(updatedAtForCheck.getTime()) && updatedAtForCheck < thirtyDaysAgo;

    if (isStale) {
      prioritizedIssues.stale.push(issue);
    } else if (isBug && commentCount > 5) {
      prioritizedIssues.critical.push(issue);
    } else if (isBug || commentCount > 3) {
      prioritizedIssues.high.push(issue);
    } else if (isEnhancement && isRecentlyUpdated) {
      prioritizedIssues.medium.push(issue);
    } else {
      prioritizedIssues.low.push(issue);
    }
  }

  // Sort by comment count for top discussed
  const topDiscussed = [...issues]
    .sort((a, b) => (b.comments || 0) - (a.comments || 0))
    .slice(0, 10);

  // Sort by creation date for oldest
  const oldestIssues = [...issues]
    .filter(i => {
      const d = new Date(i.createdAt || i.created_at);
      return !isNaN(d.getTime());
    })
    .sort((a, b) => {
      const dateA = new Date(a.createdAt || a.created_at).getTime();
      const dateB = new Date(b.createdAt || b.created_at).getTime();
      return dateA - dateB;
    })
    .slice(0, 10);

  // Sort by creation date for newest
  const newestIssues = [...issues]
    .filter(i => {
      const d = new Date(i.createdAt || i.created_at);
      return !isNaN(d.getTime());
    })
    .sort((a, b) => {
      const dateA = new Date(a.createdAt || a.created_at).getTime();
      const dateB = new Date(b.createdAt || b.created_at).getTime();
      return dateB - dateA;
    })
    .slice(0, 10);

  return {
    totalCount: issues.length,
    categoryBreakdown,
    ageBreakdown,
    topDiscussed,
    oldestIssues,
    newestIssues,
    staleIssues,
    prioritizedIssues
  };
}

function generateReport(analysis: IssueAnalysis, repo: string): string {
  let report = `# ${repo} - Comprehensive Issue Analysis\n\n`;
  report += `**Generated:** ${new Date().toISOString()}\n\n`;
  report += '---\n\n';

  // Executive Summary
  report += '## Executive Summary\n\n';
  report += `**Total Open Issues:** ${analysis.totalCount}\n\n`;

  // Category Breakdown
  report += '### Category Breakdown\n\n';
  const sortedCategories = Object.entries(analysis.categoryBreakdown)
    .sort((a, b) => b[1] - a[1]);

  for (const [category, count] of sortedCategories) {
    const percentage = ((count / analysis.totalCount) * 100).toFixed(1);
    report += `- **${category}**: ${count} issues (${percentage}%)\n`;
  }
  report += '\n';

  // Priority Summary
  report += '### Priority Summary\n\n';
  report += `- **CRITICAL** (Open bugs with >5 comments): ${analysis.prioritizedIssues.critical.length}\n`;
  report += `- **HIGH PRIORITY** (Open bugs OR >3 comments): ${analysis.prioritizedIssues.high.length}\n`;
  report += `- **MEDIUM PRIORITY** (Enhancements with recent activity): ${analysis.prioritizedIssues.medium.length}\n`;
  report += `- **LOW PRIORITY** (Other active issues): ${analysis.prioritizedIssues.low.length}\n`;
  report += `- **STALE** (No activity in 30+ days): ${analysis.prioritizedIssues.stale.length}\n\n`;

  // Age Distribution
  report += '## Age Distribution\n\n';
  report += `- **< 1 week old**: ${analysis.ageBreakdown.lessThan1Week} issues\n`;
  report += `- **1 week - 1 month old**: ${analysis.ageBreakdown.lessThan1Month} issues\n`;
  report += `- **1 month - 3 months old**: ${analysis.ageBreakdown.lessThan3Months} issues\n`;
  report += `- **> 3 months old**: ${analysis.ageBreakdown.moreThan3Months} issues\n\n`;

  // Top 10 Most Discussed Issues
  report += '## Top 10 Most Discussed Issues\n\n';
  report += 'These issues have the most community engagement:\n\n';
  for (let i = 0; i < analysis.topDiscussed.length; i++) {
    const issue = analysis.topDiscussed[i];
    const labels = (issue.labels || []).map(l => l.name).join(', ');
    const createdDate = new Date(issue.createdAt || issue.created_at);
    const age = !isNaN(createdDate.getTime())
      ? Math.floor((Date.now() - createdDate.getTime()) / (1000 * 60 * 60 * 24))
      : 'unknown';
    report += `${i + 1}. **#${issue.number}** - ${issue.title}\n`;
    report += `   - **Comments**: ${issue.comments}\n`;
    report += `   - **Labels**: ${labels || 'none'}\n`;
    report += `   - **Age**: ${age} days\n`;
    report += `   - **URL**: ${issue.url}\n\n`;
  }

  // Top 10 Oldest Open Issues
  report += '## Top 10 Oldest Open Issues\n\n';
  report += 'These issues have been open the longest:\n\n';
  for (let i = 0; i < analysis.oldestIssues.length; i++) {
    const issue = analysis.oldestIssues[i];
    const labels = (issue.labels || []).map(l => l.name).join(', ');
    const createdDate = new Date(issue.createdAt || issue.created_at);
    const updatedDate = new Date(issue.updatedAt || issue.updated_at);
    const age = !isNaN(createdDate.getTime())
      ? Math.floor((Date.now() - createdDate.getTime()) / (1000 * 60 * 60 * 24))
      : 'unknown';
    const lastUpdate = !isNaN(updatedDate.getTime())
      ? Math.floor((Date.now() - updatedDate.getTime()) / (1000 * 60 * 60 * 24))
      : 'unknown';
    const createdDateStr = !isNaN(createdDate.getTime())
      ? createdDate.toISOString().split('T')[0]
      : 'unknown';
    report += `${i + 1}. **#${issue.number}** - ${issue.title}\n`;
    report += `   - **Age**: ${age} days (opened: ${createdDateStr})\n`;
    report += `   - **Last updated**: ${lastUpdate} days ago\n`;
    report += `   - **Comments**: ${issue.comments}\n`;
    report += `   - **Labels**: ${labels || 'none'}\n`;
    report += `   - **URL**: ${issue.url}\n\n`;
  }

  // Top 10 Newest Issues
  report += '## Top 10 Newest Issues\n\n';
  report += 'Most recently opened issues:\n\n';
  for (let i = 0; i < analysis.newestIssues.length; i++) {
    const issue = analysis.newestIssues[i];
    const labels = (issue.labels || []).map(l => l.name).join(', ');
    const createdDate = new Date(issue.createdAt || issue.created_at);
    const age = !isNaN(createdDate.getTime())
      ? Math.floor((Date.now() - createdDate.getTime()) / (1000 * 60 * 60 * 24))
      : 'unknown';
    const createdDateStr = !isNaN(createdDate.getTime())
      ? createdDate.toISOString().split('T')[0]
      : 'unknown';
    report += `${i + 1}. **#${issue.number}** - ${issue.title}\n`;
    report += `   - **Created**: ${createdDateStr} (${age} days ago)\n`;
    report += `   - **Comments**: ${issue.comments}\n`;
    report += `   - **Labels**: ${labels || 'none'}\n`;
    report += `   - **URL**: ${issue.url}\n\n`;
  }

  // Stale Issues Summary
  report += '## Stale Issues Analysis\n\n';
  report += `**Total stale issues** (no activity in 30+ days): ${analysis.staleIssues.length}\n\n`;
  if (analysis.staleIssues.length > 0) {
    const stalePercentage = ((analysis.staleIssues.length / analysis.totalCount) * 100).toFixed(1);
    report += `This represents **${stalePercentage}%** of all open issues.\n\n`;

    // Show top 10 stale issues by age
    const oldestStale = [...analysis.staleIssues]
      .filter(i => {
        const d = new Date(i.updatedAt || i.updated_at);
        return !isNaN(d.getTime());
      })
      .sort((a, b) => {
        const dateA = new Date(a.updatedAt || a.updated_at).getTime();
        const dateB = new Date(b.updatedAt || b.updated_at).getTime();
        return dateA - dateB;
      })
      .slice(0, 10);

    report += '### Top 10 Most Stale Issues\n\n';
    for (let i = 0; i < oldestStale.length; i++) {
      const issue = oldestStale[i];
      const labels = (issue.labels || []).map(l => l.name).join(', ');
      const updatedDate = new Date(issue.updatedAt || issue.updated_at);
      const daysSinceUpdate = !isNaN(updatedDate.getTime())
        ? Math.floor((Date.now() - updatedDate.getTime()) / (1000 * 60 * 60 * 24))
        : 'unknown';
      const updatedDateStr = !isNaN(updatedDate.getTime())
        ? updatedDate.toISOString().split('T')[0]
        : 'unknown';
      report += `${i + 1}. **#${issue.number}** - ${issue.title}\n`;
      report += `   - **Last updated**: ${daysSinceUpdate} days ago (${updatedDateStr})\n`;
      report += `   - **Comments**: ${issue.comments}\n`;
      report += `   - **Labels**: ${labels || 'none'}\n`;
      report += `   - **URL**: ${issue.url}\n\n`;
    }
  }

  // Critical Issues
  report += '## Critical Priority Issues\n\n';
  report += `**Count**: ${analysis.prioritizedIssues.critical.length}\n\n`;
  if (analysis.prioritizedIssues.critical.length > 0) {
    report += 'Open bugs with >5 comments requiring immediate attention:\n\n';
    const sortedCritical = [...analysis.prioritizedIssues.critical]
      .sort((a, b) => (b.comments || 0) - (a.comments || 0));

    for (let i = 0; i < Math.min(10, sortedCritical.length); i++) {
      const issue = sortedCritical[i];
      const labels = (issue.labels || []).map(l => l.name).join(', ');
      report += `${i + 1}. **#${issue.number}** - ${issue.title}\n`;
      report += `   - **Comments**: ${issue.comments}\n`;
      report += `   - **Labels**: ${labels}\n`;
      report += `   - **URL**: ${issue.url}\n\n`;
    }
  }

  // Recommendations
  report += '## Recommendations for Issue Triage\n\n';
  report += '### Immediate Actions\n\n';
  if (analysis.prioritizedIssues.critical.length > 0) {
    report += `1. **Address ${analysis.prioritizedIssues.critical.length} critical bugs** - These have high community engagement (>5 comments) and likely impact multiple users\n`;
  }
  if (analysis.prioritizedIssues.high.length > 0) {
    report += `2. **Review ${analysis.prioritizedIssues.high.length} high priority issues** - Bugs or highly discussed issues needing attention\n`;
  }
  if (analysis.staleIssues.length > 0) {
    report += `3. **Triage ${analysis.staleIssues.length} stale issues** - Consider closing outdated issues or requesting updates\n`;
  }

  report += '\n### Medium-Term Actions\n\n';
  if (analysis.prioritizedIssues.medium.length > 0) {
    report += `1. **Prioritize ${analysis.prioritizedIssues.medium.length} enhancement requests** - Recent feature requests with community interest\n`;
  }
  report += `2. **Review oldest issues** - ${analysis.ageBreakdown.moreThan3Months} issues are >3 months old\n`;

  report += '\n### Process Improvements\n\n';
  const unlabeled = analysis.categoryBreakdown['unlabeled'] || 0;
  if (unlabeled > 0) {
    report += `1. **Label ${unlabeled} unlabeled issues** - Proper categorization helps with triage\n`;
  }
  const stalePercentage = ((analysis.staleIssues.length / analysis.totalCount) * 100).toFixed(1);
  report += `2. **Address stale issue rate** - ${stalePercentage}% of issues have no activity in 30+ days\n`;
  report += `3. **Monitor high-engagement issues** - Top discussions may indicate systemic issues or popular feature requests\n`;

  report += '\n---\n\n';
  report += '*Report generated by Comprehensive Issue Analyzer*\n';

  return report;
}

export async function analyzeAllIssues(owner: string, repo: string): Promise<IssueAnalysis> {
  try {
    // Fetch all open issues
    const issues = await fetchAllOpenIssues(owner, repo);

    // Save raw data
    console.log('\nSaving raw issue data...');
    await fs.writeFile(
      `./workspace/${repo}-issues.json`,
      JSON.stringify(issues, null, 2)
    );
    console.log(`✓ Saved to ./workspace/${repo}-issues.json`);

    // Analyze issues
    console.log('\nAnalyzing issues...');
    const analysis = analyzeIssues(issues);

    // Generate report
    console.log('Generating report...');
    const report = generateReport(analysis, repo);

    // Save report
    await fs.writeFile(`./workspace/${repo}-issue-report.md`, report);
    console.log(`✓ Saved to ./workspace/${repo}-issue-report.md`);

    console.log('\n✓ Analysis complete!');
    console.log(`\nSummary:`);
    console.log(`- Total open issues: ${analysis.totalCount}`);
    console.log(`- Critical priority: ${analysis.prioritizedIssues.critical.length}`);
    console.log(`- High priority: ${analysis.prioritizedIssues.high.length}`);
    console.log(`- Stale issues: ${analysis.staleIssues.length}`);

    return analysis;
  } catch (error) {
    console.error('Error during analysis:', error);
    throw error;
  }
}
