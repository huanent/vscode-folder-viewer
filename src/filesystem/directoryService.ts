import * as vscode from 'vscode';

export interface FileEntry {
	name: string;
	uri: string;
	type: 'file' | 'directory';
	size: number;
	created: number;
	modified: number;
}

export async function readDirectory(directoryUri: vscode.Uri): Promise<FileEntry[]> {
	const limit = createConcurrencyLimit(64);
	const directoryEntries = (await vscode.workspace.fs.readDirectory(directoryUri))
		.filter(([name]) => name !== '.DS_Store');
	const entries = await Promise.all(
		directoryEntries.map(async ([name, fileType]): Promise<FileEntry> => {
			const uri = vscode.Uri.joinPath(directoryUri, name);
			const stat = await limit(() => vscode.workspace.fs.stat(uri));
			return {
				name,
				uri: uri.toString(),
				type: fileType & vscode.FileType.Directory ? 'directory' : 'file',
				size: stat.size,
				created: stat.ctime,
				modified: stat.mtime
			};
		})
	);

	return entries.sort((left, right) => {
		if (left.type !== right.type) {
			return left.type === 'directory' ? -1 : 1;
		}
		return left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' });
	});
}

export async function calculateDirectorySize(directoryUri: vscode.Uri, token: vscode.CancellationToken): Promise<number> {
	const limit = createConcurrencyLimit(16);

	async function visitDirectory(uri: vscode.Uri): Promise<number> {
		throwIfCancelled(token);
		const entries = await limit(() => vscode.workspace.fs.readDirectory(uri));
		throwIfCancelled(token);
		const sizes = await Promise.all(entries.map(async ([name, fileType]) => {
			throwIfCancelled(token);
			if (fileType & vscode.FileType.SymbolicLink) {
				return 0;
			}

			const entryUri = vscode.Uri.joinPath(uri, name);
			if (fileType & vscode.FileType.Directory) {
				return visitDirectory(entryUri);
			}
			const stat = await limit(() => vscode.workspace.fs.stat(entryUri));
			throwIfCancelled(token);
			return stat.size;
		}));

		return sizes.reduce((total, entrySize) => total + entrySize, 0);
	}

	return visitDirectory(directoryUri);
}

function throwIfCancelled(token: vscode.CancellationToken): void {
	if (token.isCancellationRequested) {
		throw new vscode.CancellationError();
	}
}

function createConcurrencyLimit(maxConcurrency: number) {
	let activeCount = 0;
	const pending: Array<() => void> = [];

	return async function limit<T>(operation: () => PromiseLike<T>): Promise<T> {
		if (activeCount >= maxConcurrency) {
			await new Promise<void>(resolve => pending.push(resolve));
		}
		activeCount++;

		try {
			return await operation();
		} finally {
			activeCount--;
			pending.shift()?.();
		}
	};
}