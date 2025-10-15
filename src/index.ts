#!/usr/bin/env bun
import { program } from 'commander';
import { join } from 'path';
import { homedir } from 'os';
import { loadBuddyConfigFrom } from './config.js';

const VERSION = '0.0.1';

// Private Types
type AddPathConfig = {
  agentName: string;
  basePath?: string;
  usePersonalClaude?: boolean;
};

type ImportPathConfig = {
  repoName: string;
  agentPath: string;
  filename: string;
  toClaudeProject?: boolean;
  toClaudePersonal?: boolean;
  basePath?: string;
};

// File System Utilities
async function directoryExists(path: string): Promise<boolean> {
  try {
    // Attempt to glob for all entries within the directory.
    // This will throw an error if 'path' is not a directory or does not exist.
    const glob = new Bun.Glob("*");
    await Array.fromAsync(glob.scan({ cwd: path }));
    return true; // If no error, it's a directory
  } catch (error) {
    // Any error here suggests it's not a valid, accessible directory.
    return false;
  }
}

async function copyFile(sourcePath: string, targetPath: string): Promise<void> {
  const content = await Bun.file(sourcePath).text();
  await Bun.write(targetPath, content);
}

async function findAgentFile(basePath: string, agentPath: string, extension?: string): Promise<string | null> {
  if (extension !== undefined) {
    // Extension is configured: try .{extension} -> no extension
    const withExt = `${basePath}/${agentPath}.${extension}`;
    if (await Bun.file(withExt).exists()) {
      return withExt;
    }

    const noExt = `${basePath}/${agentPath}`;
    if (await Bun.file(noExt).exists()) {
      return noExt;
    }

    return null;
  } else {
    // No extension configured: try .md -> .txt -> no extension
    const withMd = `${basePath}/${agentPath}.md`;
    if (await Bun.file(withMd).exists()) {
      return withMd;
    }

    const withTxt = `${basePath}/${agentPath}.txt`;
    if (await Bun.file(withTxt).exists()) {
      return withTxt;
    }

    const noExt = `${basePath}/${agentPath}`;
    if (await Bun.file(noExt).exists()) {
      return noExt;
    }

    return null;
  }
}

// User Interaction Utilities
async function promptOverwrite(filename: string, location: string): Promise<boolean> {
  const response = prompt(`File ${filename} already exists in ${location}. Overwrite? (y/N): `);
  return response?.toLowerCase() === 'y' || response?.toLowerCase() === 'yes';
}

function parseImportSource(source: string): { repoName: string; agentPath: string; filename: string } {
  // TODO: handle windows
  const parts = source.split('/');
  const repoName = parts[0] || 'unknown-repo';
  const agentPath = parts.slice(1).join('/');
  const filename = parts[parts.length - 1] || 'unknown-agent';
  return { repoName, agentPath, filename };
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
  const localAgentsPath = join(buddyPath, 'pools', 'local');
  const claudeSourcePath = join(process.cwd(), '.claude', 'agents', `${agentName}.md`);
  const buddyDestPath = join(localAgentsPath, `${agentName}.md`);

  return {
    localAgentsPath,
    sourcePath: claudeSourcePath,
    destPath: buddyDestPath
  };
}

async function getImportPaths(repoName: string, agentPath: string, filename: string, toClaudeProject: boolean, basePath?: string) {
  const buddyPath = getBuddyBasePath(basePath);
  const repoPath = join(buddyPath, 'pools', repoName);

  // Load the repo's buddy config
  const repoConfig = await loadBuddyConfigFrom(repoPath);

  // Build base path for agent search
  const agentBasePath = join(repoPath, repoConfig.agents);

  // Find the agent file with appropriate extension fallback
  const buddySourcePath = await findAgentFile(agentBasePath, agentPath, repoConfig.extension);

  const destPath = toClaudeProject
    ? join(process.cwd(), '.claude', 'agents', `${filename}.md`)
    : join(process.cwd(), `${filename}.md`);

  const destLocation = toClaudeProject ? '.claude/agents/' : 'current directory';

  return {
    sourcePath: buddySourcePath,
    destPath,
    destLocation,
    extension: repoConfig.extension,
    agentsConfigPath: repoConfig.agents
  };
}

function getRepoPaths(repoName: string, basePath?: string) {
  const buddyPath = getBuddyBasePath(basePath);
  const poolsPath = join(buddyPath, 'pools');
  const repoPath = join(poolsPath, repoName);

  return {
    poolsPath,
    repoPath
  };
}

