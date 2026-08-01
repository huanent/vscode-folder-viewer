import { useState } from 'react';
import type { FileEntry } from '../types';

export function useSelection(entries: FileEntry[]) {
	const [selectedUris, setSelectedUris] = useState<Set<string>>(new Set());
	const [selectionAnchorUri, setSelectionAnchorUri] = useState<string | null>(null);
	const selectedEntries = entries.filter(entry => selectedUris.has(entry.uri));

	function selectEntry(entry: FileEntry, event: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) {
		if (event.shiftKey && selectionAnchorUri) {
			const anchorIndex = entries.findIndex(item => item.uri === selectionAnchorUri);
			const targetIndex = entries.findIndex(item => item.uri === entry.uri);
			if (anchorIndex >= 0 && targetIndex >= 0) {
				const range = entries.slice(Math.min(anchorIndex, targetIndex), Math.max(anchorIndex, targetIndex) + 1);
				setSelectedUris(new Set(event.metaKey || event.ctrlKey ? [...selectedUris, ...range.map(item => item.uri)] : range.map(item => item.uri)));
			}
		} else if (event.metaKey || event.ctrlKey) {
			const next = new Set(selectedUris);
			next.has(entry.uri) ? next.delete(entry.uri) : next.add(entry.uri);
			setSelectedUris(next);
			setSelectionAnchorUri(entry.uri);
		} else {
			setSelectedUris(new Set([entry.uri]));
			setSelectionAnchorUri(entry.uri);
		}
	}

	function clearSelection() {
		setSelectedUris(new Set());
		setSelectionAnchorUri(null);
	}

	function selectUris(uris: Iterable<string>) {
		const nextSelectedUris = new Set(uris);
		setSelectedUris(nextSelectedUris);
		setSelectionAnchorUri(nextSelectedUris.values().next().value ?? null);
	}

	return {
		selectedUris,
		selectedEntries,
		selectEntry,
		clearSelection,
		selectUris,
		setSelectedUris
	};
}