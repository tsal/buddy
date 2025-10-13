#!/usr/bin/env bun
import { program } from 'commander';
import { join } from 'path';
import { homedir } from 'os';

const packageJson = await Bun.file(join(import.meta.dir, '../package.json')).json();


// File System Utilities
async function copyFile(sourcePath: string, targetPath: string): Promise<void> {
  const content = await Bun.file(sourcePath).text();
  await Bun.write(targetPath, content);
}

// User Interaction Utilities
async function promptOverwrite(filename: string, location: string): Promise<boolean> {
  const response = prompt(`File ${filename} already exists in ${location}. Overwrite? (y/N): `);
  return response?.toLowerCase() === 'y' || response?.toLowerCase() === 'yes';
}

function parseImportSource(source: string): { sourcePath: string; filename: string } {
  // TODO: handle windows
  const filename = source.split('/').pop() || 'unknown-agent';
  return { sourcePath: source, filename };
}

// URL Processing Utilities
function isUrl(input: string): boolean {
  return input.includes('://');
}

function extractRepoName(url: string): string {
  try {
    const parsed = new URL(url);
    const pathParts = parsed.pathname.split('/');
    const lastPart = pathParts[pathParts.length - 1];
    if (!lastPart) {
      return 'unknown-repo';
    }
    return lastPart.replace(/\.git$/, '');
  } catch {
    return 'unknown-repo';
  }
}

function validateUrlProtocol(url: string): { isValid: boolean; error?: string } {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:') {
      return { isValid: false, error: 'TLS required, use HTTPS' };
    }
    if (parsed.protocol === 'git:' || parsed.protocol.startsWith('ssh')) {
      return { isValid: false, error: 'Not implemented yet' };
    }
    if (parsed.protocol === 'https:' || parsed.protocol === 'file:') {
      return { isValid: true };
    }
    return { isValid: false, error: `Unsupported protocol: ${parsed.protocol}` };
  } catch {
    return { isValid: false, error: 'Invalid URL format' };
  }
}

// Path Management Utilities
function getBuddyBasePath(customPath?: string): string {
  return customPath || join(homedir(), '.buddy');
}

function getAddPaths(agentName: string, basePath?: string) {
  const buddyPath = getBuddyBasePath(basePath);
  const localAgentsPath = join(buddyPath, 'agents', 'local');
  const claudeSourcePath = join(process.cwd(), '.claude', 'agents', `${agentName}.md`);
  const buddyDestPath = join(localAgentsPath, `${agentName}.md`);

  return {
    localAgentsPath,
    sourcePath: claudeSourcePath,
    destPath: buddyDestPath
  };
}

function getImportPaths(sourcePath: string, filename: string, toClaudeProject: boolean, basePath?: string) {
  const buddyPath = getBuddyBasePath(basePath);
  const buddySourcePath = join(buddyPath, 'agents', `${sourcePath}.md`);

  const destPath = toClaudeProject
    ? join(process.cwd(), '.claude', 'agents', `${filename}.md`)
    : join(process.cwd(), `${filename}.md`);

  const destLocation = toClaudeProject ? '.claude/agents/' : 'current directory';

  return {
    sourcePath: buddySourcePath,
    destPath,
    destLocation
  };
}

function getRepoPaths(repoName: string, basePath?: string) {
  const buddyPath = getBuddyBasePath(basePath);
  const agentsPath = join(buddyPath, 'agents');
  const repoPath = join(agentsPath, repoName);

  return {
    agentsPath,
    repoPath
  };
}

program
  .name('buddy')
  .description('Manage git-hosted subagents')
  .version(packageJson.version || '0.0.1');

program
  .command('init')
  .description('Initialize agent directory')
  .argument('[pathname]', 'Custom path (defaults to ~/.buddy)')
  .action(async (pathname?: string) => {
    await initCommand(pathname);
  });

program
  .command('add')
  .description('Add agents')
  .argument('[source]', 'URL, filename, or agent name')
  .option('-p, --claude-project <name>', 'Copy from .claude/agents/')
  .action(async (source: string | undefined, options) => {
    await addCommand(source, options);
  });

program
  .command('import')
  .description('Import agents')
  .argument('<source>', 'Source in format local/agentname')
  .option('-p, --claude-project', 'Import to .claude/agents/')
  .option('--force', 'Skip README check')
  .action(async (source: string, options) => {
    await importCommand(source, options);
  });

async function initCommand(pathname?: string): Promise<void> {
  const agentsPath = join(getBuddyBasePath(pathname), 'agents', 'local');
  const initFile = join(agentsPath, '.buddy-initialized');

  try {
    if (await Bun.file(initFile).exists()) {
      console.log(`✓ Agent directory already exists at: ${agentsPath}`);
      return;
    }

    await Bun.write(initFile, '');
    console.log(`✓ Initialized agent pool at: ${agentsPath}`);

  } catch (error) {
    console.error(`✗ Failed to initialize agent pool: ${error}`);
    process.exit(1);
  }
}

