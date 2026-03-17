"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_CONFIG = void 0;
exports.isSupportedFile = isSupportedFile;
exports.getLanguage = getLanguage;
exports.loadConfig = loadConfig;
exports.DEFAULT_CONFIG = {
    lookbackDays: 14,
    ignorePaths: ['node_modules', 'dist', 'build', '.git', 'vendor', 'coverage'],
};
const TS_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];
function isSupportedFile(filePath, config = exports.DEFAULT_CONFIG) {
    const hasExtension = TS_EXTENSIONS.some((ext) => filePath.endsWith(ext));
    if (!hasExtension)
        return false;
    return !config.ignorePaths.some((ignored) => filePath.startsWith(`${ignored}/`) || filePath === ignored);
}
function getLanguage(filePath) {
    return filePath.endsWith('.tsx') || filePath.endsWith('.jsx') ? 'tsx' : 'typescript';
}
function loadConfig(overrides) {
    return { ...exports.DEFAULT_CONFIG, ...overrides };
}
//# sourceMappingURL=config.js.map