import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import { ArchiveOperation, compressEntries, extractArchive, OperationCancelledError } from '../archive';
import { calculateDirectorySize, readDirectory } from '../filesystem/directoryService';
import { getDisplayName } from '../filesystem/entry';
import { createDirectory, createFile, deleteEntries, pasteEntries, PasteCancelledError, renameEntry } from '../filesystem/operations';
import { getWebviewHtml } from '../webview';
import { ViewerDocument } from './document';
import { webviewFocusContextKey, type ViewerManager } from './manager';
import { WebviewMessage } from './messages';
import { getSafeUri } from './uri';

export class ViewerPanelController implements vscode.Disposable {
	private readonly archiveOperations = new Map<string, ArchiveOperation>();
	private readonly pasteOperations = new Map<string, vscode.CancellationTokenSource>();
	private readonly directorySizeOperations = new Set<vscode.CancellationTokenSource>();
	private readonly disposables: vscode.Disposable[] = [];

	constructor(
		context: vscode.ExtensionContext,
		private readonly manager: ViewerManager,
		private readonly panel: vscode.WebviewPanel,
		private readonly document: ViewerDocument
	) {
		const rootUri = document.rootUri;
		const currentUri = getSafeUri(rootUri, document.latestViewState.currentUri);
		const folderName = getDisplayName(currentUri);
		panel.title = folderName;
		panel.webview.options = {
			enableScripts: true,
			localResourceRoots: [
				vscode.Uri.joinPath(context.extensionUri, 'media')
			]
		};
		panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'resources', 'logo.svg');
		this.disposables.push(panel.webview.onDidReceiveMessage(message => this.handleMessage(message)));
		this.disposables.push(panel.onDidChangeViewState(event => {
			if (!event.webviewPanel.active) {
				void this.setWebviewFocus(false);
			}
		}));
		void this.initializeWebview(context.extensionUri, rootUri, currentUri, folderName);
	}

	dispose(): void {
		void this.setWebviewFocus(false);
		this.archiveOperations.forEach(operation => operation.cancelled = true);
		this.pasteOperations.forEach(operation => operation.cancel());
		this.cancelDirectorySizeOperations();
		this.disposables.forEach(disposable => disposable.dispose());
	}

	private async handleMessage(message: WebviewMessage): Promise<void> {
		try {
			await this.dispatchMessage(message);
		} catch (error) {
			const messageText = error instanceof Error ? error.message : String(error);
			if (error instanceof OperationCancelledError && 'operationId' in message) {
				await this.panel.webview.postMessage({ type: 'archiveCancelled', operationId: message.operationId });
				return;
			}
			if (error instanceof PasteCancelledError && 'operationId' in message) {
				await this.panel.webview.postMessage({ type: 'pasteCancelled', operationId: message.operationId });
				return;
			}
			void vscode.window.showErrorMessage(messageText);
			await this.panel.webview.postMessage({
				type: 'error',
				message: messageText,
				operationId: 'operationId' in message ? message.operationId : undefined
			});
		}
	}

	private async initializeWebview(
		extensionUri: vscode.Uri,
		rootUri: vscode.Uri,
		currentUri: vscode.Uri,
		folderName: string
	): Promise<void> {
		try {
			const initialEntries = await readDirectory(currentUri);
			this.panel.webview.html = getWebviewHtml(this.panel.webview, extensionUri, rootUri, folderName, this.document.latestViewState, initialEntries);
		} catch (error) {
			if (currentUri.toString() === rootUri.toString() || !isFileNotFound(error)) {
				throw error;
			}
			const initialEntries = await readDirectory(rootUri);
			this.document.latestViewState = { currentUri: rootUri.toString(), history: [] };
			this.panel.title = getDisplayName(rootUri);
			this.panel.webview.html = getWebviewHtml(this.panel.webview, extensionUri, rootUri, getDisplayName(rootUri), this.document.latestViewState, initialEntries);
		}
	}

	private async dispatchMessage(message: WebviewMessage): Promise<void> {
		const rootUri = this.document.rootUri;
		switch (message.type) {
			case 'focusChanged':
				await this.setWebviewFocus(message.focused);
				return;
			case 'cancelOperation':
				this.cancelArchiveOperation(message.operationId);
				this.cancelPasteOperation(message.operationId);
				return;
			case 'stateChanged':
				this.document.latestViewState = {
					currentUri: getSafeUri(rootUri, message.currentUri).toString(),
					history: message.history.map(uri => getSafeUri(rootUri, uri).toString())
				};
				return;
			case 'ready':
				await this.handleReady(message.currentUri);
				return;
			case 'readDirectory':
				this.cancelDirectorySizeOperations();
				await this.sendDirectory(getSafeUri(rootUri, message.uri));
				return;
			case 'navigateQuickLocation':
				this.cancelDirectorySizeOperations();
				await this.sendDirectory(resolveQuickLocationUri(rootUri, message.location));
				return;
			case 'navigatePath':
				this.cancelDirectorySizeOperations();
				await this.sendDirectory(resolveNavigationUri(rootUri, getSafeUri(rootUri, message.currentUri), message.path));
				return;
			case 'openFile':
				await vscode.commands.executeCommand('vscode.open', getSafeUri(rootUri, message.uri));
				return;
			case 'calculateDirectorySize':
				await this.calculateDirectorySize(message.uri);
				return;
			case 'setClipboard':
				await this.manager.setClipboardState({
					uris: message.uris.map(uri => getSafeUri(rootUri, uri)),
					operation: message.operation
				});
				return;
			case 'paste':
				await this.paste(message.operationId, message.destinationUri);
				return;
			case 'createDirectory':
				await this.createDirectory(message.parentUri);
				return;
			case 'createFile':
				await this.createFile(message.parentUri);
				return;
			case 'rename':
				if (await renameEntry(getSafeUri(rootUri, message.uri))) {
					await this.panel.webview.postMessage({ type: 'renamed' });
				}
				return;
			case 'copyPath':
				await vscode.env.clipboard.writeText(message.uris.map(uri => getSafeUri(rootUri, uri).fsPath).join('\n'));
				return;
			case 'setFavorite':
				await this.setFavorite(message.uri, message.favorite);
				return;
			case 'renameFavorite':
				await this.manager.renameFavorite(getSafeUri(rootUri, message.uri));
				return;
			case 'openInCurrentWindow':
				await this.openDirectory(
					message.uri,
					'Only folders can be opened in the current window.',
					uri => vscode.commands.executeCommand('vscode.openFolder', uri, false)
				);
				return;
			case 'openInNewTab':
				await this.openDirectory(
					message.uri,
					'Only folders can be opened in a new tab.',
					uri => this.manager.openFolderViewer(uri)
				);
				return;
			case 'openInNewWindow':
				await this.openDirectory(
					message.uri,
					'Only folders can be opened in a new window.',
					uri => vscode.commands.executeCommand('vscode.openFolder', uri, true)
				);
				return;
			case 'openInTerminal':
				await this.openInTerminal(message.uri);
				return;
			case 'compress':
				await this.compress(message.operationId, message.uris, message.destinationUri);
				return;
			case 'extract':
				await this.extract(message.operationId, message.uri);
				return;
			case 'delete': {
				const targetUris = message.uris.map(uri => getSafeUri(rootUri, uri));
				if (targetUris.some(uri => uri.toString() === rootUri.toString())) {
					throw new Error('The root folder cannot be deleted.');
				}
				if (await deleteEntries(targetUris, message.permanent)) {
					await this.panel.webview.postMessage({ type: 'deleted' });
				}
				return;
			}
		}
	}

	private setWebviewFocus(focused: boolean): Thenable<unknown> {
		return vscode.commands.executeCommand('setContext', webviewFocusContextKey, focused && this.panel.active);
	}

	private async createDirectory(parentValue: string): Promise<void> {
		const parentUri = getSafeUri(this.document.rootUri, parentValue);
		await assertDirectory(parentUri, 'Subfolders can only be created inside a folder.');
		const directoryUri = await createDirectory(parentUri);
		if (directoryUri) {
			await this.panel.webview.postMessage({ type: 'createdDirectory', uri: directoryUri.toString(), parentUri: parentUri.toString() });
		}
	}

	private async createFile(parentValue: string): Promise<void> {
		const parentUri = getSafeUri(this.document.rootUri, parentValue);
		await assertDirectory(parentUri, 'Files can only be created inside a folder.');
		const fileUri = await createFile(parentUri);
		if (fileUri) {
			await this.panel.webview.postMessage({ type: 'createdFile', uri: fileUri.toString(), parentUri: parentUri.toString() });
		}
	}

	private async handleReady(currentValue?: string): Promise<void> {
		const rootUri = this.document.rootUri;
		const currentUri = currentValue ? getSafeUri(rootUri, currentValue) : rootUri;
		try {
			await this.sendDirectory(currentUri);
		} catch (error) {
			if (currentUri.toString() === rootUri.toString() || !isFileNotFound(error)) {
				throw error;
			}
			this.document.latestViewState = { currentUri: rootUri.toString(), history: [] };
			await this.sendDirectory(rootUri);
		}
		await this.manager.sendClipboardState(this.panel.webview);
		await this.manager.sendFavorites(this.panel.webview, rootUri);
	}

	private async sendDirectory(directoryUri: vscode.Uri): Promise<void> {
		this.panel.title = getDisplayName(directoryUri);
		await this.panel.webview.postMessage({
			type: 'directory',
			rootUri: this.document.rootUri.toString(),
			currentUri: directoryUri.toString(),
			entries: await readDirectory(directoryUri)
		});
	}

	private async calculateDirectorySize(uriValue: string): Promise<void> {
		const operation = new vscode.CancellationTokenSource();
		this.directorySizeOperations.add(operation);
		try {
			const size = await calculateDirectorySize(getSafeUri(this.document.rootUri, uriValue), operation.token);
			await this.panel.webview.postMessage({ type: 'directorySize', uri: uriValue, size });
		} catch (error) {
			if (!operation.token.isCancellationRequested) {
				await this.panel.webview.postMessage({
					type: 'directorySizeError',
					uri: uriValue,
					message: error instanceof Error ? error.message : String(error)
				});
			}
		} finally {
			this.directorySizeOperations.delete(operation);
			operation.dispose();
		}
	}

	private async paste(operationId: string, destinationValue: string): Promise<void> {
		const clipboardState = this.manager.getClipboardState();
		if (!clipboardState?.uris.length) {
			throw new Error('There is no item to paste.');
		}
		const operation = new vscode.CancellationTokenSource();
		this.pasteOperations.set(operationId, operation);
		try {
			const result = await pasteEntries(clipboardState, getSafeUri(this.document.rootUri, destinationValue), {
				token: operation.token,
				onProgress: progress => void this.panel.webview.postMessage({ type: 'pasteProgress', operationId, operation: clipboardState.operation, ...progress })
			});
			await this.manager.removeCompletedCutEntries(result.completedUris);
			await this.panel.webview.postMessage({
				type: 'pasted',
				operationId,
				uris: result.pastedUris.map(uri => uri.toString()),
				destinationUri: getSafeUri(this.document.rootUri, destinationValue).toString()
			});
		} finally {
			this.pasteOperations.delete(operationId);
			operation.dispose();
		}
	}

	private async setFavorite(uriValue: string, favorite: boolean): Promise<void> {
		const targetUri = getSafeUri(this.document.rootUri, uriValue);
		if (favorite) {
			await assertDirectory(targetUri, 'Only folders can be added to favorites.');
		}
		await this.manager.updateFavorite(targetUri, favorite);
	}

	private async openDirectory(
		uriValue: string,
		errorMessage: string,
		open: (uri: vscode.Uri) => PromiseLike<unknown> | unknown
	): Promise<void> {
		const directoryUri = getSafeUri(this.document.rootUri, uriValue);
		await assertDirectory(directoryUri, errorMessage);
		await open(directoryUri);
	}

	private async openInTerminal(uriValue: string): Promise<void> {
		const targetUri = getSafeUri(this.document.rootUri, uriValue);
		const stat = await vscode.workspace.fs.stat(targetUri);
		const directoryUri = stat.type & vscode.FileType.Directory ? targetUri : vscode.Uri.joinPath(targetUri, '..');
		vscode.window.createTerminal({ cwd: directoryUri, name: getDisplayName(directoryUri) }).show();
	}

	private async compress(operationId: string, uriValues: string[], destinationValue: string): Promise<void> {
		const operation = { cancelled: false };
		this.archiveOperations.set(operationId, operation);
		try {
			await compressEntries(
				uriValues.map(uri => getSafeUri(this.document.rootUri, uri)),
				getSafeUri(this.document.rootUri, destinationValue),
				operation,
				progress => void this.panel.webview.postMessage({ type: 'archiveProgress', operationId, ...progress })
			);
			await this.panel.webview.postMessage({ type: 'compressed', operationId });
		} finally {
			this.archiveOperations.delete(operationId);
		}
	}

	private async extract(operationId: string, uriValue: string): Promise<void> {
		const operation = { cancelled: false };
		this.archiveOperations.set(operationId, operation);
		try {
			const extracted = await extractArchive(
				getSafeUri(this.document.rootUri, uriValue),
				operation,
				progress => void this.panel.webview.postMessage({ type: 'archiveProgress', operationId, ...progress })
			);
			await this.panel.webview.postMessage({ type: extracted ? 'extracted' : 'archiveDismissed', operationId });
		} finally {
			this.archiveOperations.delete(operationId);
		}
	}

	private cancelArchiveOperation(operationId: string): void {
		const operation = this.archiveOperations.get(operationId);
		if (operation) {
			operation.cancelled = true;
		}
	}

	private cancelPasteOperation(operationId: string): void {
		this.pasteOperations.get(operationId)?.cancel();
	}

	private cancelDirectorySizeOperations(): void {
		this.directorySizeOperations.forEach(operation => operation.cancel());
	}
}