function getAddPathsWithConfig(config: AddPathConfig) {
  const buddyPath = getBuddyBasePath(config.basePath);
  const localAgentsPath = join(buddyPath, 'pools', 'local');
  const claudeSourcePath = config.usePersonalClaude
    ? join(homedir(), '.claude', 'agents', `${config.agentName}.md`)
    : join(process.cwd(), '.claude', 'agents', `${config.agentName}.md`);
  const buddyDestPath = join(localAgentsPath, `${config.agentName}.md`);

  return {
    localAgentsPath,
    sourcePath: claudeSourcePath,
    destPath: buddyDestPath
  };
}

async function getImportPathsWithConfig(config: ImportPathConfig) {
  const buddyPath = getBuddyBasePath(config.basePath);
  const repoPath = join(buddyPath, 'pools', config.repoName);

  // Load the repo's buddy config
  const repoConfig = await loadBuddyConfigFrom(repoPath);

  // Build base path for agent search
  const agentBasePath = join(repoPath, repoConfig.agents);

  // Find the agent file with appropriate extension fallback
  const buddySourcePath = await findAgentFile(agentBasePath, config.agentPath, repoConfig.extension);

  const destPath = config.toClaudePersonal
    ? join(homedir(), '.claude', 'agents', `${config.filename}.md`)
    : config.toClaudeProject
    ? join(process.cwd(), '.claude', 'agents', `${config.filename}.md`)
    : join(process.cwd(), `${config.filename}.md`);

  const destLocation = config.toClaudePersonal
    ? '~/.claude/agents/'
    : config.toClaudeProject
    ? '.claude/agents/'
    : 'current directory';

  return {
    sourcePath: buddySourcePath,
    destPath,
    destLocation,
    extension: repoConfig.extension,
    agentsConfigPath: repoConfig.agents
  };
}

program
  .name('buddy')
  .description('Manage git-hosted subagents')
  .version(VERSION);

program
  .command('init')
  .description('Initialize agent directory')
  .argument('[pathname]', 'Custom path (defaults to ~/.buddy)')
  .action(async (pathname?: string) => {
    await initCommand(pathname);
  });

program
  .command('add')
  .description('Add agents, commands, or shared context')
  .argument('[source]', 'URL, filename, or agent name')
  .option('-j, --claude-project <name>', 'Copy from .claude/agents/')
  .option('-g, --claude-personal <name>', 'Copy from ~/.claude/agents/')
  .option('-c, --command <name>', 'Copy command from .claude/commands/')
  .option('-s, --shared <name>', 'Copy shared context from .claude/shared/')
  .option('--as <name>', 'Custom name for repository (avoid collisions)')
  .action(async (source: string | undefined, options) => {
    await addCommand(source, options);
  });

program
  .command('import')
  .description('Import agents')
  .argument('<source>', 'Source in format local/agentname')
  .option('-j, --claude-project', 'Import to .claude/agents/')
  .option('-g, --claude-personal', 'Import to ~/.claude/agents/')
  .option('--force', 'Skip README check')
  .action(async (source: string, options) => {
    await importCommand(source, options);
  });

program
  .command('tool')
  .description('Output shared context as JSON for tool consumption')
  .argument('<source>', 'Source in format local/contextname or repo-name/contextname')
  .action(async (source: string) => {
    await toolCommand(source);
  });

program
  .command('list')
  .description('List agents, commands, or shared context')
  .argument('[namespace]', 'Namespace (defaults to "local")')
  .option('-c, --commands', 'List commands instead of agents')
  .option('-s, --shared', 'List shared context instead of agents')
  .action(async (namespace: string | undefined, options) => {
    await listCommand(namespace || 'local', options);
  });

async function initCommand(pathname?: string): Promise<void> {
  const poolsLocalPath = join(getBuddyBasePath(pathname), 'pools', 'local');
  const initFile = join(poolsLocalPath, '.buddy-initialized');
  const commandsPath = join(poolsLocalPath, 'commands');
  const sharedPath = join(poolsLocalPath, 'shared');

  try {
    if (await Bun.file(initFile).exists()) {
      console.log(`✓ Pool directory already exists at: ${poolsLocalPath}`);
      return;
    }

    await Bun.write(initFile, '');
    await Bun.write(join(commandsPath, '.gitkeep'), '');
    await Bun.write(join(sharedPath, '.gitkeep'), '');
    console.log(`✓ Initialized pool at: ${poolsLocalPath}`);

  } catch (error) {
    console.error(`✗ Failed to initialize pool: ${error}`);
    process.exit(1);
  }
}

