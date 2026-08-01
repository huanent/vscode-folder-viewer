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
	type PendingEntry = { uri: vscode.Uri; type: vscode.FileType };

	const maxConcurrency = 16;
	const pending: PendingEntry[] = [{ uri: directoryUri, type: vscode.FileType.Directory }];
	let activeCount = 0;
	let totalSize = 0;

	return new Promise<number>((resolve, reject) => {
		let settled = false;

		const fail = (error: unknown) => {
			if (!settled) {
				settled = true;
				reject(error);
			}
		};

		const schedule = () => {
			if (settled) return;
			try {
				throwIfCancelled(token);
			} catch (error) {
				fail(error);
				return;
			}

			while (activeCount < maxConcurrency && pending.length) {
				const entry = pending.pop();
				if (!entry) break;
				activeCount++;
				void processEntry(entry).then(() => {
					activeCount--;
					if (!pending.length && activeCount === 0) {
						settled = true;
						resolve(totalSize);
						return;
					}
					schedule();
				}, error => {
					activeCount--;
					fail(error);
				});
			}
		};

		const processEntry = async (entry: PendingEntry): Promise<void> => {
			throwIfCancelled(token);
			if (entry.type & vscode.FileType.SymbolicLink) return;
			if (entry.type & vscode.FileType.Directory) {
				const children = await vscode.workspace.fs.readDirectory(entry.uri);
				throwIfCancelled(token);
				for (const [name, fileType] of children) {
					if (!(fileType & vscode.FileType.SymbolicLink)) {
						pending.push({ uri: vscode.Uri.joinPath(entry.uri, name), type: fileType });
					}
				}
				return;
			}

			const stat = await vscode.workspace.fs.stat(entry.uri);
			throwIfCancelled(token);
			totalSize += stat.size;
		};

		schedule();
	});
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