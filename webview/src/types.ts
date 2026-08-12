export interface FileEntry {
	name: string;
	uri: string;
	type: 'file' | 'directory';
	size: number;
	created: number;
	modified: number;
	calculatedSize?: number;
	calculating?: boolean;
	calculationError?: string;
}

export interface PersistedState {
	rootUri: string;
	currentUri: string;
	history: string[];
}

export interface ArchiveOperation {
	id: string;
	kind: 'compress' | 'extract' | 'copy' | 'cut';
	cancelling: boolean;
	percent: number;
	detail: string;
}

export interface ContextMenuState {
	x: number;
	y: number;
	entry: FileEntry | null;
	directoryUri?: string;
}