async function addCommand(source: string | undefined, options: { claudeProject?: string; claudePersonal?: string; command?: string; shared?: string; as?: string }): Promise<void> {
  // If source is provided and it's a URL, ignore flags and process as URL
  if (source && isUrl(source)) {
    await addFromUrl(source, options.as);
    return;
  }

  if (options.command) {
    await addClaudeCommand(options.command);
    return;
  }

  if (options.shared) {
    await addClaudeShared(options.shared);
    return;
  }

  if (options.claudePersonal) {
    await addClaudePersonalAgent(options.claudePersonal);
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
  console.error('✗ Please specify a source: URL, filename, or use --claude-project|-j <name>');
  process.exit(1);
}

async function addFromUrl(url: string, customName?: string): Promise<void> {
  const validation = validateUrlProtocol(url);
  if (!validation.isValid) {
    console.error(`✗ ${validation.error}`);
    process.exit(1);
  }

  try {
    const parsed = new URL(url);

    if (parsed.protocol === 'https:') {
      await addFromGitRepo(url, customName);
    } else if (parsed.protocol === 'file:') {
      await addFromLocalFile(url);
    }
  } catch (error) {
    console.error(`✗ Failed to add from URL: ${error}`);
    process.exit(1);
  }
}

async function addFromGitRepo(url: string, customName?: string): Promise<void> {
  const repoName = customName || extractRepoName(url);
  const paths = getRepoPaths(repoName);

  try {
    // Check if directory exists
    const dirExists = await directoryExists(paths.repoPath);

    if (dirExists) {
      // Check if it's a valid git repo
      const gitConfigPath = join(paths.repoPath, '.git', 'config');
      const isGitRepo = await Bun.file(gitConfigPath).exists();

      if (!isGitRepo) {
        console.error(`✗ Directory '${repoName}' exists but is not a git repository`);
        console.log(`   Remove it manually or use --as <name> to choose a different name`);
        process.exit(1);
      }

      // Get the existing repo's origin URL
      const originResult = await Bun.$`git config --get remote.origin.url`.cwd(paths.repoPath).quiet();
      const existingOrigin = originResult.stdout.toString().trim();

      // Normalize URLs for comparison (remove trailing .git, normalize https/ssh)
      const normalizeUrl = (u: string) => u.replace(/\.git$/, '').toLowerCase();
      const sameRepo = normalizeUrl(existingOrigin) === normalizeUrl(url);

      if (sameRepo) {
        // Same repo, update it
        console.log(`Repository ${repoName} already exists, pulling latest changes...`);
        await Bun.$`git pull`.cwd(paths.repoPath);
      } else {
        // Different repo, name collision
        console.error(`✗ Repository name '${repoName}' already exists in pool`);
        console.error(`   Existing origin: ${existingOrigin}`);
        console.error(`   Requested URL: ${url}`);
        console.log(`   Use --as <different-name> to choose a different name`);
        process.exit(1);
      }
    } else {
      // Directory doesn't exist, clone it
      console.log(`Cloning repository as '${repoName}'...`);
      await Bun.$`git clone ${url} ${paths.repoPath}`;
    }

    console.log(`✓ Repository ${repoName} added to pool`);
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
    console.log(`✓ Copied ${filename} to pool`);
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
      if (!(await promptOverwrite(`${agentName}.md`, 'pool'))) {
        console.log('✓ Operation cancelled');
        return;
      }
    }

    await copyFile(paths.sourcePath, paths.destPath);
    console.log(`✓ Copied ${agentName}.md from Claude project to pool`);

  } catch (error) {
    console.error(`✗ Failed to add agent: ${error}`);
    process.exit(1);
  }
}

async function addClaudePersonalAgent(agentName: string): Promise<void> {
  const paths = getAddPathsWithConfig({
    agentName,
    usePersonalClaude: true
  });

  try {
    if (!(await Bun.file(paths.sourcePath).exists())) {
      console.error(`✗ Agent file not found: ${paths.sourcePath}`);
      process.exit(1);
    }

    if (await Bun.file(paths.destPath).exists()) {
      if (!(await promptOverwrite(`${agentName}.md`, 'pool'))) {
        console.log('✓ Operation cancelled');
        return;
      }
    }

    await copyFile(paths.sourcePath, paths.destPath);
    console.log(`✓ Copied ${agentName}.md from ~/.claude/agents/ to pool`);

  } catch (error) {
    console.error(`✗ Failed to add agent: ${error}`);
    process.exit(1);
  }
}

