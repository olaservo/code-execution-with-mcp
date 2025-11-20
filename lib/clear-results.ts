import fs from 'fs';
import path from 'path';
import readline from 'readline';

/**
 * Clears metrics, logs, workspace_archive directories and workspace contents (preserving .gitkeep)
 */
async function clearResults(): Promise<void> {
  // Check for -y or --y flag to skip confirmation
  const skipConfirmation = process.argv.includes('-y') || process.argv.includes('--y');

  const directories = ['metrics', 'logs', 'workspace_archive'];
  const workspaceDir = 'workspace';

  // Find which directories exist
  const existingDirs: string[] = [];

  for (const dir of directories) {
    if (fs.existsSync(dir)) {
      existingDirs.push(dir);
    }
  }

  // Check workspace contents (excluding .gitkeep)
  let hasWorkspaceContents = false;
  if (fs.existsSync(workspaceDir)) {
    const workspaceContents = fs.readdirSync(workspaceDir)
      .filter(file => file !== '.gitkeep');
    hasWorkspaceContents = workspaceContents.length > 0;
  }

  // If nothing to clear, exit early
  if (existingDirs.length === 0 && !hasWorkspaceContents) {
    console.log('Nothing to clear - all directories are already empty.');
    return;
  }

  // Show what will be cleared
  console.log('The following will be cleared:');
  for (const dir of existingDirs) {
    console.log(`  - ${dir}/`);
  }
  if (hasWorkspaceContents) {
    console.log(`  - ${workspaceDir}/* (preserving .gitkeep)`);
  }

  // Prompt for confirmation if -y flag not provided
  if (!skipConfirmation) {
    const confirmed = await promptConfirmation('\nAre you sure you want to delete these directories? (y/N): ');
    if (!confirmed) {
      console.log('Cancelled.');
      return;
    }
  }

  console.log('\nClearing directories...');

  // Clear directories completely
  let clearedCount = 0;
  for (const dir of existingDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      console.log(`✓ Cleared ${dir}/`);
      clearedCount++;
    } catch (error) {
      console.error(`✗ Error clearing ${dir}/:`, error);
    }
  }

  // Clear workspace contents (except .gitkeep)
  if (hasWorkspaceContents) {
    try {
      const workspaceContents = fs.readdirSync(workspaceDir);
      for (const file of workspaceContents) {
        if (file !== '.gitkeep') {
          const filePath = path.join(workspaceDir, file);
          const stats = fs.statSync(filePath);
          if (stats.isDirectory()) {
            fs.rmSync(filePath, { recursive: true, force: true });
          } else {
            fs.unlinkSync(filePath);
          }
        }
      }
      console.log(`✓ Cleared ${workspaceDir}/* (preserved .gitkeep)`);
      clearedCount++;
    } catch (error) {
      console.error(`✗ Error clearing ${workspaceDir}/:`, error);
    }
  }

  console.log(`\n✓ Successfully cleared ${clearedCount} location(s)`);
}

/**
 * Prompts user for yes/no confirmation
 */
function promptConfirmation(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      const normalized = answer.trim().toLowerCase();
      resolve(normalized === 'y' || normalized === 'yes');
    });
  });
}

// Run the script
clearResults().catch((err) => {
  console.error('Error clearing directories:', err);
  process.exit(1);
});