function resolveQuickLocationUri(
	rootUri: vscode.Uri,
	location: 'desktop' | 'downloads' | 'documents' | 'tmp'
): vscode.Uri {
	if (location === 'tmp') {
		const sharedTempDirectory = process.platform === 'win32'
			? path.join(process.env.SystemRoot ?? 'C:\\Windows', 'Temp')
			: '/tmp';
		return getSafeUri(rootUri, vscode.Uri.file(sharedTempDirectory).toString());
	}
	const homeDirectory = os.homedir();
	const directoryNames = {
		desktop: 'Desktop',
		downloads: 'Downloads',
		documents: 'Documents'
	};
	return getSafeUri(rootUri, vscode.Uri.file(path.join(homeDirectory, directoryNames[location])).toString());
}

function resolveNavigationUri(rootUri: vscode.Uri, currentUri: vscode.Uri, value: string): vscode.Uri {
	const target = value.trim();
	if (!target) {
		throw new Error('Enter a path to navigate to.');
	}

	let candidate: vscode.Uri;
	if (/^[a-z][a-z\d+.-]*:/i.test(target) && !/^[a-z]:[\\/]/i.test(target)) {
		candidate = vscode.Uri.parse(target, true);
	} else if (rootUri.scheme === 'file') {
		const filePath = /^\/[a-z]:[\\/]/i.test(target) ? target.slice(1) : target;
		candidate = path.isAbsolute(filePath) || /^[a-z]:[\\/]/i.test(filePath) || filePath.startsWith('\\\\')
			? vscode.Uri.file(filePath)
			: vscode.Uri.joinPath(currentUri, filePath.replaceAll('\\', '/'));
	} else if (target.startsWith('/')) {
		candidate = currentUri.with({ path: path.posix.normalize(target) });
	} else {
		candidate = vscode.Uri.joinPath(currentUri, target.replaceAll('\\', '/'));
	}

	return getSafeUri(rootUri, candidate.toString());
}

async function assertDirectory(uri: vscode.Uri, errorMessage: string): Promise<void> {
	const stat = await vscode.workspace.fs.stat(uri);
	if (!(stat.type & vscode.FileType.Directory)) {
		throw new Error(errorMessage);
	}
}

function isFileNotFound(error: unknown): boolean {
	return error instanceof vscode.FileSystemError && error.code === 'FileNotFound';
}