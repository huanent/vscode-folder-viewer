export type WebviewMessage =
	| { type: 'ready'; currentUri?: string }
	| { type: 'stateChanged'; currentUri: string; history: string[] }
	| { type: 'readDirectory'; uri: string }
	| { type: 'openFile'; uri: string }
	| { type: 'calculateDirectorySize'; uri: string }
	| { type: 'setClipboard'; uris: string[]; operation: 'cut' | 'copy' }
	| { type: 'paste'; destinationUri: string }
	| { type: 'rename'; uri: string }
	| { type: 'copyPath'; uris: string[] }
	| { type: 'setFavorite'; uri: string; favorite: boolean }
	| { type: 'openInNewTab'; uri: string }
	| { type: 'openInNewWindow'; uri: string }
	| { type: 'openInTerminal'; uri: string }
	| { type: 'compress'; operationId: string; uris: string[]; destinationUri: string }
	| { type: 'extract'; operationId: string; uri: string }
	| { type: 'cancelOperation'; operationId: string }
	| { type: 'delete'; uris: string[]; permanent: boolean };