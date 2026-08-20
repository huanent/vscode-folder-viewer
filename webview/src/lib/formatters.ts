const imageExtensions = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico']);
const archiveExtensions = new Set(['zip', 'tar', 'gz', '7z', 'rar']);
const markdownExtensions = new Set(['md', 'mdx']);
const jsonExtensions = new Set(['json', 'jsonc']);
const codeExtensions = new Set(['js', 'jsx', 'ts', 'tsx', 'css', 'scss', 'html', 'py', 'java', 'cs', 'go', 'rs']);

export function getFileIcon(name: string): string {
	const extension = name.split('.').pop()?.toLowerCase() ?? '';
	if (imageExtensions.has(extension)) return 'codicon-file-media';
	if (archiveExtensions.has(extension)) return 'codicon-file-zip';
	if (markdownExtensions.has(extension)) return 'codicon-markdown';
	if (jsonExtensions.has(extension)) return 'codicon-json';
	if (codeExtensions.has(extension)) return 'codicon-file-code';
	return 'codicon-file';
}

export function formatSize(bytes: number): string {
	if (bytes === 0) return '0 B';
	const units = ['B', 'KB', 'MB', 'GB', 'TB'];
	const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
	const value = bytes / 1024 ** unitIndex;
	return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

export function formatDate(timestamp: number): string {
	const date = new Date(timestamp);
	const pad = (value: number) => String(value).padStart(2, '0');
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function getRelativePath(rootUri: string, uri: string): string {
	const rootPath = decodeURIComponent(new URL(rootUri).pathname).replace(/\/$/, '');
	const targetPath = decodeURIComponent(new URL(uri).pathname).replace(/\/$/, '');
	return targetPath === rootPath ? '.' : targetPath.slice(rootPath.length + 1);
}

export function isMac(): boolean {
	return navigator.platform.toLowerCase().includes('mac');
}

export function getFileManagerName(): string {
	const platform = navigator.platform.toLowerCase();
	if (platform.includes('mac')) return 'Finder';
	if (platform.includes('win')) return 'File Explorer';
	return 'File Manager';
}