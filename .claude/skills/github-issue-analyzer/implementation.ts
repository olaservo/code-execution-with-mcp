import * as fs from "fs/promises";
import { search_issues } from "../../../servers/github/search_issues.js";

interface IssueData {
  number: number;
  title: string;
  state: string;
  labels: string[];
  comments: number;
  updated_at: string;
  created_at: string;
  html_url: string;
}

interface CategorizedIssues {
  highPriority: IssueData[];
  mediumPriority: IssueData[];
  lowPriority: IssueData[];
  goodFirstIssues: IssueData[];
}

interface ReportOutput {
  summary: {
    total: number;
    highPriority: number;
    mediumPriority: number;
    lowPriority: number;
    goodFirstIssues: number;
  };
  topRecommended: Array<{
    issue: IssueData;
    priority: string;
    reason: string;
  }>;
  categorized: CategorizedIssues;
  markdown: string;
}

async function fetchIssuesWithRecentActivity(
  owner: string,
  repo: string,
  daysBack: number = 30
): Promise<IssueData[]> {
  const cutoffDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  const query = `repo:${owner}/${repo} updated:>=${cutoffDate}`;

  try {
    const response = await search_issues({
      query,
      sort: "updated",
      order: "desc",
      perPage: 100,
      page: 1,
    });

    let items = [];
    if (response && response.items) {
      items = response.items;
    } else if (Array.isArray(response)) {
      items = response;
    } else {
      return [];
    }

    const issues: IssueData[] = items
      .filter((item: any) => item)
      .map((item: any) => ({
        number: item.number,
        title: item.title,
        state: item.state,
        labels: item.labels && Array.isArray(item.labels)
          ? item.labels.map((l: any) => (typeof l === 'string' ? l : l.name))
          : [],
        comments: item.comments || 0,
        updated_at: item.updated_at,
        created_at: item.created_at,
        html_url: item.html_url,
      }));

    return issues;
  } catch (error) {
    console.error("Error fetching issues:", error);
    throw error;
  }
}

function categorizeIssues(issues: IssueData[]): CategorizedIssues {
  const categorized: CategorizedIssues = {
    highPriority: [],
    mediumPriority: [],
    lowPriority: [],
    goodFirstIssues: [],
  };

  issues.forEach((issue) => {
    const isGoodFirstIssue = issue.labels.some(
      (label) =>
        label.toLowerCase().includes("good first issue") ||
        label.toLowerCase().includes("beginner friendly")
    );
    const isBug = issue.labels.some((label) =>
      label.toLowerCase().includes("bug")
    );
    const isEnhancement = issue.labels.some(
      (label) =>
        label.toLowerCase().includes("enhancement") ||
        label.toLowerCase().includes("feature request")
    );
    const isOpen = issue.state === "open";
    const hasHighActivity = issue.comments > 3;

    if (isGoodFirstIssue) {
      categorized.goodFirstIssues.push(issue);
    } else if (isOpen && (isBug || hasHighActivity)) {
      categorized.highPriority.push(issue);
    } else if (isOpen && isEnhancement) {
      categorized.mediumPriority.push(issue);
    } else {
      categorized.lowPriority.push(issue);
    }
  });

  const sortByComments = (a: IssueData, b: IssueData) =>
    b.comments - a.comments;
  categorized.highPriority.sort(sortByComments);
  categorized.mediumPriority.sort(sortByComments);
  categorized.lowPriority.sort(sortByComments);
  categorized.goodFirstIssues.sort(sortByComments);

  return categorized;
}

