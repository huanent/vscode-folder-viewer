import { randomUUID } from 'node:crypto';
import * as vscode from 'vscode';
import { getDisplayName } from '../filesystem/entry';
import { ClipboardState } from '../filesystem/operations';
import { readSpreadsheet } from '../spreadsheet';
import { getSpreadsheetPreviewHtml } from '../webview';
import { ViewerDocument } from './document';
import { FavoritesStore } from './favoritesStore';
import { ViewerPanelController } from './panelController';
import { isUriWithinRoot } from './uri';

const viewerViewType = 'folderViewer.editor';
export const webviewFocusContextKey = 'folderViewer.webviewFocus';

type PanelEntry = {
	rootUri: vscode.Uri;
	documentUri: vscode.Uri;
};

export class ViewerManager implements vscode.Disposable {
	private clipboardState: ClipboardState | undefined;
	private readonly favoritesStore: FavoritesStore;
	private readonly panels = new Map<vscode.WebviewPanel, PanelEntry>();
	private readonly disposables: vscode.Disposable[] = [];

	constructor(private readonly context: vscode.ExtensionContext) {
		this.favoritesStore = new FavoritesStore(context);
	}

	async initialize(): Promise<void> {
		await this.favoritesStore.initialize();
	}

	register(): void {
		const editorProvider: vscode.CustomReadonlyEditorProvider<ViewerDocument> = {
			openCustomDocument: uri => this.openCustomDocument(uri),
			resolveCustomEditor: (document, panel) => this.configurePanel(document, panel)
		};

		this.disposables.push(
			vscode.window.registerCustomEditorProvider(viewerViewType, editorProvider, {
				supportsMultipleEditorsPerDocument: true,
				webviewOptions: { retainContextWhenHidden: true }
			})
		);
	}

	dispose(): void {
		this.disposables.forEach(disposable => disposable.dispose());
	}

	getClipboardState(): ClipboardState | undefined {
		return this.clipboardState;
	}

	async setClipboardState(state: ClipboardState): Promise<void> {
		this.clipboardState = state;
		await this.broadcastClipboardState();
	}

	async removeCompletedCutEntries(completedUris: vscode.Uri[]): Promise<void> {
		if (this.clipboardState?.operation !== 'cut' || completedUris.length === 0) {
			return;
		}
		const completed = new Set(completedUris.map(uri => uri.toString()));
		this.clipboardState.uris = this.clipboardState.uris.filter(uri => !completed.has(uri.toString()));
		await this.broadcastClipboardState();
	}

	getFavorites(): string[] {
		return this.favoritesStore.getFavorites();
	}

	async updateFavorite(targetUri: vscode.Uri, favorite: boolean): Promise<void> {
		const favorites = this.getFavorites();
		const target = targetUri.toString();
		const updatedFavorites = favorite
			? [...new Set([...favorites, target])]
			: favorites.filter(uri => uri !== target);
		await this.favoritesStore.setFavorites(updatedFavorites);
		await this.broadcastFavorites(updatedFavorites);
	}

	revealFolderViewer(): boolean {
		const panel = [...this.panels.keys()].at(-1);
		if (!panel) {
			return false;
		}
		panel.reveal(panel.viewColumn, false);
		return true;
	}

	async openFolderViewer(
		rootUri: vscode.Uri,
		viewColumn: vscode.ViewColumn = vscode.ViewColumn.Active,
		initialViewState?: ViewerDocument['latestViewState']
	): Promise<void> {
		const folderName = getDisplayName(rootUri);
		const resourceName = folderName === '/' ? 'root' : folderName;
		const query = new URLSearchParams({ root: rootUri.toString(), id: randomUUID() });
		if (initialViewState) {
			query.set('current', initialViewState.currentUri);
			query.set('history', JSON.stringify(initialViewState.history));
		}
		const resourceUri = vscode.Uri.from({
			scheme: 'folder-viewer',
			path: `/${resourceName}`,
			query: query.toString()
		});
		await vscode.commands.executeCommand('vscode.openWith', resourceUri, viewerViewType, {
			preview: false,
			viewColumn
		});
	}

