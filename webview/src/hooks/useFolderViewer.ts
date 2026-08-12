import { useEffect, useEffectEvent, useRef, useState } from 'react';
import type { ExtensionMessage } from '../../../src/viewer/messages';
import type { ArchiveOperation, ContextMenuState, FileEntry, PersistedState } from '../types';
import { vscode } from '../services/vscode';
import { useSelection } from './useSelection';

interface InitialState extends PersistedState {
	entries: FileEntry[];
}

function getInitialState(rootElement: HTMLElement): InitialState {
	const rootUri = rootElement.dataset.rootUri ?? '';
	const currentUri = rootElement.dataset.currentUri ?? rootUri;
	const savedState = vscode.getState();
	const persisted = savedState?.rootUri === rootUri && savedState.currentUri === currentUri ? savedState : undefined;
	return {
		rootUri,
		currentUri: persisted?.currentUri ?? currentUri,
		history: persisted?.history ?? JSON.parse(rootElement.dataset.history ?? '[]'),
		entries: JSON.parse(rootElement.dataset.entries ?? '[]')
	};
}

export function useFolderViewer(rootElement: HTMLElement) {
	const initial = getInitialState(rootElement);
	const [rootUri, setRootUri] = useState(initial.rootUri);
	const [currentUri, setCurrentUri] = useState(initial.currentUri);
	const [history, setHistory] = useState(initial.history);
	const [entries, setEntries] = useState(initial.entries);
	const selection = useSelection(entries);
	const [favoriteUris, setFavoriteUris] = useState<string[]>([]);
	const [pathInputOpen, setPathInputOpen] = useState(false);
	const [searchOpen, setSearchOpen] = useState(false);
	const [searchQuery, setSearchQuery] = useState('');
	const [hasClipboardEntry, setHasClipboardEntry] = useState(false);
	const [cutUris, setCutUris] = useState<Set<string>>(new Set());
	const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
	const [archiveOperation, setArchiveOperation] = useState<ArchiveOperation | null>(null);
	const pendingSelectionUrisRef = useRef<string[] | null>(null);
	const pendingScrollUriRef = useRef<string | null>(null);
	const pendingPathNavigationRef = useRef(false);
	const [status, setStatus] = useState('Loading...');

	function persist(nextCurrentUri: string, nextHistory: string[]) {
		const state = { rootUri, currentUri: nextCurrentUri, history: nextHistory };
		vscode.setState(state);
		vscode.postMessage({ type: 'stateChanged', currentUri: nextCurrentUri, history: nextHistory });
	}

	function requestDirectory(uri: string, addToHistory: boolean) {
		const nextHistory = addToHistory && uri !== currentUri ? [...history, currentUri] : history;
		setHistory(nextHistory);
		setCurrentUri(uri);
		setSearchOpen(false);
		setSearchQuery('');
		setContextMenu(null);
		setStatus('Loading...');
		persist(uri, nextHistory);
		vscode.postMessage({ type: 'readDirectory', uri });
	}

	function navigateBack() {
		const target = history.at(-1);
		if (!target) return;
		const nextHistory = history.slice(0, -1);
		setHistory(nextHistory);
		setCurrentUri(target);
		setSearchOpen(false);
		setSearchQuery('');
		setStatus('Loading...');
		persist(target, nextHistory);
		vscode.postMessage({ type: 'readDirectory', uri: target });
	}

	function navigatePath(path: string) {
		pendingPathNavigationRef.current = true;
		setPathInputOpen(false);
		setSearchOpen(false);
		setSearchQuery('');
		setContextMenu(null);
		setStatus('Loading...');
		vscode.postMessage({ type: 'navigatePath', path, currentUri });
	}

	function navigateQuickLocation(location: 'desktop' | 'downloads' | 'documents' | 'tmp') {
		pendingPathNavigationRef.current = true;
		setContextMenu(null);
		setStatus('Loading...');
		vscode.postMessage({ type: 'navigateQuickLocation', location });
	}

	function openEntry(entry: FileEntry) {
		if (entry.type === 'directory') {
			requestDirectory(entry.uri, true);
		} else if (entry.name.toLowerCase().endsWith('.zip')) {
			startArchive('extract', [entry]);
		} else {
			vscode.postMessage({ type: 'openFile', uri: entry.uri });
		}
	}

	function showContextMenu(event: React.MouseEvent, entry: FileEntry | null) {
		event.preventDefault();
		event.stopPropagation();
		if (entry && !selection.selectedUris.has(entry.uri)) {
			selection.selectUris([entry.uri]);
		} else if (!entry) {
			selection.clearSelection();
		}
		setContextMenu({ x: event.clientX, y: event.clientY, entry });
	}

	function showDirectoryContextMenu(event: React.MouseEvent, directoryUri: string) {
		event.preventDefault();
		event.stopPropagation();
		setContextMenu({ x: event.clientX, y: event.clientY, entry: null, directoryUri });
	}

	function postForSelection(type: 'setClipboard' | 'copyPath' | 'delete', option?: 'cut' | 'copy' | boolean) {
		const uris = contextMenu?.directoryUri ? [contextMenu.directoryUri] : selection.selectedEntries.map(entry => entry.uri);
		if (!uris.length) return;
		if (type === 'setClipboard') vscode.postMessage({ type, uris, operation: option as 'cut' | 'copy' });
		if (type === 'copyPath') vscode.postMessage({ type, uris });
		if (type === 'delete') vscode.postMessage({ type, uris, permanent: Boolean(option) });
	}

	function copyPath(uri?: string) {
		if (uri) {
			vscode.postMessage({ type: 'copyPath', uris: [uri] });
			return;
		}
		postForSelection('copyPath');
	}

	function renameSelected() {
		const uri = contextMenu?.directoryUri ?? (selection.selectedEntries.length === 1 ? selection.selectedEntries[0].uri : undefined);
		if (uri) vscode.postMessage({ type: 'rename', uri });
	}

	function paste(destinationUri = currentUri) {
		if (!hasClipboardEntry || archiveOperation) return;
		const operationId = crypto.randomUUID();
		setArchiveOperation({ id: operationId, kind: cutUris.size ? 'cut' : 'copy', cancelling: false, percent: 0, detail: 'Starting...' });
		vscode.postMessage({ type: 'paste', operationId, destinationUri });
	}

	function createDirectory(parentUri = currentUri) {
		vscode.postMessage({ type: 'createDirectory', parentUri });
	}

	function createFile(parentUri = currentUri) {
		vscode.postMessage({ type: 'createFile', parentUri });
	}

	function openFolder(type: 'openInCurrentWindow' | 'openInNewTab' | 'openInNewWindow' | 'openInTerminal') {
		const entry = contextMenu?.entry;
		vscode.postMessage({ type, uri: contextMenu?.directoryUri ?? (entry?.type === 'directory' ? entry.uri : currentUri) });
	}

	function startArchive(kind: 'compress' | 'extract', targets = contextMenu?.directoryUri
		? [{ name: '', uri: contextMenu.directoryUri, type: 'directory' as const, size: 0, created: 0, modified: 0 }]
		: selection.selectedEntries) {
		if (archiveOperation || !targets.length) return;
		const operationId = crypto.randomUUID();
		setArchiveOperation({ id: operationId, kind, cancelling: false, percent: 0, detail: 'Starting...' });
		if (kind === 'compress') {
			vscode.postMessage({ type: 'compress', operationId, uris: targets.map(entry => entry.uri), destinationUri: currentUri });
		} else {
			vscode.postMessage({ type: 'extract', operationId, uri: targets[0].uri });
		}
	}

	function calculateSize(entry: FileEntry, all: boolean) {
		const targets = all
			? entries.filter(item => item.type === 'directory' && item.calculatedSize === undefined && !item.calculating)
			: [entry];
		const targetUris = new Set(targets.map(item => item.uri));
		setEntries(current => current.map(item => targetUris.has(item.uri) ? { ...item, calculating: true, calculationError: undefined } : item));
		targets.forEach(item => vscode.postMessage({ type: 'calculateDirectorySize', uri: item.uri }));
	}

	function calculateAllFolderSizes() {
		const entry = entries.find(item => item.type === 'directory' && item.calculatedSize === undefined && !item.calculating);
		if (entry) calculateSize(entry, true);
	}

	const onMessage = useEffectEvent(({ data: message }: MessageEvent<ExtensionMessage>) => {
			if (message.type === 'directory') {
				const pathNavigation = pendingPathNavigationRef.current;
				const nextHistory = pathNavigation && message.currentUri !== currentUri ? [...history, currentUri] : history;
				const pendingSelectionUris = pendingSelectionUrisRef.current;
				const nextSelectedUris = pendingSelectionUris
					? new Set(message.entries.filter(entry => pendingSelectionUris.includes(entry.uri)).map(entry => entry.uri))
					: new Set<string>();
				const scrollUri = message.entries.find(entry => pendingSelectionUris?.includes(entry.uri))?.uri;
				setRootUri(message.rootUri);
				setCurrentUri(message.currentUri);
				setEntries(message.entries);
				selection.selectUris(nextSelectedUris);
				pendingScrollUriRef.current = scrollUri ?? null;
				pendingSelectionUrisRef.current = null;
				pendingPathNavigationRef.current = false;
				setStatus('');
				if (pathNavigation) setHistory(nextHistory);
				persist(message.currentUri, nextHistory);
			} else if (message.type === 'archiveProgress') {
				setArchiveOperation(current => current?.id === message.operationId && !current.cancelling
					? { ...current, percent: Math.max(0, Math.min(100, message.percent)), detail: message.detail }
					: current);
			} else if (message.type === 'pasteProgress') {
				setArchiveOperation(current => current?.id === message.operationId && !current.cancelling
					? { ...current, kind: message.operation, percent: Math.max(0, Math.min(100, message.percent)), detail: message.detail }
					: current);
			} else if (message.type === 'createdDirectory' || message.type === 'createdFile' || message.type === 'pasted') {
				if (message.type === 'pasted') {
					setArchiveOperation(current => current?.id === message.operationId ? null : current);
					pendingSelectionUrisRef.current = message.uris;
					requestDirectory(message.destinationUri, true);
				} else {
					pendingSelectionUrisRef.current = [message.uri];
					requestDirectory(message.parentUri, true);
				}
			} else if (message.type === 'deleted' || message.type === 'renamed') {
				requestDirectory(currentUri, false);
			} else if (message.type === 'compressed' || message.type === 'extracted') {
				setArchiveOperation(current => current?.id === message.operationId ? null : current);
				requestDirectory(currentUri, false);
			} else if (message.type === 'archiveCancelled' || message.type === 'archiveDismissed' || message.type === 'pasteCancelled') {
				setArchiveOperation(current => current?.id === message.operationId ? null : current);
			} else if (message.type === 'clipboardChanged') {
				setHasClipboardEntry(message.hasEntry);
				setCutUris(new Set(message.operation === 'cut' ? message.uris : []));
			} else if (message.type === 'favoritesChanged') {
				setFavoriteUris(message.favorites);
			} else if (message.type === 'directorySize') {
				setEntries(current => current.map(entry => entry.uri === message.uri
					? { ...entry, calculating: false, calculatedSize: message.size, calculationError: undefined }
					: entry));
			} else if (message.type === 'directorySizeError') {
				setEntries(current => current.map(entry => entry.uri === message.uri ? { ...entry, calculating: false, calculationError: message.message } : entry));
			} else if (message.type === 'error') {
				if (pendingPathNavigationRef.current) setPathInputOpen(true);
				pendingPathNavigationRef.current = false;
				if (message.operationId) setArchiveOperation(current => current?.id === message.operationId ? null : current);
				setStatus(message.message);
			}
	});

	useEffect(() => {
		window.addEventListener('message', onMessage);
		const onFocus = () => vscode.postMessage({ type: 'focusChanged', focused: true });
		const onBlur = () => {
			vscode.postMessage({ type: 'focusChanged', focused: false });
		};
		window.addEventListener('focus', onFocus);
		window.addEventListener('blur', onBlur);
		vscode.postMessage({ type: 'ready', currentUri: initial.currentUri });
		vscode.postMessage({ type: 'focusChanged', focused: document.hasFocus() });
		return () => {
			window.removeEventListener('message', onMessage);
			window.removeEventListener('focus', onFocus);
			window.removeEventListener('blur', onBlur);
		};
	}, []);

	useEffect(() => {
		if (!pendingScrollUriRef.current) return;
		const uri = pendingScrollUriRef.current;
		pendingScrollUriRef.current = null;
		const entryIndex = entries.findIndex(entry => entry.uri === uri);
		const container = document.querySelector<HTMLElement>('[data-file-list]');
		if (entryIndex >= 0 && container) {
			container.scrollTop = Math.max(0, entryIndex * 32 - (container.clientHeight - 32) / 2);
		}
		let scrollFrame = 0;
		const renderFrame = requestAnimationFrame(() => {
			scrollFrame = requestAnimationFrame(() => {
				document.querySelector(`[data-uri="${CSS.escape(uri)}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
			});
		});
		return () => {
			cancelAnimationFrame(renderFrame);
			cancelAnimationFrame(scrollFrame);
		};
	}, [entries]);

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				event.preventDefault();
				setPathInputOpen(false);
				setSearchOpen(false);
				setSearchQuery('');
				setContextMenu(null);
				selection.clearSelection();
				return;
			}
			const target = event.target as HTMLElement;
			const key = event.key.toLowerCase();
			const searchShortcut = (event.metaKey || event.ctrlKey) && !event.altKey && key === 'f';
			if (target.matches('input, textarea, [contenteditable="true"]') && !searchShortcut) return;
			if ((event.metaKey || event.ctrlKey) && !event.altKey) {
				if (key === 'f') { event.preventDefault(); setSearchOpen(true); setPathInputOpen(false); setContextMenu(null); }
				else if (key === 'a') { event.preventDefault(); selection.selectUris(entries.map(entry => entry.uri)); }
				else if (key === 'x' && selection.selectedEntries.length) { event.preventDefault(); postForSelection('setClipboard', 'cut'); }
				else if (key === 'c' && selection.selectedEntries.length) { event.preventDefault(); postForSelection('setClipboard', 'copy'); }
				else if (key === 'r') { event.preventDefault(); requestDirectory(currentUri, false); }
				else if (key === 'v' && hasClipboardEntry) { event.preventDefault(); paste(); }
				else if (event.metaKey && event.key === 'Backspace' && selection.selectedEntries.length) { event.preventDefault(); postForSelection('delete', event.shiftKey); }
			} else if (event.altKey && event.key.toLowerCase() === 'c' && (event.metaKey || event.shiftKey) && selection.selectedEntries.length) {
				event.preventDefault(); postForSelection('copyPath');
			} else if (event.key === 'F2' && selection.selectedEntries.length === 1) {
				event.preventDefault(); renameSelected();
			} else if (event.key === 'Delete' && selection.selectedEntries.length) {
				event.preventDefault(); postForSelection('delete', event.shiftKey);
			}
		};
		document.addEventListener('keydown', onKeyDown);
		return () => document.removeEventListener('keydown', onKeyDown);
	}, [entries, selection.selectedUris, hasClipboardEntry, currentUri]);

	return {
		state: { rootUri, currentUri, history, entries, selectedUris: selection.selectedUris, selectedEntries: selection.selectedEntries, favoriteUris, pathInputOpen, searchOpen, searchQuery, hasClipboardEntry, cutUris, contextMenu, archiveOperation, status },
		actions: {
			requestDirectory, navigateBack, navigatePath, navigateQuickLocation, openEntry, selectEntry: selection.selectEntry, clearSelection: selection.clearSelection, showContextMenu, showDirectoryContextMenu,
			closeContextMenu: () => setContextMenu(null), setPathInputOpen, setSearchOpen, setSearchQuery,
			setFavorite: (uri: string, favorite: boolean) => vscode.postMessage({ type: 'setFavorite', uri, favorite }),
			cut: () => postForSelection('setClipboard', 'cut'), copy: () => postForSelection('setClipboard', 'copy'),
			copyPath, delete: (permanent: boolean) => postForSelection('delete', permanent),
			paste, createDirectory, createFile, renameSelected, openFolder, startArchive, calculateSize, calculateAllFolderSizes,
			cancelArchive: () => setArchiveOperation(current => {
				if (!current || current.cancelling) return current;
				vscode.postMessage({ type: 'cancelOperation', operationId: current.id });
				return { ...current, cancelling: true, detail: 'Stopping operation...' };
			})
		}
	};
}

export type FolderViewerModel = ReturnType<typeof useFolderViewer>;