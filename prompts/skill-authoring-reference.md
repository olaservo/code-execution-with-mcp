# Skill Authoring Reference

Distilled from the upstream [Agent Skills](https://agentskills.io) docs:
- `docs/skill-creation/best-practices.mdx`
- `docs/skill-creation/optimizing-descriptions.mdx`
- `docs/specification.mdx`

Read this when writing a non-trivial skill — anything beyond a tiny wrapper around a single tool call. For trivial skills, the checklist in `prompts/system-code-execution.md` is enough.

---

## Start from real expertise

The most common skill-authoring failure mode is asking an LLM to invent a skill from training-data generalities. The result is vague advice ("handle errors appropriately") instead of project-specific patterns, edge cases, and conventions.

Build skills from the task you just completed:

- **Steps that worked** — the actual sequence of actions that succeeded.
- **Corrections that were made** — places where the agent's first attempt was wrong and got steered. These become **Gotchas** entries.
- **Input/output shapes** — what the data looked like going in and out.
- **Project-specific context** — facts the agent didn't already know (schemas, naming conventions, gotchas in this codebase).

If a skill is being synthesized from existing docs, prefer concrete project artifacts (runbooks, schemas, code review comments, incident reports, version control history) over generic references.

## Spend context wisely

Once activated, the entire `SKILL.md` body loads into the agent's context window. Every token competes with conversation history and other active skills.

### Add what the agent lacks; omit what it knows

Ask of each line: *"Would the agent get this wrong without this instruction?"* If no, cut it.

Bad:
> PDF (Portable Document Format) files are a common file format that contains text, images, and other content. To extract text from a PDF, you'll need to use a library. pdfplumber is recommended because it handles most cases well.

Good:
> Use pdfplumber for text extraction. For scanned documents, fall back to pdf2image with pytesseract.

### Design coherent units

A skill should encapsulate one coherent unit of work. Too narrow → multiple skills must load for one task. Too broad → harder to trigger precisely. "Query a database and format results" is one unit; adding "and also administer the database" is too much.

### Length and progressive disclosure

The spec recommends `SKILL.md` ≤500 lines / ~5,000 tokens. When more content is genuinely needed, move it into:

- `references/` — long-form docs (API error catalogs, schema dumps, decision matrices)
- `scripts/` — tested helper scripts the skill invokes
- `assets/` — templates, schemas, data files

Tell the agent **when** to load each file:

> Read `references/api-errors.md` if the API returns a non-200 status code.

A generic "see references/ for details" is much weaker — the agent won't know when to look.

## Calibrate prescriptiveness to fragility

Not every part of a skill needs the same control level.

**Be flexible** when multiple approaches are valid. Explain *why*, not just *how* — an agent that understands purpose makes better context-dependent decisions:

```markdown
## Code review process
1. Check all database queries for SQL injection (use parameterized queries)
2. Verify authentication checks on every endpoint
3. Look for race conditions in concurrent code paths
```

**Be prescriptive** when operations are fragile, consistency matters, or a specific sequence must be followed:

````markdown
## Database migration
Run exactly this sequence:
```bash
python scripts/migrate.py --verify --backup
```
Do not modify the command or add additional flags.
````

Most skills mix both. Calibrate each section independently.

### Provide defaults, not menus

Pick one tool/approach, mention alternatives briefly:

> Use pdfplumber for text extraction. For scanned PDFs requiring OCR, use pdf2image with pytesseract instead.

Not:

> You can use pypdf, pdfplumber, PyMuPDF, or pdf2image…

### Favor procedures over specific answers

A skill should teach a method that generalizes:

Bad (only useful for this one query):
> Join the `orders` table to `customers` on `customer_id`, filter where `region = 'EMEA'`, and sum the `amount` column.

Good (works for any analytical query):
> 1. Read the schema from `references/schema.yaml` to find relevant tables
> 2. Join tables using the `_id` foreign key convention
> 3. Apply filters from the user's request as WHERE clauses
> 4. Aggregate numeric columns and format as a markdown table

## Patterns for effective instructions

Use these as needed; not every skill needs all of them.

### Gotchas

Highest-value content in most skills. Concrete corrections to mistakes the agent *will* make without being told. Keep them in `SKILL.md` (not a reference file) so they're loaded before the agent encounters the situation.

```markdown
## Gotchas
- The `users` table uses soft deletes. Queries must include `WHERE deleted_at IS NULL`.
- User ID is `user_id` in DB, `uid` in auth, `accountId` in billing — same value.
- `/health` returns 200 while the web server runs, even if DB is down. Use `/ready` for full health.
```

When the agent gets corrected during a task, add the correction as a new gotcha. This is the most direct iterative improvement.

### Output templates

For specific output formats, provide the template directly — agents pattern-match against concrete structures more reliably than against prose descriptions.

````markdown
## Report structure
```markdown
# [Analysis Title]
## Executive summary
[One-paragraph overview]
## Key findings
- Finding 1 with supporting data
## Recommendations
1. Specific actionable recommendation
```
````

Long or conditionally-used templates belong in `assets/`, loaded on demand.

### Checklists for multi-step workflows

```markdown
## Form processing workflow
- [ ] Step 1: Analyze the form (run `scripts/analyze_form.py`)
- [ ] Step 2: Create field mapping (edit `fields.json`)
- [ ] Step 3: Validate mapping (run `scripts/validate_fields.py`)
- [ ] Step 4: Fill the form
- [ ] Step 5: Verify output
```

### Validation loops

Tell the agent to validate its own work before moving on. Pattern: do → validate → fix → revalidate → proceed only when clean.

```markdown
1. Make your edits
2. Run validation: `python scripts/validate.py output/`
3. If validation fails, fix the issues and re-run
4. Only proceed when validation passes
```

### Plan–validate–execute

For batch or destructive operations: agent emits a structured plan, validates it against a source of truth, then executes.

The validation step is the key ingredient — a script that compares the plan against ground truth and emits errors like `"Field 'signature_date' not found — available fields: customer_name, order_total, signature_date_signed"` gives the agent enough information to self-correct.

### Bundling reusable scripts

If the agent independently reinvents the same logic across runs (chart-building, parsing a specific format, validating output), write a tested script once and put it in `scripts/`. The skill then says "run `scripts/foo.py`" instead of asking the agent to redo the work each time.

## Description optimization

The `description` field is the *entire trigger surface* for the skill. At startup the agent only sees `name` + `description`; it loads the full body only when a task seems to match.

Rules:

- **Imperative form.** "Use when…" not "This skill does…". Tell the agent when to act.
- **User-intent framing, not implementation.** Describe what the user wants, not the skill's internals.
- **Be slightly pushy.** Explicitly list contexts where the skill applies, including ones where the user won't name the domain. *"Use even when the user doesn't say 'CSV' or 'analysis' explicitly."*
- **Concise.** A few sentences. Hard limit 1024 chars; aim well below.
- **Sanity-test with should-trigger and should-not-trigger queries.** A handful of each. The strongest negative tests are *near-misses* — queries sharing keywords but needing something different (a CSV ETL request is a near-miss for a CSV analysis skill). If a near-miss triggers, narrow the description.

## Anti-patterns

- Generic LLM advice not grounded in this project ("handle errors appropriately", "follow best practices")
- Explaining fundamentals the agent already knows (what PDFs are, how HTTP works)
- Long menus of equal options with no default
- Covering every possible edge case instead of trusting the agent's judgment on the rare ones
- Burying gotchas in `references/` where the agent won't load them before making the mistake
- A description that says what the skill *does* but never *when* to use it