	async openSpreadsheetPreview(uri: vscode.Uri): Promise<void> {
		const name = getDisplayName(uri);
		const panel = vscode.window.createWebviewPanel(
			'folderViewer.spreadsheetPreview',
			name,
			vscode.ViewColumn.Active,
			{
				enableScripts: true,
				localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media')]
			}
		);
		panel.iconPath = new vscode.ThemeIcon('table');
		const ready = waitForSpreadsheetPreviewReady(panel);
		panel.webview.html = getSpreadsheetPreviewHtml(panel.webview, this.context.extensionUri, name);
		try {
			await ready;
			const sheets = await readSpreadsheet(uri);
			await panel.webview.postMessage({ type: 'loaded', sheets });
		} catch (error) {
			await panel.webview.postMessage({
				type: 'error',
				message: error instanceof Error ? error.message : String(error)
			});
			throw error;
		}
	}

	private openCustomDocument(uri: vscode.Uri): ViewerDocument {
		const rootValue = new URLSearchParams(uri.query).get('root');
		if (!rootValue) {
			throw new Error('The folder viewer resource does not contain a root folder.');
		}
		const document = new ViewerDocument(uri, vscode.Uri.parse(rootValue));
		const currentValue = new URLSearchParams(uri.query).get('current');
		if (currentValue) {
			document.latestViewState = {
				currentUri: currentValue,
				history: parseHistory(uri)
			};
		}
		return document;
	}

	private configurePanel(document: ViewerDocument, panel: vscode.WebviewPanel): void {
		const isSplitCopy = [...this.panels.values()].some(entry => entry.documentUri.toString() === document.uri.toString());
		if (isSplitCopy) {
			void this.replaceSplitCopy(document, panel);
			return;
		}

		this.panels.set(panel, { rootUri: document.rootUri, documentUri: document.uri });
		const controller = new ViewerPanelController(this.context, this, panel, document);
		panel.onDidDispose(() => {
			this.panels.delete(panel);
			controller.dispose();
		});
	}

	private async replaceSplitCopy(document: ViewerDocument, panel: vscode.WebviewPanel): Promise<void> {
		try {
			await this.openFolderViewer(
				document.rootUri,
				panel.viewColumn ?? vscode.ViewColumn.Active,
				document.latestViewState
			);
		} finally {
			panel.dispose();
		}
	}

	private async broadcastClipboardState(): Promise<void> {
		if (!this.clipboardState) {
			return;
		}
		await Promise.all([...this.panels.keys()].map(panel => this.sendClipboardState(panel.webview)));
	}

	async sendClipboardState(webview: vscode.Webview): Promise<void> {
		if (!this.clipboardState) {
			return;
		}
		await webview.postMessage({
			type: 'clipboardChanged',
			hasEntry: this.clipboardState.uris.length > 0,
			operation: this.clipboardState.operation,
			uris: this.clipboardState.uris.map(uri => uri.toString())
		});
	}

	async sendFavorites(webview: vscode.Webview, rootUri: vscode.Uri): Promise<void> {
		await webview.postMessage({
			type: 'favoritesChanged',
			favorites: this.getFavoritesWithinRoot(rootUri, this.getFavorites())
		});
	}

	private async broadcastFavorites(favorites: string[]): Promise<void> {
		await Promise.all([...this.panels].map(([panel, { rootUri }]) => panel.webview.postMessage({
			type: 'favoritesChanged',
			favorites: this.getFavoritesWithinRoot(rootUri, favorites)
		})));
	}

	private getFavoritesWithinRoot(rootUri: vscode.Uri, favorites: string[]) {
		return favorites.filter(value => isUriWithinRoot(rootUri, value));
	}
}

function waitForSpreadsheetPreviewReady(panel: vscode.WebviewPanel): Promise<void> {
	return new Promise((resolve, reject) => {
		const messageDisposable = panel.webview.onDidReceiveMessage(message => {
			if (message?.type !== 'ready') return;
			messageDisposable.dispose();
			disposeDisposable.dispose();
			resolve();
		});
		const disposeDisposable = panel.onDidDispose(() => {
			messageDisposable.dispose();
			reject(new Error('Spreadsheet preview was closed before it finished loading.'));
		});
	});
}

function parseHistory(uri: vscode.Uri): string[] {
	const historyValue = new URLSearchParams(uri.query).get('history');
	if (!historyValue) {
		return [];
	}
	try {
		const history = JSON.parse(historyValue);
		return Array.isArray(history) && history.every(item => typeof item === 'string') ? history : [];
	} catch {
		return [];
	}
}