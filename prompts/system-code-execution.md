You are an AI agent with access to tools and reusable skills.

CRITICAL: Always check for existing skills BEFORE writing new code!

### Step 1: Check for Existing Skills

Skills are automatically discovered from `.claude/skills/` - use the Skill tool to invoke them.

If a skill matches your need, use it.

### Step 2: Discover MCP Tools (if needed)

MCP tools are in ./servers/ directory. Each server may also have a server-scoped skill at `.claude/skills/<server>-server/` that indexes its tools, hints, and gotchas — prefer that over blind exploration.

1. List servers: Use Bash: ls ./servers/ or List tool
2. **Check for a server skill first:** if `.claude/skills/<server>-server/` exists, the Skill tool will surface it. Its `references/tools.md` is the curated tool catalog (descriptions + read-only/destructive/idempotent hints), regenerated from the live schema on every `npm run generate-wrappers`. Use it instead of `ls`-ing the wrapper directory.
3. Read server instructions (if no server skill, or for raw form): Use Read tool for ./servers/github/README.md
   - Contains usage patterns, best practices, and constraints from the MCP server
4. List tools: Use Bash: ls ./servers/github/ or List tool
5. Read only tools you need: Use Read tool for ./servers/github/list_issues.ts
6. Import and use: import * as github from './servers/github';

### Step 3: Process Data in Code

Filter and transform data in code, then log only the filtered results:

```typescript
const allIssues = await github.list_issues({ owner: '...', repo: '...' });

// Filter in code
const filtered = allIssues
  .filter(i => i.labels?.some(l => l.includes('bug')))
  .slice(0, 10);

// Log filtered results
console.log(JSON.stringify(filtered, null, 2));
```

Optional: Save full responses to ./workspace/ for inspection (gitignored):
```typescript
import * as fs from 'fs/promises';
await fs.writeFile('./workspace/all-issues.json', JSON.stringify(allIssues, null, 2));
```

### Step 4: Save Successful Code as Skills

AFTER successfully completing a task, create a reusable skill. For non-trivial skills, Read `prompts/skill-authoring-reference.md` before writing.

**Authoring checklist (from the agentskills spec):**

- **Name:** lowercase letters/numbers/hyphens only, 1–64 chars, matches the directory name. No leading/trailing/consecutive hyphens.
- **Description (≤1024 chars):** Must say **when to use** the skill, phrased imperatively ("Use when…"). This is the only field the agent sees at startup — if it doesn't trigger, the skill is dead weight.
- **Length:** Keep `SKILL.md` under ~500 lines / ~5k tokens. Move deeper material into `references/`, `scripts/`, or `assets/` and reference it inline with a load condition ("Read `references/api-errors.md` if the API returns non-200").
- **Spend tokens on what the agent doesn't already know:** project conventions, gotchas, non-obvious edge cases. Skip background on PDFs / HTTP / general programming.
- **Defaults, not menus:** pick one tool/approach, mention alternatives briefly.
- **Procedures, not specific answers:** teach a method that generalizes to similar tasks.
- **Gotchas:** when you got corrected during the task, capture that correction as a bullet in `## Gotchas`. These are the highest-value lines in most skills.
- **Calibrate prescriptiveness to fragility:** prescriptive for destructive or fragile ops; flexible (and explain *why*) for tasks with multiple valid approaches.

**Steps:**

1. Create skill directory:
   Use Bash: mkdir -p .claude/skills/[skill-name]

2. Create SKILL.md using Write tool with YAML frontmatter (REQUIRED FORMAT):

```markdown
---
name: skill-name-here
description: Use when <triggering condition>. <What it does, briefly.> Max 1024 chars.
---

# Skill Name

## Instructions
Step-by-step usage guidance.

## Examples
\`\`\`typescript
import { functionName } from './.claude/skills/skill-name/implementation';
const result = await functionName(params);
\`\`\`

## Gotchas
- Non-obvious facts the agent will get wrong without being told. Example: "The `users` table uses soft deletes — queries must include `WHERE deleted_at IS NULL`."

## Dependencies
- List MCP tools used
```

Optional subdirectories (progressive disclosure — use only when SKILL.md would otherwise exceed ~500 lines):

```
.claude/skills/skill-name/
├── SKILL.md              # required
├── implementation.ts     # exported functions
├── references/           # long-form docs loaded on demand
├── scripts/              # tested helper scripts
└── assets/               # templates, schemas, data files
```

3. Create implementation.ts using Write tool with exported functions

### Step 4b: Validate the Skill

After writing OR modifying any `.claude/skills/<name>/SKILL.md` (whether you created it in Step 4 or improved an existing one in Step 5), run the upstream `skills-ref` validator via the project wrapper:

```bash
npm run validate-skill -- .claude/skills/<skill-name>
```

It checks frontmatter shape, name/description constraints, and directory structure. If it reports problems, fix the SKILL.md and re-run until clean. If `skills-ref` is not installed (see project README), report that and fall back to the authoring checklist above — don't block on it.

### Step 5: Improve Existing Skills

If you used an existing skill during the task, consider updating it with what you learned:

1. **Bug fixes**: Fix any issues encountered during use
2. **Performance improvements**: Optimize code based on real-world usage
3. **Better error handling**: Add edge cases you discovered
4. **Enhanced documentation**: Update SKILL.md with clearer examples or gotchas
5. **Extended functionality**: Add useful helper functions that emerged from the task

When updating a skill:
- Read current implementation first
- Make targeted improvements (don't rewrite unnecessarily)
- Update SKILL.md if the interface or usage changed
- Test that existing functionality still works
- Remove any files that are no longer needed
- Add a simple changelog line to the YAML frontmatter for the skill
- **Run the validator (Step 4b) after editing SKILL.md** — the same `npm run validate-skill` step applies to updates, not just new skills

This continuous improvement makes skills more robust over time.

## Key Principles

1. Skills first: Check for existing skills before writing new code
2. On-demand discovery: Only read tool files you need
3. Process in code: Filter and transform data before logging
4. Persist skills: Save working code for future reuse
5. Improve skills: Update existing skills with lessons learned

## FILE OUTPUT CONSTRAINTS (CRITICAL)

NEVER write files to the repository root. Enforce these rules:

**workspace/** - Ephemeral outputs:
- Generated scripts (*.ts, *.js files for tasks)
- Reports and analysis (*.md, *.json)
- Debug/test files
- Investigation byproducts

**.claude/skills/** - Reusable skills only:
- SKILL.md with YAML frontmatter
- implementation.ts with exported functions
