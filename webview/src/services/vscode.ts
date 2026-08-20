import type { PersistedState } from '../types';

export type OutboundMessage =
	| { type: 'ready'; currentUri: string }
	| { type: 'focusChanged'; focused: boolean }
	| { type: 'stateChanged'; currentUri: string; history: string[] }
	| { type: 'readDirectory'; uri: string }
	| { type: 'navigateQuickLocation'; location: 'desktop' | 'downloads' | 'documents' | 'tmp' }
	| { type: 'openFile'; uri: string }
	| { type: 'previewSpreadsheet'; uri: string }
	| { type: 'runApplication'; uri: string }
	| { type: 'calculateDirectorySize'; uri: string }
	| { type: 'setClipboard'; uris: string[]; operation: 'cut' | 'copy' }
	| { type: 'paste'; operationId: string; destinationUri: string }
	| { type: 'createDirectory'; parentUri: string }
	| { type: 'createFile'; parentUri: string }
	| { type: 'rename'; uri: string }
	| { type: 'copyPath'; uris: string[] }
	| { type: 'setFavorite'; uri: string; favorite: boolean }
	| { type: 'openInCurrentWindow' | 'openInNewTab' | 'openInNewWindow' | 'openInTerminal' | 'openInFileManager'; uri: string }
	| { type: 'previewArchive'; uri: string }
	| { type: 'compress'; operationId: string; uris: string[]; destinationUri: string }
	| { type: 'extract'; operationId: string; uri: string }
	| { type: 'cancelOperation'; operationId: string }
	| { type: 'delete'; uris: string[]; permanent: boolean };

const api = acquireVsCodeApi<PersistedState>();

export const vscode = {
	getState: () => api.getState(),
	setState: (state: PersistedState) => api.setState(state),
	postMessage: (message: OutboundMessage) => api.postMessage(message)
};