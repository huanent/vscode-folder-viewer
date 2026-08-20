import * as vscode from 'vscode';

export interface FileEntry {
	name: string;
	uri: string;
	type: 'file' | 'directory';
	runnable?: boolean;
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
			const [stat, runnable] = await Promise.all([
				limit(() => vscode.workspace.fs.stat(uri)),
				limit(() => isRunnableApplication(uri, fileType))
			]);
			return {
				name,
				uri: uri.toString(),
				type: fileType & vscode.FileType.Directory ? 'directory' : 'file',
				runnable: runnable || undefined,
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

export async function isRunnableApplication(uri: vscode.Uri, fileType?: vscode.FileType): Promise<boolean> {
	if (uri.scheme !== 'file') return false;
	const type = fileType ?? (await vscode.workspace.fs.stat(uri)).type;
	const lowerName = uri.path.toLowerCase();
	if (process.platform === 'win32') {
		return Boolean(type & vscode.FileType.File) && lowerName.endsWith('.exe');
	}
	if (process.platform !== 'darwin' || !(type & vscode.FileType.Directory) || !lowerName.endsWith('.app')) {
		return false;
	}

	try {
		const contentsUri = vscode.Uri.joinPath(uri, 'Contents');
		const [infoStat, macOsStat, macOsEntries] = await Promise.all([
			vscode.workspace.fs.stat(vscode.Uri.joinPath(contentsUri, 'Info.plist')),
			vscode.workspace.fs.stat(vscode.Uri.joinPath(contentsUri, 'MacOS')),
			vscode.workspace.fs.readDirectory(vscode.Uri.joinPath(contentsUri, 'MacOS'))
		]);
		return Boolean(infoStat.type & vscode.FileType.File)
			&& Boolean(macOsStat.type & vscode.FileType.Directory)
			&& macOsEntries.some(([, entryType]) => Boolean(entryType & (vscode.FileType.File | vscode.FileType.SymbolicLink)));
	} catch {
		return false;
	}
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