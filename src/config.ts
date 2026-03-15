export interface Config {
  lookbackDays: number;
  ignorePaths: string[];
}

export const DEFAULT_CONFIG: Config = {
  lookbackDays: 14,
  ignorePaths: ['node_modules', 'dist', 'build', '.git', 'vendor', 'coverage'],
};

const TS_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

export function isSupportedFile(filePath: string, config: Config = DEFAULT_CONFIG): boolean {
  const hasExtension = TS_EXTENSIONS.some((ext) => filePath.endsWith(ext));
  if (!hasExtension) return false;

  return !config.ignorePaths.some((ignored) => filePath.startsWith(`${ignored}/`) || filePath === ignored);
}

export function getLanguage(filePath: string): 'typescript' | 'tsx' {
  return filePath.endsWith('.tsx') || filePath.endsWith('.jsx') ? 'tsx' : 'typescript';
}

export function loadConfig(overrides?: Partial<Config>): Config {
  return { ...DEFAULT_CONFIG, ...overrides };
}
