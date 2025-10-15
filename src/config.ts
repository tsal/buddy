import { join, dirname, resolve } from 'path';
import { homedir } from 'os';

export class BuddyConfig {
  agents: string;
  commands: string;
  context: string;
  extension?: string;
  pools?: string;

  constructor(agents: string = '', commands: string = 'commands', context: string = 'shared', extension?: string, pools?: string) {
    this.agents = agents;
    this.commands = commands;
    this.context = context;
    this.extension = extension;
    this.pools = pools;
  }

  static new(): BuddyConfig {
    return new BuddyConfig();
  }
}

export async function loadBuddyConfigFrom(dirPath: string): Promise<BuddyConfig> {
  const configPath = join(dirPath, '.buddy', 'config.json');

  try {
    if (await Bun.file(configPath).exists()) {
      const configData = await Bun.file(configPath).json();
      return new BuddyConfig(
        configData.agents ?? '',
        configData.commands ?? 'commands',
        configData.context ?? 'shared',
        configData.extension,
        configData.pools
      );
    }
  } catch (error) {
    // If parsing fails, return default config
  }

  return BuddyConfig.new();
}

export async function findBuddyConfig(): Promise<string | null> {
  let currentDir = resolve(process.cwd());
  const rootDir = resolve('/');

  // Traverse upward from cwd to root
  while (currentDir !== rootDir) {
    const configPath = join(currentDir, '.buddy', 'config.json');

    if (await Bun.file(configPath).exists()) {
      return configPath;
    }

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      break; // Reached root
    }
    currentDir = parentDir;
  }

  // Check root directory
  const rootConfigPath = join(rootDir, '.buddy', 'config.json');
  if (await Bun.file(rootConfigPath).exists()) {
    return rootConfigPath;
  }

  // Final fallback: check home directory
  const homeConfigPath = join(homedir(), '.buddy', 'config.json');
  if (await Bun.file(homeConfigPath).exists()) {
    return homeConfigPath;
  }

  return null;
}
