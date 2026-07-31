import { randomUUID } from 'node:crypto';
import * as vscode from 'vscode';
import { getDisplayName } from '../filesystem/entry';
import { ClipboardState } from '../filesystem/operations';
import { ViewerDocument } from './document';
import { ViewerPanelController } from './panelController';
import { isUriWithinRoot } from './uri';

const viewerViewType = 'folderViewer.editor';
const favoritesStorageKey = 'folderViewer.favorites';
const favoriteNamesStorageKey = 'folderViewer.favoriteNames';

type PanelEntry = {
	rootUri: vscode.Uri;
	documentUri: vscode.Uri;
};

export class ViewerManager implements vscode.Disposable {
	private clipboardState: ClipboardState | undefined;
	private readonly panels = new Map<vscode.WebviewPanel, PanelEntry>();
	private readonly initialViewStates = new Map<string, ViewerDocument['latestViewState']>();
	private readonly disposables: vscode.Disposable[] = [];

	constructor(private readonly context: vscode.ExtensionContext) { }

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
		return this.context.globalState.get<string[]>(favoritesStorageKey, []);
	}

	async updateFavorite(targetUri: vscode.Uri, favorite: boolean): Promise<void> {
		const favorites = this.getFavorites();
		const target = targetUri.toString();
		const updatedFavorites = favorite
			? [...new Set([...favorites, target])]
			: favorites.filter(uri => uri !== target);
		await this.context.globalState.update(favoritesStorageKey, updatedFavorites);
		if (!favorite) {
			const names = this.getFavoriteNames();
			delete names[target];
			await this.context.globalState.update(favoriteNamesStorageKey, names);
		}
		await this.broadcastFavorites(updatedFavorites);
	}

	async renameFavorite(targetUri: vscode.Uri): Promise<void> {
		const target = targetUri.toString();
		if (!this.getFavorites().includes(target)) {
			return;
		}
		const names = this.getFavoriteNames();
		const currentName = names[target] ?? getDisplayName(targetUri);
		const newName = await vscode.window.showInputBox({
			title: 'Rename Favorite',
			prompt: 'Enter a display name',
			value: currentName,
			valueSelection: [0, currentName.length],
			validateInput: value => value.trim() ? undefined : 'The name cannot be empty.'
		});
		if (newName === undefined || newName.trim() === currentName) {
			return;
		}
		names[target] = newName.trim();
		await this.context.globalState.update(favoriteNamesStorageKey, names);
		await this.broadcastFavorites(this.getFavorites());
	}

	async openFolderViewer(
		rootUri: vscode.Uri,
		viewColumn: vscode.ViewColumn = vscode.ViewColumn.Active,
		initialViewState?: ViewerDocument['latestViewState']
	): Promise<void> {
		const folderName = getDisplayName(rootUri);
		const resourceName = folderName === '/' ? 'root' : folderName;
		const resourceUri = vscode.Uri.from({
			scheme: 'folder-viewer',
			path: `/${resourceName}`,
			query: new URLSearchParams({ root: rootUri.toString(), id: randomUUID() }).toString()
		});
		if (initialViewState) {
			this.initialViewStates.set(resourceUri.toString(), {
				currentUri: initialViewState.currentUri,
				history: [...initialViewState.history]
			});
		}
		await vscode.commands.executeCommand('vscode.openWith', resourceUri, viewerViewType, {
			preview: false,
			viewColumn
		});
	}

	private openCustomDocument(uri: vscode.Uri): ViewerDocument {
		const rootValue = new URLSearchParams(uri.query).get('root');
		if (!rootValue) {
			throw new Error('The folder viewer resource does not contain a root folder.');
		}
		const document = new ViewerDocument(uri, vscode.Uri.parse(rootValue));
		const initialViewState = this.initialViewStates.get(uri.toString());
		if (initialViewState) {
			document.latestViewState = initialViewState;
			this.initialViewStates.delete(uri.toString());
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
			favorites: this.getFavoriteEntries(rootUri, this.getFavorites())
		});
	}

	private async broadcastFavorites(favorites: string[]): Promise<void> {
		await Promise.all([...this.panels].map(([panel, { rootUri }]) => panel.webview.postMessage({
			type: 'favoritesChanged',
			favorites: this.getFavoriteEntries(rootUri, favorites)
		})));
	}

	private getFavoriteNames(): Record<string, string> {
		return { ...this.context.globalState.get<Record<string, string>>(favoriteNamesStorageKey, {}) };
	}

	private getFavoriteEntries(rootUri: vscode.Uri, favorites: string[]) {
		const names = this.getFavoriteNames();
		return favorites
			.filter(value => isUriWithinRoot(rootUri, value))
			.map(uri => ({ uri, name: names[uri] }));
	}
}