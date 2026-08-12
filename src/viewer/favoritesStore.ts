import * as vscode from 'vscode';

const favoritesStorageKey = 'folderViewer.favorites';
const storageFileName = 'favorites.json';

type FavoritesData = {
	favorites: string[];
};

export class FavoritesStore {
	private data: FavoritesData = { favorites: [] };
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
				favorites: this.context.globalState.get<string[]>(favoritesStorageKey, [])
			};
			await this.save();
			await this.context.globalState.update(favoritesStorageKey, undefined);
		}
	}

	getFavorites(): string[] {
		return [...this.data.favorites];
	}

	async setFavorites(favorites: string[]): Promise<void> {
		this.data.favorites = [...favorites];
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
	const { favorites } = value as Partial<FavoritesData>;
	if (!Array.isArray(favorites) || !favorites.every(item => typeof item === 'string')) {
		throw new Error('The favorites storage file contains invalid favorites.');
	}
	return { favorites: [...favorites] };
}

function isFileNotFound(error: unknown): boolean {
	return error instanceof vscode.FileSystemError && error.code === 'FileNotFound';
}