async function addClaudeCommand(commandName: string): Promise<void> {
  const buddyPath = getBuddyBasePath();
  const localCommandsPath = join(buddyPath, 'pools', 'local', 'commands');
  const claudeSourcePath = join(process.cwd(), '.claude', 'commands', `${commandName}.md`);
  const buddyDestPath = join(localCommandsPath, `${commandName}.md`);

  try {
    if (!(await Bun.file(claudeSourcePath).exists())) {
      console.error(`✗ Command file not found: ${claudeSourcePath}`);
      process.exit(1);
    }

    if (await Bun.file(buddyDestPath).exists()) {
      if (!(await promptOverwrite(`${commandName}.md`, 'pool'))) {
        console.log('✓ Operation cancelled');
        return;
      }
    }

    await copyFile(claudeSourcePath, buddyDestPath);
    console.log(`✓ Copied ${commandName}.md from Claude project to pool`);

  } catch (error) {
    console.error(`✗ Failed to add command: ${error}`);
    process.exit(1);
  }
}

async function addClaudeShared(sharedName: string): Promise<void> {
  const buddyPath = getBuddyBasePath();
  const localSharedPath = join(buddyPath, 'pools', 'local', 'shared');
  const claudeSourcePath = join(process.cwd(), '.claude', 'shared', `${sharedName}.md`);
  const buddyDestPath = join(localSharedPath, `${sharedName}.md`);

  try {
    if (!(await Bun.file(claudeSourcePath).exists())) {
      console.error(`✗ Shared context file not found: ${claudeSourcePath}`);
      process.exit(1);
    }

    if (await Bun.file(buddyDestPath).exists()) {
      if (!(await promptOverwrite(`${sharedName}.md`, 'pool'))) {
        console.log('✓ Operation cancelled');
        return;
      }
    }

    await copyFile(claudeSourcePath, buddyDestPath);
    console.log(`✓ Copied ${sharedName}.md from Claude project to pool`);

  } catch (error) {
    console.error(`✗ Failed to add shared context: ${error}`);
    process.exit(1);
  }
}

async function importCommand(source: string, options: { claudeProject?: boolean; claudePersonal?: boolean; force?: boolean }): Promise<void> {
  const parsed = parseImportSource(source);

  // Check for README (case insensitive) unless --force is used
  if (!options.force && parsed.filename.toLowerCase() === 'readme') {
    console.error('✗ Really? A README file? Maybe try opening it in a web browser like a normal person.');
    console.log('   If you *really* want to import a README file, use --force');
    process.exit(1);
  }

  if (options.claudePersonal) {
    await importToClaudePersonal(parsed.repoName, parsed.agentPath, parsed.filename);
  } else {
    await importLocalAgent(parsed.repoName, parsed.agentPath, parsed.filename, options.claudeProject || false);
  }
}

async function importLocalAgent(repoName: string, agentPath: string, filename: string, toClaudeProject: boolean): Promise<void> {
  const paths = await getImportPaths(repoName, agentPath, filename, toClaudeProject);

  if (!paths.sourcePath) {
    const fullPath = paths.agentsConfigPath ? join(paths.agentsConfigPath, agentPath) : agentPath;
    if (paths.extension !== undefined) {
      console.error(`✗ Agent file not found. Tried: ${fullPath}.${paths.extension}, ${fullPath}`);
    } else {
      console.error(`✗ Agent file not found. Tried: ${fullPath}.md, ${fullPath}.txt, ${fullPath}`);
    }
    return;
  }

  try {
    if (await Bun.file(paths.destPath).exists()) {
      if (!(await promptOverwrite(`${filename}.md`, paths.destLocation))) {
        console.log('✓ Operation cancelled');
        return;
      }
    }

    await copyFile(paths.sourcePath, paths.destPath);
    console.log(`✓ Imported ${filename}.md to ${paths.destLocation}`);

  } catch (error) {
    console.error(`✗ Failed to copy file: ${error}`);
  }
}

