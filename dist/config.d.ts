export interface Config {
    lookbackDays: number;
    ignorePaths: string[];
}
export declare const DEFAULT_CONFIG: Config;
export declare function isSupportedFile(filePath: string, config?: Config): boolean;
export declare function getLanguage(filePath: string): 'typescript' | 'tsx';
export declare function loadConfig(overrides?: Partial<Config>): Config;
