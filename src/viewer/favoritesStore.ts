import * as vscode from 'vscode';

const favoritesStorageKey = 'folderViewer.favorites';
const favoriteNamesStorageKey = 'folderViewer.favoriteNames';
const storageFileName = 'favorites.json';

type FavoritesData = {
	favorites: string[];
	names: Record<string, string>;
};

export class FavoritesStore {
	private data: FavoritesData = { favorites: [], names: {} };
	private readonly storageUri: vscode.Uri;

	constructor(private readonly context: vscode.ExtensionContext) {
		this.storageUri = vscode.Uri.joinPath(context.globalStorageUri, storageFileName);
	}

	async initialize(): Promise<void> {
		try {
			const content = await vscode.workspace.fs.readFile(this.storageUri);
			this.data = parseFavoritesData(JSON.parse(new TextDecoder().decode(content)));
		} catch (error) {
			if (!isFileNotFound(error)) {
				throw error;
			}
			this.data = {
				favorites: this.context.globalState.get<string[]>(favoritesStorageKey, []),
				names: this.context.globalState.get<Record<string, string>>(favoriteNamesStorageKey, {})
			};
			await this.save();
			await Promise.all([
				this.context.globalState.update(favoritesStorageKey, undefined),
				this.context.globalState.update(favoriteNamesStorageKey, undefined)
			]);
		}
	}

	getFavorites(): string[] {
		return [...this.data.favorites];
	}

	getNames(): Record<string, string> {
		return { ...this.data.names };
	}

	async setFavorites(favorites: string[]): Promise<void> {
		this.data.favorites = [...favorites];
		await this.save();
	}

	async setNames(names: Record<string, string>): Promise<void> {
		this.data.names = { ...names };
		await this.save();
	}

	private async save(): Promise<void> {
		await vscode.workspace.fs.createDirectory(this.context.globalStorageUri);
		await vscode.workspace.fs.writeFile(
			this.storageUri,
			new TextEncoder().encode(JSON.stringify(this.data, undefined, 2))
		);
	}
}

function parseFavoritesData(value: unknown): FavoritesData {
	if (!value || typeof value !== 'object') {
		throw new Error('The favorites storage file is invalid.');
	}
	const { favorites, names } = value as Partial<FavoritesData>;
	if (!Array.isArray(favorites) || !favorites.every(item => typeof item === 'string')) {
		throw new Error('The favorites storage file contains invalid favorites.');
	}
	if (!names || typeof names !== 'object' || Array.isArray(names) || !Object.values(names).every(name => typeof name === 'string')) {
		throw new Error('The favorites storage file contains invalid names.');
	}
	return { favorites: [...favorites], names: { ...names } };
}

function isFileNotFound(error: unknown): boolean {
	return error instanceof vscode.FileSystemError && error.code === 'FileNotFound';
}