import type { FileEntry } from '../filesystem/directoryService';
import type { ArchiveTreeEntry } from '../archive';

export type WebviewMessage =
	| { type: 'ready'; currentUri?: string }
	| { type: 'focusChanged'; focused: boolean }
	| { type: 'stateChanged'; currentUri: string; history: string[] }
	| { type: 'readDirectory'; uri: string }
	| { type: 'navigateQuickLocation'; location: 'desktop' | 'downloads' | 'documents' | 'tmp' }
	| { type: 'navigatePath'; path: string; currentUri: string }
	| { type: 'openFile'; uri: string }
	| { type: 'calculateDirectorySize'; uri: string }
	| { type: 'setClipboard'; uris: string[]; operation: 'cut' | 'copy' }
	| { type: 'paste'; operationId: string; destinationUri: string }
	| { type: 'createDirectory'; parentUri: string }
	| { type: 'createFile'; parentUri: string }
	| { type: 'rename'; uri: string }
	| { type: 'copyPath'; uris: string[] }
	| { type: 'setFavorite'; uri: string; favorite: boolean }
	| { type: 'openInCurrentWindow'; uri: string }
	| { type: 'openInNewTab'; uri: string }
	| { type: 'openInNewWindow'; uri: string }
	| { type: 'openInTerminal'; uri: string }
	| { type: 'previewArchive'; uri: string }
	| { type: 'compress'; operationId: string; uris: string[]; destinationUri: string }
	| { type: 'extract'; operationId: string; uri: string }
	| { type: 'cancelOperation'; operationId: string }
	| { type: 'delete'; uris: string[]; permanent: boolean };

export type ExtensionMessage =
	| { type: 'directory'; rootUri: string; currentUri: string; entries: FileEntry[] }
	| { type: 'archivePreview'; uri: string; name: string; entries: ArchiveTreeEntry[] }
	| { type: 'archiveProgress'; operationId: string; percent: number; detail: string }
	| { type: 'pasteProgress'; operationId: string; operation: 'cut' | 'copy'; percent: number; detail: string }
	| { type: 'createdDirectory' | 'createdFile'; uri: string; parentUri: string }
	| { type: 'deleted' | 'renamed' }
	| { type: 'pasted'; operationId: string; uris: string[]; destinationUri: string }
	| { type: 'compressed' | 'extracted' | 'archiveCancelled' | 'archiveDismissed' | 'pasteCancelled'; operationId: string }
	| { type: 'clipboardChanged'; hasEntry: boolean; operation: 'cut' | 'copy'; uris: string[] }
	| { type: 'favoritesChanged'; favorites: string[] }
	| { type: 'directorySize'; uri: string; size: number }
	| { type: 'directorySizeError'; uri: string; message: string }
	| { type: 'error'; message: string; operationId?: string };

export type { ArchiveTreeEntry } from '../archive';