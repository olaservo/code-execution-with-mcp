import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

/**
 * Creates a timestamped zip file containing all metrics, logs, and workspace archives
 */
async function zipResults(): Promise<void> {
  // Generate timestamp in format similar to example: 2025-11-18T16-07-57-3NZ
  const now = new Date();
  const isoString = now.toISOString();
  const timestamp = isoString
    .replace(/:/g, '-')
    .replace(/\.\d{3}Z$/, `-${isoString.slice(-4)}`);

  const zipFilename = `results-${timestamp}.zip`;
  const outputDir = './example_results';
  const outputPath = path.join(outputDir, zipFilename);

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log(`Creating zip file: ${outputPath}`);

  // Add directories to zip
  const directories = ['metrics', 'logs', 'workspace_archive'];
  const existingDirs: string[] = [];

  for (const dir of directories) {
    if (fs.existsSync(dir)) {
      console.log(`Adding ${dir}/ directory...`);
      existingDirs.push(dir);
    } else {
      console.log(`Warning: ${dir}/ directory not found, skipping...`);
    }
  }

  if (existingDirs.length === 0) {
    console.error('Error: No directories found to zip');
    process.exit(1);
  }

  // Use native zip command (available on macOS and most Unix systems)
  try {
    const zipCommand = `zip -r "${outputPath}" ${existingDirs.join(' ')}`;
    console.log(`\nExecuting: ${zipCommand}`);
    execSync(zipCommand, { stdio: 'inherit' });

    const stats = fs.statSync(outputPath);
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);

    console.log(`\n✓ Zip file created successfully!`);
    console.log(`  Location: ${outputPath}`);
    console.log(`  Size: ${sizeMB} MB`);
    console.log(`  Files: ${existingDirs.join(', ')}`);
  } catch (error) {
    console.error('Error creating zip file:', error);
    process.exit(1);
  }
}

// Run the script
zipResults().catch((err) => {
  console.error('Error creating zip file:', err);
  process.exit(1);
});
