import type { FileEntry } from '../filesystem/directoryService';

export type WebviewMessage =
	| { type: 'ready'; currentUri?: string }
	| { type: 'focusChanged'; focused: boolean }
	| { type: 'stateChanged'; currentUri: string; history: string[] }
	| { type: 'readDirectory'; uri: string }
	| { type: 'openFile'; uri: string }
	| { type: 'calculateDirectorySize'; uri: string }
	| { type: 'setClipboard'; uris: string[]; operation: 'cut' | 'copy' }
	| { type: 'paste'; operationId: string; destinationUri: string }
	| { type: 'createDirectory'; parentUri: string }
	| { type: 'createFile'; parentUri: string }
	| { type: 'rename'; uri: string }
	| { type: 'copyPath'; uris: string[] }
	| { type: 'setFavorite'; uri: string; favorite: boolean }
	| { type: 'renameFavorite'; uri: string }
	| { type: 'openInCurrentWindow'; uri: string }
	| { type: 'openInNewTab'; uri: string }
	| { type: 'openInNewWindow'; uri: string }
	| { type: 'openInTerminal'; uri: string }
	| { type: 'compress'; operationId: string; uris: string[]; destinationUri: string }
	| { type: 'extract'; operationId: string; uri: string }
	| { type: 'cancelOperation'; operationId: string }
	| { type: 'delete'; uris: string[]; permanent: boolean };

export interface FavoriteEntry {
	uri: string;
	name?: string;
}

export type ExtensionMessage =
	| { type: 'directory'; rootUri: string; currentUri: string; entries: FileEntry[] }
	| { type: 'archiveProgress'; operationId: string; percent: number; detail: string }
	| { type: 'pasteProgress'; operationId: string; operation: 'cut' | 'copy'; percent: number; detail: string }
	| { type: 'createdDirectory' | 'deleted' | 'renamed' }
	| { type: 'createdFile'; uri: string }
	| { type: 'pasted'; operationId: string; uris: string[] }
	| { type: 'compressed' | 'extracted' | 'archiveCancelled' | 'archiveDismissed' | 'pasteCancelled'; operationId: string }
	| { type: 'clipboardChanged'; hasEntry: boolean; operation: 'cut' | 'copy'; uris: string[] }
	| { type: 'favoritesChanged'; favorites: FavoriteEntry[] }
	| { type: 'directorySize'; uri: string; size: number }
	| { type: 'directorySizeError'; uri: string; message: string }
	| { type: 'error'; message: string; operationId?: string };