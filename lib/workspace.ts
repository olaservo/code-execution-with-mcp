// Workspace management utilities
import * as fs from "fs/promises";
import * as path from "path";

export interface ClearWorkspaceOptions {
  verbose?: boolean;
  createIfMissing?: boolean;
}

export interface ClearWorkspaceResult {
  cleared: number;
  created: boolean;
}

export interface ArchiveWorkspaceResult {
  archived: number;
  archivePath: string;
  skipped: number;
}

/**
 * Clear workspace directory, preserving specified files
 * @param workspacePath Path to workspace directory (default: './workspace')
 * @param preserveFiles Files to preserve (default: ['.gitkeep'])
 * @param options Additional options
 * @returns Number of items cleared and whether directory was created
 */
export async function clearWorkspace(
  workspacePath: string = "./workspace",
  preserveFiles: string[] = [".gitkeep"],
  options: ClearWorkspaceOptions = {}
): Promise<ClearWorkspaceResult> {
  const { verbose = false, createIfMissing = true } = options;

  try {
    const workspaceFiles = await fs.readdir(workspacePath);
    const preserveSet = new Set(preserveFiles);
    let cleared = 0;

    for (const file of workspaceFiles) {
      if (!preserveSet.has(file)) {
        await fs.rm(`${workspacePath}/${file}`, { recursive: true, force: true });
        cleared++;
        if (verbose) {
          console.log(`Removed: ${workspacePath}/${file}`);
        }
      }
    }

    if (verbose && cleared > 0) {
      console.log(`Cleared ${cleared} items from ${workspacePath}`);
    }

    return { cleared, created: false };
  } catch (error) {
    // Workspace might not exist
    if (createIfMissing) {
      await fs.mkdir(workspacePath, { recursive: true });
      if (verbose) {
        console.log(`Created ${workspacePath} directory`);
      }
      return { cleared: 0, created: true };
    }
    throw error;
  }
}

/**
 * Ensure workspace directory exists
 * @param workspacePath Path to workspace directory (default: './workspace')
 */
export async function ensureWorkspace(
  workspacePath: string = "./workspace"
): Promise<void> {
  await fs.mkdir(workspacePath, { recursive: true });
}

/**
 * Archive workspace directory to a session-specific folder
 * @param sessionId Session ID to use for the archive folder name
 * @param workspacePath Path to workspace directory (default: './workspace')
 * @param archiveBasePath Base path for archives (default: './workspace_archive')
 * @param options Additional options
 * @returns Archive results including number of files archived and archive path
 */
export async function archiveWorkspace(
  sessionId: string,
  workspacePath: string = "./workspace",
  archiveBasePath: string = "./workspace_archive",
  options: { verbose?: boolean } = {}
): Promise<ArchiveWorkspaceResult> {
  const { verbose = false } = options;
  const archivePath = path.join(archiveBasePath, sessionId);

  let archived = 0;
  let skipped = 0;

  try {
    // Check if workspace exists and has content
    const workspaceFiles = await fs.readdir(workspacePath);

    // Filter out .gitkeep and other files we don't want to archive
    const filesToArchive = workspaceFiles.filter(file => file !== '.gitkeep');

    if (filesToArchive.length === 0) {
      if (verbose) {
        console.log(`No files to archive in ${workspacePath}`);
      }
      return { archived: 0, skipped: workspaceFiles.length, archivePath: '' };
    }

    // Create archive directory
    await fs.mkdir(archivePath, { recursive: true });

    // Copy each file/directory to archive
    for (const file of filesToArchive) {
      const sourcePath = path.join(workspacePath, file);
      const destPath = path.join(archivePath, file);

      try {
        // Copy recursively (works for both files and directories)
        await fs.cp(sourcePath, destPath, { recursive: true });
        archived++;
        if (verbose) {
          console.log(`Archived: ${file}`);
        }
      } catch (error) {
        if (verbose) {
          console.error(`Failed to archive ${file}:`, error);
        }
        skipped++;
      }
    }

    if (verbose && archived > 0) {
      console.log(`Archived ${archived} items to ${archivePath}`);
    }

    return { archived, archivePath, skipped };
  } catch (error) {
    // Workspace might not exist or be empty
    if (verbose) {
      console.log(`Could not archive workspace: ${error}`);
    }
    return { archived: 0, skipped: 0, archivePath: '' };
  }
}