function generateReport(
  issues: IssueData[],
  owner: string,
  repo: string,
  daysBack: number
): string {
  const categorized = categorizeIssues(issues);
  const cutoffDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  let report = `# ${owner}/${repo} - Prioritized Issue Report
Generated: ${new Date().toISOString()}
Issues Updated Since: ${cutoffDate}

## Summary Statistics
- **Total Issues Found**: ${issues.length}
- **High Priority**: ${categorized.highPriority.length}
- **Medium Priority**: ${categorized.mediumPriority.length}
- **Low Priority**: ${categorized.lowPriority.length}
- **Good First Issues**: ${categorized.goodFirstIssues.length}

---

## Top Recommended Issues to Work On

`;

  const recommendedIssues: Array<{
    issue: IssueData;
    priority: string;
    reason: string;
  }> = [];

  categorized.highPriority.forEach((issue) => {
    const isBug = issue.labels.some((label) =>
      label.toLowerCase().includes("bug")
    );
    const reason = isBug
      ? `Bug with ${issue.comments} comments`
      : `Open issue with high activity (${issue.comments} comments)`;
    recommendedIssues.push({ issue, priority: "HIGH", reason });
  });

  categorized.goodFirstIssues.slice(0, 3).forEach((issue) => {
    recommendedIssues.push({
      issue,
      priority: "GOOD FIRST ISSUE",
      reason: `Great for new contributors (${issue.comments} comments)`,
    });
  });

  categorized.mediumPriority.slice(0, 2).forEach((issue) => {
    recommendedIssues.push({
      issue,
      priority: "MEDIUM",
      reason: `Enhancement with ${issue.comments} comments`,
    });
  });

  const topIssues = recommendedIssues.slice(0, 10);

  topIssues.forEach((item, index) => {
    const daysOld = Math.floor(
      (Date.now() - new Date(item.issue.updated_at).getTime()) /
        (24 * 60 * 60 * 1000)
    );
    report += `
### ${index + 1}. [#${item.issue.number}](${item.issue.html_url}) - ${item.issue.title}
**Priority**: ${item.priority}
**State**: ${item.issue.state.toUpperCase()}
**Labels**: ${item.issue.labels.length > 0 ? item.issue.labels.join(", ") : "None"}
**Comments**: ${item.issue.comments}
**Last Updated**: ${daysOld} days ago
**Why Important**: ${item.reason}

`;
  });

  report += `---

## Key Insights & Recommendations

### Focus Areas
1. **High Priority Issues (${categorized.highPriority.length} total)**
   - These are bugs or heavily discussed issues that need immediate attention
   - Often indicate pain points for users or critical functionality gaps

2. **Good First Issues (${categorized.goodFirstIssues.length} total)**
   - Perfect for new contributors to the project
   - Well-defined and scoped for easier onboarding

3. **Medium Priority (${categorized.mediumPriority.length} total)**
   - Feature enhancements that improve the project
   - Good for incremental improvements

### Next Steps
1. Start with the HIGH PRIORITY issues to address critical bugs or widely-discussed problems
2. For new contributors, start with "Good First Issues" to learn the codebase
3. Review issue comments for context before starting work
4. Check the repository's CONTRIBUTING.md for guidelines

---

## All Issues by Category

### High Priority Issues (${categorized.highPriority.length})
${categorized.highPriority.map((i) => `- [#${i.number}](${i.html_url}) ${i.title} (${i.comments} comments)`).join("\n") || "None"}

### Good First Issues (${categorized.goodFirstIssues.length})
${categorized.goodFirstIssues.map((i) => `- [#${i.number}](${i.html_url}) ${i.title} (${i.comments} comments)`).join("\n") || "None"}

### Medium Priority Issues (${categorized.mediumPriority.length})
${categorized.mediumPriority.map((i) => `- [#${i.number}](${i.html_url}) ${i.title} (${i.comments} comments)`).join("\n") || "None"}

### Low Priority Issues (${categorized.lowPriority.length})
${categorized.lowPriority.slice(0, 10).map((i) => `- [#${i.number}](${i.html_url}) ${i.title} (${i.comments} comments)`).join("\n") || "None"}
${categorized.lowPriority.length > 10 ? `\n... and ${categorized.lowPriority.length - 10} more` : ""}
`;

  return report;
}

export async function analyzeGitHubIssues(
  owner: string,
  repo: string,
  daysBack: number = 30
): Promise<ReportOutput> {
  const issues = await fetchIssuesWithRecentActivity(owner, repo, daysBack);

  if (issues.length === 0) {
    throw new Error(`No issues found for ${owner}/${repo} in the last ${daysBack} days`);
  }

  const categorized = categorizeIssues(issues);
  const markdown = generateReport(issues, owner, repo, daysBack);

  // Save raw data for inspection
  await fs.mkdir("./workspace", { recursive: true });
  await fs.writeFile(
    "./workspace/all-issues.json",
    JSON.stringify(issues, null, 2)
  );
  await fs.writeFile(
    "./workspace/issue-report.md",
    markdown
  );

  // Prepare recommended issues
  const recommendedIssues: Array<{
    issue: IssueData;
    priority: string;
    reason: string;
  }> = [];

  categorized.highPriority.forEach((issue) => {
    const isBug = issue.labels.some((label) =>
      label.toLowerCase().includes("bug")
    );
    const reason = isBug
      ? `Bug with ${issue.comments} comments`
      : `Open issue with high activity (${issue.comments} comments)`;
    recommendedIssues.push({ issue, priority: "HIGH", reason });
  });

  categorized.goodFirstIssues.slice(0, 3).forEach((issue) => {
    recommendedIssues.push({
      issue,
      priority: "GOOD FIRST ISSUE",
      reason: `Great for new contributors (${issue.comments} comments)`,
    });
  });

  categorized.mediumPriority.slice(0, 2).forEach((issue) => {
    recommendedIssues.push({
      issue,
      priority: "MEDIUM",
      reason: `Enhancement with ${issue.comments} comments`,
    });
  });

  return {
    summary: {
      total: issues.length,
      highPriority: categorized.highPriority.length,
      mediumPriority: categorized.mediumPriority.length,
      lowPriority: categorized.lowPriority.length,
      goodFirstIssues: categorized.goodFirstIssues.length,
    },
    topRecommended: recommendedIssues.slice(0, 10),
    categorized,
    markdown,
  };
}
