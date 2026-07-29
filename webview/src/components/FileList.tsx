import type { MouseEvent } from 'react';
import type { FolderViewerModel } from '../hooks/useFolderViewer';
import { formatDate, formatSize, getFileIcon } from '../lib/formatters';
import type { FileEntry } from '../types';

type FileListProps = Pick<FolderViewerModel, 'state' | 'actions'>;

export function FileList({ state, actions }: FileListProps) {
	return (
		<main
			className="h-[calc(100%-46px)] overflow-auto"
			onClick={event => {
				if (!(event.target as HTMLElement).closest('[role="option"]')) actions.clearSelection();
			}}
			onContextMenu={event => actions.showContextMenu(event, null)}
		>
			<div className="file-grid sticky top-0 z-2 h-8 border-b border-border bg-app text-xs text-muted">
				<span className="pl-6">Name</span><span>Created</span><span>Modified</span><span className="text-right">Size</span>
			</div>
			<div className="py-1 pb-3" role="listbox" aria-label="Folder contents" aria-multiselectable="true">
				{state.entries.map(entry => (
					<FileRow key={entry.uri} entry={entry} state={state} actions={actions} />
				))}
			</div>
			{state.entries.length === 0 && !state.status && <div className="py-11 text-center text-muted">This folder is empty.</div>}
			{state.status && <div className="py-11 text-center text-muted" role="status" aria-live="polite">{state.status}</div>}
		</main>
	);
}

function FileRow({ entry, state, actions }: { entry: FileEntry } & FileListProps) {
	const selected = state.selectedUris.has(entry.uri);
	const cut = state.cutUris.has(entry.uri);
	const classes = selected
		? 'bg-inactive-selection text-inactive-selection-foreground focus-within:bg-selection focus-within:text-selection-foreground'
		: 'hover:bg-hover hover:text-hover-foreground';

	return (
		<div
			className={`file-grid h-8 cursor-default rounded-sm ${classes} ${cut ? 'opacity-50' : ''}`}
			role="option"
			aria-selected={selected}
			tabIndex={0}
			title={entry.name}
			onClick={event => actions.selectEntry(entry, event)}
			onDoubleClick={() => actions.openEntry(entry)}
			onKeyDown={event => {
				if (event.key === 'Enter' && state.selectedEntries.length === 1) {
					event.preventDefault();
					actions.renameSelected();
				}
			}}
			onContextMenu={event => actions.showContextMenu(event, entry)}
		>
			<div className="flex min-w-0 items-center gap-2">
				<i className={`codicon ${entry.type === 'directory' ? 'codicon-folder text-folder' : `${getFileIcon(entry.name)} text-file`} shrink-0 text-base ${selected ? 'text-inherit!' : ''}`} />
				<span className="overflow-hidden text-ellipsis whitespace-nowrap">{entry.name}</span>
			</div>
			<span className={`entry-created overflow-hidden text-xs text-ellipsis whitespace-nowrap ${selected ? 'text-inherit' : 'text-muted'}`}>{formatDate(entry.created)}</span>
			<span className={`entry-modified overflow-hidden text-xs text-ellipsis whitespace-nowrap ${selected ? 'text-inherit' : 'text-muted'}`}>{formatDate(entry.modified)}</span>
			<EntrySize entry={entry} selected={selected} onCalculate={(event) => actions.calculateSize(entry, event.metaKey || event.ctrlKey)} />
		</div>
	);
}

function EntrySize({ entry, selected, onCalculate }: { entry: FileEntry; selected: boolean; onCalculate: (event: MouseEvent) => void }) {
	if (entry.type === 'file') {
		return <span className={`entry-size overflow-hidden text-right text-xs text-ellipsis whitespace-nowrap ${selected ? 'text-inherit' : 'text-muted'}`}>{formatSize(entry.size)}</span>;
	}
	if (entry.calculatedSize !== undefined) {
		return <span className={`entry-size overflow-hidden text-right text-xs text-ellipsis whitespace-nowrap ${selected ? 'text-inherit' : 'text-muted'}`}>{formatSize(entry.calculatedSize)}</span>;
	}
	const label = entry.calculating ? 'Calculating folder size' : 'Calculate folder size (Command/Ctrl+click calculates all folders)';
	return (
		<span className={`entry-size flex justify-end ${selected ? 'text-inherit' : 'text-muted'}`}>
			<button
				type="button"
				title={label}
				aria-label={label}
				disabled={entry.calculating}
				className="grid size-5 cursor-pointer place-items-center rounded-sm border-0 bg-transparent p-0 text-inherit hover:not-disabled:bg-toolbar-hover focus-visible:outline focus-visible:-outline-offset-1 focus-visible:outline-focus disabled:cursor-default"
				onClick={event => { event.stopPropagation(); onCalculate(event); }}
				onDoubleClick={event => event.stopPropagation()}
			>
				<i className={`codicon ${entry.calculating ? 'codicon-loading codicon-modifier-spin' : 'codicon-refresh'}`} />
			</button>
		</span>
	);
}