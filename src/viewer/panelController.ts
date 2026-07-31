import * as vscode from 'vscode';
import { ArchiveOperation, compressEntries, extractArchive, OperationCancelledError } from '../archive';
import { calculateDirectorySize, readDirectory } from '../filesystem/directoryService';
import { getDisplayName } from '../filesystem/entry';
import { createDirectory, deleteEntries, pasteEntries, renameEntry } from '../filesystem/operations';
import { getWebviewHtml } from '../webview';
import { ViewerDocument } from './document';
import { webviewFocusContextKey, type ViewerManager } from './manager';
import { WebviewMessage } from './messages';
import { getSafeUri } from './uri';

export class ViewerPanelController implements vscode.Disposable {
	private readonly archiveOperations = new Map<string, ArchiveOperation>();
	private readonly directorySizeOperations = new Set<vscode.CancellationTokenSource>();
	private readonly disposables: vscode.Disposable[] = [];

	constructor(
		context: vscode.ExtensionContext,
		private readonly manager: ViewerManager,
		private readonly panel: vscode.WebviewPanel,
		private readonly document: ViewerDocument
	) {
		const rootUri = document.rootUri;
		const folderName = getDisplayName(rootUri);
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
		panel.webview.html = getWebviewHtml(panel.webview, context.extensionUri, rootUri, folderName, document.latestViewState);
	}

	dispose(): void {
		void this.setWebviewFocus(false);
		this.archiveOperations.forEach(operation => operation.cancelled = true);
		this.cancelDirectorySizeOperations();
		this.disposables.forEach(disposable => disposable.dispose());
	}

	private async handleMessage(message: WebviewMessage): Promise<void> {
		try {
			await this.dispatchMessage(message);
		} catch (error) {
			if (error instanceof OperationCancelledError && 'operationId' in message) {
				await this.panel.webview.postMessage({ type: 'archiveCancelled', operationId: message.operationId });
				return;
			}
			await this.panel.webview.postMessage({
				type: 'error',
				message: error instanceof Error ? error.message : String(error),
				operationId: 'operationId' in message ? message.operationId : undefined
			});
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
				await this.paste(message.destinationUri);
				return;
			case 'createDirectory':
				await this.createDirectory(message.parentUri);
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
		if (await createDirectory(parentUri)) {
			await this.panel.webview.postMessage({ type: 'createdDirectory' });
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

	private async paste(destinationValue: string): Promise<void> {
		const clipboardState = this.manager.getClipboardState();
		if (!clipboardState?.uris.length) {
			throw new Error('There is no item to paste.');
		}
		const result = await pasteEntries(clipboardState, getSafeUri(this.document.rootUri, destinationValue));
		await this.manager.removeCompletedCutEntries(result.completedUris);
		if (result.changed) {
			await this.panel.webview.postMessage({ type: 'pasted' });
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

	private cancelDirectorySizeOperations(): void {
		this.directorySizeOperations.forEach(operation => operation.cancel());
	}
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