import { useEffect, useEffectEvent, useRef, useState } from 'react';
import type { ExtensionMessage } from '../../../src/viewer/messages';
import type { ArchiveOperation, ContextMenuState, FavoriteEntry, FileEntry, PersistedState } from '../types';
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
	const [favoriteNames, setFavoriteNames] = useState<Record<string, string>>({});
	const [favoritesOpen, setFavoritesOpen] = useState(false);
	const [hasClipboardEntry, setHasClipboardEntry] = useState(false);
	const [cutUris, setCutUris] = useState<Set<string>>(new Set());
	const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
	const [archiveOperation, setArchiveOperation] = useState<ArchiveOperation | null>(null);
	const pendingSelectionUrisRef = useRef<string[] | null>(null);
	const pendingScrollUriRef = useRef<string | null>(null);
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
		setStatus('Loading...');
		persist(target, nextHistory);
		vscode.postMessage({ type: 'readDirectory', uri: target });
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
		const uris = selection.selectedEntries.map(entry => entry.uri);
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
		if (selection.selectedEntries.length === 1) vscode.postMessage({ type: 'rename', uri: selection.selectedEntries[0].uri });
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

	function openFolder(type: 'openInNewTab' | 'openInNewWindow' | 'openInTerminal') {
		const entry = contextMenu?.entry;
		vscode.postMessage({ type, uri: contextMenu?.directoryUri ?? (entry?.type === 'directory' ? entry.uri : currentUri) });
	}

	function startArchive(kind: 'compress' | 'extract', targets = selection.selectedEntries) {
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
		setEntries(current => current.map(item => targetUris.has(item.uri) ? { ...item, calculating: true } : item));
		targets.forEach(item => vscode.postMessage({ type: 'calculateDirectorySize', uri: item.uri }));
	}

	const onMessage = useEffectEvent(({ data: message }: MessageEvent<ExtensionMessage>) => {
			if (message.type === 'directory') {
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
				setStatus('');
				persist(message.currentUri, history);
			} else if (message.type === 'archiveProgress') {
				setArchiveOperation(current => current?.id === message.operationId && !current.cancelling
					? { ...current, percent: Math.max(0, Math.min(100, message.percent)), detail: message.detail }
					: current);
			} else if (message.type === 'pasteProgress') {
				setArchiveOperation(current => current?.id === message.operationId && !current.cancelling
					? { ...current, kind: message.operation, percent: Math.max(0, Math.min(100, message.percent)), detail: message.detail }
					: current);
			} else if (['createdDirectory', 'deleted', 'pasted', 'renamed'].includes(message.type)) {
				if (message.type === 'pasted') {
					setArchiveOperation(current => current?.id === message.operationId ? null : current);
					pendingSelectionUrisRef.current = message.uris;
				}
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
				setFavoriteUris(message.favorites.map(favorite => favorite.uri));
				setFavoriteNames(Object.fromEntries(message.favorites.flatMap(favorite => favorite.name ? [[favorite.uri, favorite.name]] : [])));
			} else if (message.type === 'directorySize') {
				setEntries(current => current.map(entry => entry.uri === message.uri
					? { ...entry, calculating: false, calculatedSize: message.size }
					: entry));
			} else if (message.type === 'directorySizeError') {
				setEntries(current => current.map(entry => entry.uri === message.uri ? { ...entry, calculating: false } : entry));
				setStatus(message.message);
			} else if (message.type === 'error') {
				if (message.operationId) setArchiveOperation(current => current?.id === message.operationId ? null : current);
				setStatus(message.message);
			}
	});

	useEffect(() => {
		window.addEventListener('message', onMessage);
		const onFocus = () => vscode.postMessage({ type: 'focusChanged', focused: true });
		const onBlur = () => vscode.postMessage({ type: 'focusChanged', focused: false });
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
		const frame = requestAnimationFrame(() => {
			document.querySelector(`[data-uri="${CSS.escape(uri)}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
		});
		return () => cancelAnimationFrame(frame);
	}, [entries]);

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				event.preventDefault();
				setContextMenu(null);
				setFavoritesOpen(false);
				selection.clearSelection();
				return;
			}
			if ((event.metaKey || event.ctrlKey) && !event.altKey) {
				const key = event.key.toLowerCase();
				if (key === 'a') { event.preventDefault(); selection.selectUris(entries.map(entry => entry.uri)); }
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
		state: { rootUri, currentUri, history, entries, selectedUris: selection.selectedUris, selectedEntries: selection.selectedEntries, favoriteUris, favoriteNames, favoritesOpen, hasClipboardEntry, cutUris, contextMenu, archiveOperation, status },
		actions: {
			requestDirectory, navigateBack, openEntry, selectEntry: selection.selectEntry, clearSelection: selection.clearSelection, showContextMenu, showDirectoryContextMenu,
			closeContextMenu: () => setContextMenu(null), setFavoritesOpen,
			setFavorite: (uri: string, favorite: boolean) => vscode.postMessage({ type: 'setFavorite', uri, favorite }),
			renameFavorite: (uri: string) => vscode.postMessage({ type: 'renameFavorite', uri }),
			cut: () => postForSelection('setClipboard', 'cut'), copy: () => postForSelection('setClipboard', 'copy'),
			copyPath, delete: (permanent: boolean) => postForSelection('delete', permanent),
			paste, createDirectory, renameSelected, openFolder, startArchive, calculateSize,
			cancelArchive: () => setArchiveOperation(current => {
				if (!current || current.cancelling) return current;
				vscode.postMessage({ type: 'cancelOperation', operationId: current.id });
				return { ...current, cancelling: true, detail: 'Stopping operation...' };
			})
		}
	};
}

export type FolderViewerModel = ReturnType<typeof useFolderViewer>;