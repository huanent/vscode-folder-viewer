export interface FileEntry {
	name: string;
	uri: string;
	type: 'file' | 'directory';
	size: number;
	created: number;
	modified: number;
	calculatedSize?: number;
	calculating?: boolean;
}

export interface FavoriteEntry {
	uri: string;
	name?: string;
}

export interface PersistedState {
	rootUri: string;
	currentUri: string;
	history: string[];
}

export interface ArchiveOperation {
	id: string;
	kind: 'compress' | 'extract';
	cancelling: boolean;
	percent: number;
	detail: string;
}

export interface ContextMenuState {
	x: number;
	y: number;
	entry: FileEntry | null;
}