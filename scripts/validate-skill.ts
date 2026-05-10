// Run the upstream `agentskills` validator against a skill directory.
//
// Usage: tsx scripts/validate-skill.ts <skill-path>
//   or:  npm run validate-skill -- <skill-path>
//
// Requires the `skills-ref` PyPI package (CLI binary: `agentskills`). Install via:
//   pipx install skills-ref
// or set SKILLS_REF_BIN to the absolute path of the agentskills executable
// if it's installed but not on PATH (common on Windows with `pip install --user`).

import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const skillArg = process.argv[2];
if (!skillArg) {
  console.error('Usage: tsx scripts/validate-skill.ts <skill-path>');
  process.exit(64);
}

const skillPath = path.resolve(skillArg);
if (!fs.existsSync(path.join(skillPath, 'SKILL.md'))) {
  console.error(`No SKILL.md found at ${skillPath}`);
  process.exit(2);
}

const exe = process.env.SKILLS_REF_BIN || 'agentskills';
const result = spawnSync(exe, ['validate', skillPath], { stdio: 'inherit' });

if (result.error && (result.error as NodeJS.ErrnoException).code === 'ENOENT') {
  console.error(
    `'${exe}' not found on PATH. Install the skills-ref PyPI package (see project README) ` +
      'or set SKILLS_REF_BIN to its absolute path, then re-run. ' +
      'Skipping validation is non-fatal — fall back to the authoring checklist in prompts/system-code-execution.md.'
  );
  process.exit(3);
}

process.exit(result.status ?? 1);