async function importToClaudePersonal(repoName: string, agentPath: string, filename: string): Promise<void> {
  const paths = await getImportPathsWithConfig({
    repoName,
    agentPath,
    filename,
    toClaudePersonal: true
  });

  if (!paths.sourcePath) {
    const fullPath = paths.agentsConfigPath ? join(paths.agentsConfigPath, agentPath) : agentPath;
    if (paths.extension !== undefined) {
      console.error(`✗ Agent file not found. Tried: ${fullPath}.${paths.extension}, ${fullPath}`);
    } else {
      console.error(`✗ Agent file not found. Tried: ${fullPath}.md, ${fullPath}.txt, ${fullPath}`);
    }
    return;
  }

  try {
    if (await Bun.file(paths.destPath).exists()) {
      if (!(await promptOverwrite(`${filename}.md`, paths.destLocation))) {
        console.log('✓ Operation cancelled');
        return;
      }
    }

    await copyFile(paths.sourcePath, paths.destPath);
    console.log(`✓ Imported ${filename}.md to ${paths.destLocation}`);

  } catch (error) {
    console.error(`✗ Failed to copy file: ${error}`);
  }
}

async function toolCommand(source: string): Promise<void> {
  const parsed = parseImportSource(source);

  try {
    let contextPath: string;
    let config;

    if (parsed.repoName === 'local') {
      // Local shared context
      const buddyPath = getBuddyBasePath();
      contextPath = join(buddyPath, 'pools', 'local', 'shared');
      config = { extension: undefined };
    } else {
      // Repo shared context
      const buddyPath = getBuddyBasePath();
      const repoPath = join(buddyPath, 'pools', parsed.repoName);

      // Load the repo's buddy config
      config = await loadBuddyConfigFrom(repoPath);
      contextPath = join(repoPath, config.context);
    }

    // Find the context file with extension fallback
    const filePath = await findAgentFile(contextPath, parsed.agentPath, config.extension);

    if (!filePath) {
      const fullPath = parsed.agentPath;
      if (config.extension !== undefined) {
        console.error(JSON.stringify({
          error: `Context file not found. Tried: ${fullPath}.${config.extension}, ${fullPath}`
        }));
      } else {
        console.error(JSON.stringify({
          error: `Context file not found. Tried: ${fullPath}.md, ${fullPath}.txt, ${fullPath}`
        }));
      }
      process.exit(1);
    }

    // Read the file content
    const content = await Bun.file(filePath).text();

    // Output as JSON
    console.log(JSON.stringify({
      content: content
    }));

  } catch (error) {
    console.error(JSON.stringify({
      error: `Failed to read context file: ${error}`
    }));
    process.exit(1);
  }
}

async function listCommand(namespace: string, options: { commands?: boolean; shared?: boolean }): Promise<void> {
  const buddyPath = getBuddyBasePath();

  try {
    let listPath: string;
    let type: string;

    if (namespace === 'local') {
      // Local pool
      const basePath = join(buddyPath, 'pools', 'local');

      if (options.commands) {
        listPath = join(basePath, 'commands');
        type = 'commands';
      } else if (options.shared) {
        listPath = join(basePath, 'shared');
        type = 'shared context';
      } else {
        listPath = basePath;
        type = 'agents';
      }
    } else {
      // Repo pool
      const repoPath = join(buddyPath, 'pools', namespace);

      // Check if repo exists
      if (!await directoryExists(repoPath)) {
        console.error(`✗ Pool '${namespace}' not found`);
        process.exit(1);
      }

      // Load the repo's config
      const config = await loadBuddyConfigFrom(repoPath);

      if (options.commands) {
        listPath = join(repoPath, config.commands);
        type = 'commands';
      } else if (options.shared) {
        listPath = join(repoPath, config.context);
        type = 'shared context';
      } else {
        listPath = join(repoPath, config.agents);
        type = 'agents';
      }
    }

    // Check if directory exists
    if (!await directoryExists(listPath)) {
      console.log(`No ${type} found in ${namespace}`);
      return;
    }

    // List files using Bun.Glob
    const mdGlob = new Bun.Glob(`**/*.md`);
    const txtGlob = new Bun.Glob(`**/*.txt`);

    const mdFiles = Array.from(mdGlob.scanSync({ cwd: listPath, onlyFiles: true }));
    const txtFiles = Array.from(txtGlob.scanSync({ cwd: listPath, onlyFiles: true }));
    const allFiles = [...mdFiles, ...txtFiles];

    if (allFiles.length === 0) {
      console.log(`No ${type} found in ${namespace}`);
      return;
    }

    const items = allFiles.map(file => {
      // Remove extension
      return file.replace(/\.(md|txt)$/, '');
    }).sort();

    console.log(`${type} in ${namespace}:`);
    items.forEach(item => console.log(`  ${item}`));

  } catch (error) {
    console.error(`✗ Failed to list ${namespace}: ${error}`);
    process.exit(1);
  }
}

program.parse();