async function addCommand(source: string | undefined, options: { claudeProject?: string }): Promise<void> {
  // If source is provided and it's a URL, ignore flags and process as URL
  if (source && isUrl(source)) {
    await addFromUrl(source);
    return;
  }

  if (options.claudeProject) {
    await addClaudeProjectAgent(options.claudeProject);
    return;
  }

  // If source is provided but not a URL, treat as Claude project name
  if (source) {
    await addClaudeProjectAgent(source);
    return;
  }

  // If no source or options provided
  console.error('✗ Please specify a source: URL, filename, or use --claude-project|-p <name>');
  process.exit(1);
}

async function addFromUrl(url: string): Promise<void> {
  const validation = validateUrlProtocol(url);
  if (!validation.isValid) {
    console.error(`✗ ${validation.error}`);
    process.exit(1);
  }

  try {
    const parsed = new URL(url);

    if (parsed.protocol === 'https:') {
      await addFromGitRepo(url);
    } else if (parsed.protocol === 'file:') {
      await addFromLocalFile(url);
    }
  } catch (error) {
    console.error(`✗ Failed to add from URL: ${error}`);
    process.exit(1);
  }
}

async function addFromGitRepo(url: string): Promise<void> {
  const repoName = extractRepoName(url);
  const paths = getRepoPaths(repoName);

  try {
    // Check if repo already exists
    if (await Bun.file(paths.repoPath).exists()) {
      console.log(`Repository ${repoName} already exists, pulling latest changes...`);
      await Bun.$`git pull`.cwd(paths.repoPath);
    } else {
      console.log(`Cloning repository ${repoName}...`);
      await Bun.$`git clone ${url} ${paths.repoPath}`;
    }

    console.log(`✓ Repository ${repoName} added to agents pool`);
  } catch (error) {
    console.error(`✗ Failed to clone repository: ${error}`);
    process.exit(1);
  }
}

async function addFromLocalFile(url: string): Promise<void> {
  try {
    const filePath = url.replace('file://', '');
    const content = await Bun.file(filePath).text();
    const filename = filePath.split('/').pop() || 'local-agent.md';

    const paths = getAddPaths('temp');
    const targetPath = join(paths.localAgentsPath, filename);

    await Bun.write(targetPath, content);
    console.log(`✓ Copied ${filename} to local agent pool`);
  } catch (error) {
    console.error(`✗ Failed to copy local file: ${error}`);
    process.exit(1);
  }
}

async function addClaudeProjectAgent(agentName: string): Promise<void> {
  const paths = getAddPaths(agentName);

  try {
    if (!(await Bun.file(paths.sourcePath).exists())) {
      console.error(`✗ Agent file not found: ${paths.sourcePath}`);
      process.exit(1);
    }

    if (await Bun.file(paths.destPath).exists()) {
      if (!(await promptOverwrite(`${agentName}.md`, 'local pool'))) {
        console.log('✓ Operation cancelled');
        return;
      }
    }

    await copyFile(paths.sourcePath, paths.destPath);
    console.log(`✓ Copied ${agentName}.md from Claude project to local agent pool`);

  } catch (error) {
    console.error(`✗ Failed to add agent: ${error}`);
    process.exit(1);
  }
}

async function importCommand(source: string, options: { claudeProject?: boolean; force?: boolean }): Promise<void> {
  const parsed = parseImportSource(source);

  // Check for README (case insensitive) unless --force is used
  if (!options.force && parsed.filename.toLowerCase() === 'readme') {
    console.error('✗ Really? A README file? Maybe try opening it in a web browser like a normal person.');
    console.log('   If you *really* want to import a README file, use --force');
    process.exit(1);
  }

  await importLocalAgent(parsed.sourcePath, parsed.filename, options.claudeProject || false);
}

async function importLocalAgent(sourcePath: string, filename: string, toClaudeProject: boolean): Promise<void> {
  const paths = getImportPaths(sourcePath, filename, toClaudeProject);

  try {
    if (!(await Bun.file(paths.sourcePath).exists())) {
      console.error(`${paths.sourcePath} not found or inaccessible`);
      console.log(`✗ Could not copy ${filename}.md file`);
      return;
    }

    if (await Bun.file(paths.destPath).exists()) {
      if (!(await promptOverwrite(`${filename}.md`, paths.destLocation))) {
        console.log('✓ Operation cancelled');
        return;
      }
    }

    await copyFile(paths.sourcePath, paths.destPath);
    console.log(`✓ Imported ${filename}.md to ${paths.destLocation}`);

  } catch (error) {
    console.error(`${paths.sourcePath} not found or inaccessible`);
    console.log(`✗ Could not copy ${filename}.md file`);
  }
}

program.parse();